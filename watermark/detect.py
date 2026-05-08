"""watermark/detect.py -- DCT forensic watermark detector.

Detector cho watermark do `watermark/embed.py` sinh ra:

* Đọc sidecar `*.wm.json` để biết scheme, payload length, redundancy,
  block_seed, danh sách frame đã nhúng.
* Với mỗi frame/ảnh, chia kênh Y thành block 8x8, DCT từng block được chọn.
* Đọc bit bằng dấu của `C(3,4) - C(4,3)`.
* Vote theo redundancy trong một frame, rồi vote tiếp qua nhiều frame.

Ví dụ:

    python watermark/detect.py ^
      --in watermark/test-assets/sample_wm.mp4 ^
      --sidecar watermark/test-assets/sample_wm.mp4.wm.json ^
      --user-id user-24520228

    python watermark/detect.py ^
      --in watermark/test-assets/sample_wm.mp4 ^
      --sidecar watermark/test-assets/sample_wm.mp4.wm.json ^
      --candidate-user-id user-24520228 ^
      --candidate-user-id user-fake-01
"""

from __future__ import annotations

import argparse
import json
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

import cv2  # type: ignore[import-not-found]
import numpy as np

from embed import (
    COEF_A,
    COEF_B,
    DEFAULT_SECRET,
    IMG_EXTS,
    VIDEO_EXTS,
    bytes_to_bits,
    derive_block_seed,
    derive_payload,
    make_block_permutation,
    parse_secret,
)


@dataclass(frozen=True)
class CandidateResult:
    user_id: str
    bit_recall: float
    hamming_distance: int
    detected: bool
    recovered_hex: str
    expected_hex: str
    confidence: float


@dataclass(frozen=True)
class DetectionResult:
    input_path: str
    sidecar_path: str
    frames_evaluated: list[int]
    frame_count: int
    total_votes_per_bit: int
    candidates: list[CandidateResult]
    best_user_id: str | None
    best_bit_recall: float
    elapsed_ms: float


def _load_sidecar(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    if data.get("scheme") != "dct-koch-zhao-v1":
        raise ValueError(f"Sidecar scheme không hỗ trợ: {data.get('scheme')!r}")
    return data


def _detect_kind(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in IMG_EXTS:
        return "image"
    if ext in VIDEO_EXTS:
        return "video"
    raise ValueError(f"Định dạng không hỗ trợ: {ext}")


def _frame_vote_scores(
    frame_bgr: np.ndarray,
    *,
    sidecar: dict,
    block_seed: bytes,
    frame_idx: int,
) -> np.ndarray:
    """Trả về vector score +/-1 tích lũy theo bit cho một frame."""
    block_size = int(sidecar["block_size"])
    payload_bits = int(sidecar["payload_bits"])
    redundancy = int(sidecar["redundancy"])
    coef_a = tuple(sidecar.get("coefs", [COEF_A, COEF_B])[0])
    coef_b = tuple(sidecar.get("coefs", [COEF_A, COEF_B])[1])

    y = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2YCrCb)[..., 0].astype(np.float32)
    h, w = y.shape
    bh, bw = h - h % block_size, w - w % block_size
    n_by = bh // block_size
    n_bx = bw // block_size
    n_blocks = n_by * n_bx
    needed = payload_bits * redundancy
    if needed > n_blocks:
        raise ValueError(
            f"Không đủ block để detect: cần {needed}, có {n_blocks}. "
            "Ảnh/video có thể đã bị crop/resize quá mạnh."
        )

    perm = make_block_permutation(n_blocks, block_seed, frame_idx)
    chosen = perm[:needed]
    scores = np.zeros(payload_bits, dtype=np.int64)

    for bit_idx in range(payload_bits):
        bit_score = 0
        for rep in range(redundancy):
            blk_idx = int(chosen[bit_idx * redundancy + rep])
            by = (blk_idx // n_bx) * block_size
            bx = (blk_idx % n_bx) * block_size
            block = y[by : by + block_size, bx : bx + block_size]
            coef = cv2.dct(block)
            diff = float(coef[coef_a] - coef[coef_b])
            bit_score += 1 if diff > 0 else -1
        scores[bit_idx] = bit_score

    return scores


def _read_image(path: Path) -> np.ndarray:
    img = cv2.imread(str(path), cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"Không đọc được ảnh: {path}")
    return img


def _read_video_frames(path: Path, frame_indices: Sequence[int]) -> list[tuple[int, np.ndarray]]:
    cap = cv2.VideoCapture(str(path))
    if not cap.isOpened():
        raise FileNotFoundError(f"Không mở được video: {path}")

    frames: list[tuple[int, np.ndarray]] = []
    for idx in frame_indices:
        cap.set(cv2.CAP_PROP_POS_FRAMES, int(idx))
        ok, frame = cap.read()
        if ok:
            frames.append((int(idx), frame))
    cap.release()
    return frames


def _scores_to_candidate_result(
    scores: np.ndarray,
    *,
    user_id: str,
    secret: bytes,
    payload_bits: int,
    threshold: float,
) -> CandidateResult:
    recovered_bits = (scores > 0).astype(np.uint8)
    recovered = np.packbits(recovered_bits).tobytes()
    expected = derive_payload(secret, user_id, payload_bits)
    expected_bits = bytes_to_bits(expected)
    matches = int(np.sum(recovered_bits == expected_bits))
    bit_recall = matches / payload_bits
    hamming_distance = payload_bits - matches
    confidence = float(np.mean(np.abs(scores)) / np.max(np.abs(scores)))

    return CandidateResult(
        user_id=user_id,
        bit_recall=bit_recall,
        hamming_distance=hamming_distance,
        detected=bit_recall >= threshold,
        recovered_hex=recovered.hex(),
        expected_hex=expected.hex(),
        confidence=confidence,
    )


def evaluate_path(
    input_path: Path,
    sidecar_path: Path,
    *,
    candidate_user_ids: Sequence[str] | None = None,
    secret: bytes = DEFAULT_SECRET,
    threshold: float = 0.75,
    max_frames: int | None = None,
) -> DetectionResult:
    """Detect watermark trong ảnh/video và trả kết quả có cấu trúc."""
    t0 = time.perf_counter()
    sidecar = _load_sidecar(sidecar_path)
    kind = _detect_kind(input_path)
    payload_bits = int(sidecar["payload_bits"])

    if candidate_user_ids:
        user_ids = list(dict.fromkeys(candidate_user_ids))
    else:
        user_ids = [str(sidecar["user_id"])]

    # Detector cần seed theo user để tái tạo đúng permutation block.
    # Với nhiều candidate, ta phải đọc score riêng cho từng user.
    frames_evaluated: list[int] = []
    candidate_results: list[CandidateResult] = []

    for user_id in user_ids:
        block_seed = derive_block_seed(secret, user_id)
        aggregate_scores = np.zeros(payload_bits, dtype=np.int64)
        current_frames: list[int] = []

        if kind == "image":
            frame = _read_image(input_path)
            frame_idx = int(sidecar.get("frame_index", 0))
            aggregate_scores += _frame_vote_scores(
                frame, sidecar=sidecar, block_seed=block_seed, frame_idx=frame_idx
            )
            current_frames.append(frame_idx)
        else:
            frame_indices = [int(x) for x in sidecar.get("frames_watermarked", [0])]
            if max_frames is not None:
                frame_indices = frame_indices[:max_frames]
            frames = _read_video_frames(input_path, frame_indices)
            if not frames:
                raise RuntimeError(f"Không đọc được frame watermark nào từ {input_path}")
            for frame_idx, frame in frames:
                aggregate_scores += _frame_vote_scores(
                    frame, sidecar=sidecar, block_seed=block_seed, frame_idx=frame_idx
                )
                current_frames.append(frame_idx)

        if not frames_evaluated:
            frames_evaluated = current_frames
        result = _scores_to_candidate_result(
            aggregate_scores,
            user_id=user_id,
            secret=secret,
            payload_bits=payload_bits,
            threshold=threshold,
        )
        candidate_results.append(result)

    best = max(candidate_results, key=lambda item: item.bit_recall, default=None)
    redundancy = int(sidecar["redundancy"])
    elapsed_ms = (time.perf_counter() - t0) * 1000.0

    return DetectionResult(
        input_path=str(input_path).replace("\\", "/"),
        sidecar_path=str(sidecar_path).replace("\\", "/"),
        frames_evaluated=frames_evaluated,
        frame_count=len(frames_evaluated),
        total_votes_per_bit=len(frames_evaluated) * redundancy,
        candidates=candidate_results,
        best_user_id=best.user_id if best else None,
        best_bit_recall=best.bit_recall if best else 0.0,
        elapsed_ms=elapsed_ms,
    )


def result_to_dict(result: DetectionResult) -> dict:
    return {
        "input": result.input_path,
        "sidecar": result.sidecar_path,
        "frames_evaluated": result.frames_evaluated,
        "frame_count": result.frame_count,
        "total_votes_per_bit": result.total_votes_per_bit,
        "best_user_id": result.best_user_id,
        "best_bit_recall": round(result.best_bit_recall, 6),
        "elapsed_ms": round(result.elapsed_ms, 2),
        "candidates": [
            {
                "user_id": item.user_id,
                "bit_recall": round(item.bit_recall, 6),
                "hamming_distance": item.hamming_distance,
                "detected": item.detected,
                "confidence": round(item.confidence, 6),
                "recovered_hex": item.recovered_hex,
                "expected_hex": item.expected_hex,
            }
            for item in result.candidates
        ],
    }


def _print_human(result: DetectionResult) -> None:
    print(f"[detect] input={result.input_path}")
    print(
        f"[detect] frames={result.frame_count}, "
        f"votes/bit={result.total_votes_per_bit}, "
        f"elapsed={result.elapsed_ms:.1f} ms"
    )
    for item in sorted(result.candidates, key=lambda c: c.bit_recall, reverse=True):
        status = "PASS" if item.detected else "FAIL"
        print(
            f"[{status}] user={item.user_id} "
            f"bit_recall={item.bit_recall * 100:.2f}% "
            f"hamming={item.hamming_distance} "
            f"confidence={item.confidence:.3f}"
        )
    print(
        f"[detect] best={result.best_user_id} "
        f"({result.best_bit_recall * 100:.2f}% recall)"
    )


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="watermark.detect",
        description="Dò watermark DCT mid-frequency từ ảnh/video đã nhúng.",
    )
    parser.add_argument("--in", dest="inp", required=True, help="ảnh/video cần dò")
    parser.add_argument(
        "--sidecar",
        required=True,
        help="file *.wm.json do watermark/embed.py sinh ra",
    )
    parser.add_argument(
        "--user-id",
        help="User ID cần kiểm tra; mặc định lấy user_id trong sidecar",
    )
    parser.add_argument(
        "--candidate-user-id",
        action="append",
        default=[],
        help="Candidate user để test precision; có thể truyền nhiều lần",
    )
    parser.add_argument(
        "--secret",
        default=None,
        help="HMAC secret (raw text) hoặc 'hex:..' (default: demo secret)",
    )
    parser.add_argument(
        "--threshold",
        type=float,
        default=0.75,
        help="Ngưỡng bit recall để coi là detected (default 0.75)",
    )
    parser.add_argument(
        "--max-frames",
        type=int,
        default=None,
        help="Giới hạn số frame watermark dùng để vote (video)",
    )
    parser.add_argument(
        "--json",
        action="store_true",
        help="In JSON thay vì human-readable log",
    )
    parser.add_argument("--json-out", help="Ghi JSON result ra file")

    args = parser.parse_args(argv)
    candidates = list(args.candidate_user_id)
    if args.user_id:
        candidates.insert(0, args.user_id)

    result = evaluate_path(
        Path(args.inp),
        Path(args.sidecar),
        candidate_user_ids=candidates or None,
        secret=parse_secret(args.secret),
        threshold=args.threshold,
        max_frames=args.max_frames,
    )
    data = result_to_dict(result)

    if args.json_out:
        out = Path(args.json_out)
        out.parent.mkdir(parents=True, exist_ok=True)
        out.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")

    if args.json:
        print(json.dumps(data, indent=2, ensure_ascii=False))
    else:
        _print_human(result)

    return 0


if __name__ == "__main__":
    sys.exit(main())
