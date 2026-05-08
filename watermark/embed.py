"""watermark/embed.py — Forensic watermark embedder (DCT mid-frequency).

Đồ án NT219 — task T4.5 (README §E7).

Mục tiêu
--------
Nhúng `User ID` (định danh người dùng) vào kênh luminance (Y) của ảnh/video
trong miền tần số trung bình của DCT 8x8, theo sơ đồ Koch–Zhao.

Chống chịu cơ bản:
    * Tái nén JPEG/H.264 ở bitrate vừa.
    * Co/giãn, làm mờ nhẹ (tuỳ Δ).
Không bền:
    * Quay lén có cropping mạnh + reencode bitrate thấp.
    * Tấn công collusion (nhiều bản watermark khác nhau).

Sơ đồ
-----
1. payload_bits = HMAC-SHA256(SECRET, user_id) → 256 bit (mặc định).
2. Ảnh → YCrCb. Lấy kênh Y, chia thành block 8x8 không chồng lấn.
3. Sinh permutation block bằng PRNG seed = HMAC(SECRET, user_id || "blocks").
4. Mỗi bit nhúng dư thừa vào `redundancy` block → robust khi 1 vài block
    bị tái nén phá hỏng (detector dùng majority vote).
5. Trong mỗi block đã chọn:
        - DCT-II 2D (cv2.dct).
        - Lấy cặp hệ số tần số trung bình (3,4) và (4,3).
        - Bit = 1  ⇒ ép  C(3,4) − C(4,3) ≥ +Δ
        - Bit = 0  ⇒ ép  C(3,4) − C(4,3) ≤ −Δ
        - IDCT, lưu lại block trong kênh Y.
6. Y' + Cr + Cb → BGR → output.

Sidecar JSON đi kèm output (dùng cho `detect.py` ở task T4.6):
{
    "scheme": "dct-koch-zhao-v1",
    "user_id": "...",
    "payload_hex": "...",
    "payload_bits": 256,
    "redundancy": 16,
    "strength": 12.0,
    "coefs": [[3,4],[4,3]],
    "block_size": 8,
    "block_seed_hex": "...",   # seed 32 bytes cho permutation
    "input": "ingest/input/sample.mp4",
    "output": "watermark/test-assets/sample_wm.mp4",
    "frames_total": 1,
    "frames_watermarked": [0,30,...],
    "fps": 30.0,
    "size": [1920,1080]
}

Cách chạy
---------
# Watermark 1 ảnh PNG/JPG
python embed.py \
    --in  watermark/test-assets/sample_frame.png \
    --out watermark/test-assets/sample_frame_wm.png \
    --user-id user-24520228 --strength 14

# Watermark 60 frame đầu của sample.mp4 (mỗi 5 frame nhúng 1 lần)
python embed.py \
    --in  ingest/input/sample.mp4 \
    --out watermark/test-assets/sample_wm.mp4 \
    --user-id user-24520228 --frames 60 --frame-stride 5

Lưu ý
-----
* `--secret` không bắt buộc (default = 0xNT219...). Trong production, secret
  này phải lưu trong KMS/HSM, không hard-code.
* Việc encode video bằng OpenCV (mp4v fourcc) chỉ phục vụ PoC. Pipeline
  thật nên gọi FFmpeg để giữ codec/profile mong muốn.
"""

from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path
from typing import Iterable, List, Tuple

import cv2  # type: ignore[import-not-found]
import numpy as np

# --------------------------------------------------------------------------- #
# Config & helpers
# --------------------------------------------------------------------------- #

SCHEME = "dct-koch-zhao-v1"
BLOCK_SIZE = 8
COEF_A: Tuple[int, int] = (3, 4)  # mid-frequency
COEF_B: Tuple[int, int] = (4, 3)
DEFAULT_SECRET = b"NT219-Q22-WATERMARK-DEMO-SECRET"  # demo only
IMG_EXTS = {".png", ".jpg", ".jpeg", ".bmp", ".tif", ".tiff", ".webp"}
VIDEO_EXTS = {".mp4", ".mov", ".mkv", ".avi", ".webm", ".m4v"}


def derive_payload(secret: bytes, user_id: str, n_bits: int = 256) -> bytes:
    """Sinh payload bits = HMAC-SHA256(secret, user_id), cắt còn n_bits."""
    if n_bits % 8 != 0:
        raise ValueError("n_bits phải chia hết cho 8")
    digest = hmac.new(secret, user_id.encode("utf-8"), hashlib.sha256).digest()
    if n_bits <= 256:
        return digest[: n_bits // 8]
    # Mở rộng bằng HKDF-Expand-style nếu cần dài hơn 256 bit
    out = bytearray()
    counter = 0
    prev = b""
    while len(out) < n_bits // 8:
        counter += 1
        prev = hmac.new(
            secret, prev + user_id.encode("utf-8") + bytes([counter]), hashlib.sha256
        ).digest()
        out.extend(prev)
    return bytes(out[: n_bits // 8])


def bytes_to_bits(data: bytes) -> np.ndarray:
    """LSB-first không cần thiết — ta dùng MSB-first để khớp hex dễ đọc."""
    return np.unpackbits(np.frombuffer(data, dtype=np.uint8))


def derive_block_seed(secret: bytes, user_id: str) -> bytes:
    return hmac.new(
        secret, user_id.encode("utf-8") + b"||blocks", hashlib.sha256
    ).digest()


def make_block_permutation(
    n_blocks: int, seed_bytes: bytes, frame_idx: int
) -> np.ndarray:
    """Permutation các chỉ số block, cố định bởi (seed, frame_idx)."""
    # Đưa seed bytes thành seed 64-bit cho numpy Generator (PCG64)
    h = hashlib.sha256(seed_bytes + frame_idx.to_bytes(4, "big")).digest()
    seed_int = int.from_bytes(h[:8], "big")
    rng = np.random.default_rng(seed_int)
    return rng.permutation(n_blocks)


# --------------------------------------------------------------------------- #
# Core embed primitive
# --------------------------------------------------------------------------- #


def _embed_bit_into_block(block: np.ndarray, bit: int, strength: float) -> np.ndarray:
    """Nhúng 1 bit vào block 8x8 (float32), trả block đã sửa."""
    coef = cv2.dct(block)
    a = float(coef[COEF_A])
    b = float(coef[COEF_B])
    if bit == 1:
        # cần a - b >= +strength
        if (a - b) < strength:
            mid = (a + b) / 2.0
            coef[COEF_A] = mid + strength / 2.0
            coef[COEF_B] = mid - strength / 2.0
    else:
        # cần a - b <= -strength
        if (a - b) > -strength:
            mid = (a + b) / 2.0
            coef[COEF_A] = mid - strength / 2.0
            coef[COEF_B] = mid + strength / 2.0
    return cv2.idct(coef)


def embed_frame(
    frame_bgr: np.ndarray,
    payload_bits: np.ndarray,
    *,
    redundancy: int,
    strength: float,
    block_seed: bytes,
    frame_idx: int,
) -> Tuple[np.ndarray, int]:
    """Nhúng toàn bộ payload_bits vào 1 frame BGR.

    Trả về (frame_wm_bgr, blocks_used).
    """
    if frame_bgr.ndim != 3 or frame_bgr.shape[2] != 3:
        raise ValueError("frame phải là ảnh BGR 3 kênh")

    h, w = frame_bgr.shape[:2]
    bh, bw = h - h % BLOCK_SIZE, w - w % BLOCK_SIZE
    if bh < BLOCK_SIZE or bw < BLOCK_SIZE:
        raise ValueError("Ảnh quá nhỏ so với block 8x8")

    ycc = cv2.cvtColor(frame_bgr[:bh, :bw], cv2.COLOR_BGR2YCrCb)
    y = ycc[..., 0].astype(np.float32)

    n_by = bh // BLOCK_SIZE
    n_bx = bw // BLOCK_SIZE
    n_blocks = n_by * n_bx
    needed = int(payload_bits.size) * redundancy
    if needed > n_blocks:
        raise ValueError(
            f"Không đủ block để nhúng: cần {needed}, có {n_blocks}. "
            "Hãy giảm --redundancy hoặc tăng kích thước ảnh/độ phân giải."
        )

    perm = make_block_permutation(n_blocks, block_seed, frame_idx)
    chosen = perm[:needed]

    blocks_used = 0
    for i, blk_idx in enumerate(chosen):
        bit = int(payload_bits[i // redundancy])
        by = (blk_idx // n_bx) * BLOCK_SIZE
        bx = (blk_idx % n_bx) * BLOCK_SIZE
        block = y[by : by + BLOCK_SIZE, bx : bx + BLOCK_SIZE]
        y[by : by + BLOCK_SIZE, bx : bx + BLOCK_SIZE] = _embed_bit_into_block(
            block, bit, strength
        )
        blocks_used += 1

    np.clip(y, 0.0, 255.0, out=y)
    ycc[..., 0] = y.astype(np.uint8)
    out = cv2.cvtColor(ycc, cv2.COLOR_YCrCb2BGR)

    # nếu ảnh gốc lớn hơn bội số block 8x8, ghép lại phần biên không chỉnh sửa
    if (bh, bw) != frame_bgr.shape[:2]:
        full = frame_bgr.copy()
        full[:bh, :bw] = out
        out = full

    return out, blocks_used


# --------------------------------------------------------------------------- #
# Image / Video pipelines
# --------------------------------------------------------------------------- #


def _save_sidecar(out_path: Path, sidecar: dict) -> Path:
    sc = out_path.with_suffix(out_path.suffix + ".wm.json")
    sc.write_text(json.dumps(sidecar, indent=2, ensure_ascii=False), encoding="utf-8")
    return sc


def embed_image(
    in_path: Path,
    out_path: Path,
    *,
    user_id: str,
    secret: bytes,
    redundancy: int,
    strength: float,
    payload_bits: int,
) -> dict:
    img = cv2.imread(str(in_path), cv2.IMREAD_COLOR)
    if img is None:
        raise FileNotFoundError(f"Không đọc được ảnh: {in_path}")

    payload = derive_payload(secret, user_id, payload_bits)
    bits = bytes_to_bits(payload)
    block_seed = derive_block_seed(secret, user_id)

    t0 = time.perf_counter()
    wm, blocks = embed_frame(
        img,
        bits,
        redundancy=redundancy,
        strength=strength,
        block_seed=block_seed,
        frame_idx=0,
    )
    dt_ms = (time.perf_counter() - t0) * 1000.0

    out_path.parent.mkdir(parents=True, exist_ok=True)
    if not cv2.imwrite(str(out_path), wm):
        raise RuntimeError(f"Ghi ảnh thất bại: {out_path}")

    sidecar = {
        "scheme": SCHEME,
        "kind": "image",
        "user_id": user_id,
        "payload_hex": payload.hex(),
        "payload_bits": payload_bits,
        "redundancy": redundancy,
        "strength": strength,
        "coefs": [list(COEF_A), list(COEF_B)],
        "block_size": BLOCK_SIZE,
        "block_seed_hex": block_seed.hex(),
        "input": str(in_path).replace("\\", "/"),
        "output": str(out_path).replace("\\", "/"),
        "size": [int(img.shape[1]), int(img.shape[0])],
        "blocks_used": int(blocks),
        "embed_time_ms": round(dt_ms, 2),
    }
    sc_path = _save_sidecar(out_path, sidecar)
    print(
        f"[image] {in_path.name} -> {out_path.name} "
        f"({blocks} blocks, {dt_ms:.1f} ms)  sidecar={sc_path.name}"
    )
    return sidecar


class _VideoSink:
    """Abstraction để ghi BGR frame ra file video.

    Ưu tiên ffmpeg subprocess (libx264 -crf 18) — lossy nhẹ, watermark sống sót.
    Fallback OpenCV mp4v nếu ffmpeg không có hoặc người dùng yêu cầu.
    """

    def __init__(self, path: Path, fps: float, size: Tuple[int, int], encoder: str):
        self.path = path
        self.fps = float(fps)
        self.w, self.h = int(size[0]), int(size[1])
        self.encoder = encoder
        self._proc: subprocess.Popen | None = None
        self._vw: cv2.VideoWriter | None = None

        if encoder == "ffmpeg":
            ff = shutil.which("ffmpeg")
            if ff is None:
                raise RuntimeError("Yêu cầu ffmpeg trong PATH cho --video-encoder ffmpeg")
            cmd = [
                ff, "-y", "-hide_banner", "-loglevel", "error",
                "-f", "rawvideo", "-vcodec", "rawvideo",
                "-pix_fmt", "bgr24",
                "-s", f"{self.w}x{self.h}",
                "-r", f"{self.fps}",
                "-i", "-",
                "-c:v", "libx264",
                "-preset", "medium",
                "-crf", "18",
                "-pix_fmt", "yuv420p",
                "-movflags", "+faststart",
                str(path),
            ]
            self._proc = subprocess.Popen(cmd, stdin=subprocess.PIPE)
        elif encoder == "mp4v":
            fourcc = cv2.VideoWriter_fourcc(*"mp4v")
            self._vw = cv2.VideoWriter(str(path), fourcc, self.fps, (self.w, self.h))
            if not self._vw.isOpened():
                raise RuntimeError(f"VideoWriter mp4v không mở được: {path}")
        else:
            raise ValueError(f"encoder không hợp lệ: {encoder}")

    def write(self, frame_bgr: np.ndarray) -> None:
        if self._proc is not None:
            assert self._proc.stdin is not None
            self._proc.stdin.write(np.ascontiguousarray(frame_bgr).tobytes())
        else:
            assert self._vw is not None
            self._vw.write(frame_bgr)

    def close(self) -> None:
        if self._proc is not None:
            assert self._proc.stdin is not None
            self._proc.stdin.close()
            rc = self._proc.wait()
            if rc != 0:
                raise RuntimeError(f"ffmpeg exit code {rc}")
        elif self._vw is not None:
            self._vw.release()


def _resolve_encoder(arg: str) -> str:
    if arg == "auto":
        return "ffmpeg" if shutil.which("ffmpeg") else "mp4v"
    return arg


def embed_video(
    in_path: Path,
    out_path: Path,
    *,
    user_id: str,
    secret: bytes,
    redundancy: int,
    strength: float,
    payload_bits: int,
    max_frames: int | None,
    frame_stride: int,
    encoder: str,
) -> dict:
    cap = cv2.VideoCapture(str(in_path))
    if not cap.isOpened():
        raise FileNotFoundError(f"Không mở được video: {in_path}")

    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    if max_frames:
        total = min(total, max_frames)

    payload = derive_payload(secret, user_id, payload_bits)
    bits = bytes_to_bits(payload)
    block_seed = derive_block_seed(secret, user_id)

    out_path.parent.mkdir(parents=True, exist_ok=True)
    enc = _resolve_encoder(encoder)
    sink = _VideoSink(out_path, fps, (width, height), enc)

    watermarked: List[int] = []
    blocks_total = 0
    t0 = time.perf_counter()

    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if max_frames is not None and idx >= max_frames:
            break
        if (idx % max(frame_stride, 1)) == 0:
            wm, blocks = embed_frame(
                frame,
                bits,
                redundancy=redundancy,
                strength=strength,
                block_seed=block_seed,
                frame_idx=idx,
            )
            watermarked.append(idx)
            blocks_total += blocks
            sink.write(wm)
        else:
            sink.write(frame)
        idx += 1

    cap.release()
    sink.close()
    dt = time.perf_counter() - t0

    sidecar = {
        "scheme": SCHEME,
        "kind": "video",
        "user_id": user_id,
        "payload_hex": payload.hex(),
        "payload_bits": payload_bits,
        "redundancy": redundancy,
        "strength": strength,
        "coefs": [list(COEF_A), list(COEF_B)],
        "block_size": BLOCK_SIZE,
        "block_seed_hex": block_seed.hex(),
        "input": str(in_path).replace("\\", "/"),
        "output": str(out_path).replace("\\", "/"),
        "encoder": enc,
        "fps": float(fps),
        "size": [width, height],
        "frames_total": int(idx),
        "frames_watermarked": watermarked,
        "frame_stride": int(frame_stride),
        "blocks_used_total": int(blocks_total),
        "embed_time_s": round(dt, 3),
        "fps_throughput": round(idx / dt, 2) if dt > 0 else None,
    }
    sc_path = _save_sidecar(out_path, sidecar)
    print(
        f"[video] {in_path.name} -> {out_path.name} | "
        f"{idx} frames, {len(watermarked)} watermarked, "
        f"{dt:.2f}s ({sidecar['fps_throughput']} fps)  sidecar={sc_path.name}"
    )
    return sidecar


# --------------------------------------------------------------------------- #
# CLI
# --------------------------------------------------------------------------- #


def parse_secret(arg: str | None) -> bytes:
    if not arg:
        return DEFAULT_SECRET
    if arg.startswith("hex:"):
        return bytes.fromhex(arg[4:])
    return arg.encode("utf-8")


def detect_kind(path: Path) -> str:
    ext = path.suffix.lower()
    if ext in IMG_EXTS:
        return "image"
    if ext in VIDEO_EXTS:
        return "video"
    raise ValueError(f"Định dạng không hỗ trợ: {ext}")


def main(argv: Iterable[str] | None = None) -> int:
    p = argparse.ArgumentParser(
        prog="watermark.embed",
        description="Nhúng User ID vào DCT tần số trung bình của ảnh/video.",
    )
    p.add_argument("--in", dest="inp", required=True, help="ảnh/video đầu vào")
    p.add_argument("--out", dest="out", required=True, help="đường dẫn xuất")
    p.add_argument("--user-id", required=True, help="User ID (chuỗi định danh)")
    p.add_argument(
        "--secret",
        default=None,
        help="HMAC secret (raw text) hoặc 'hex:..' (default: demo secret)",
    )
    p.add_argument(
        "--strength",
        type=float,
        default=12.0,
        help="Δ giữa 2 hệ số DCT (default 12.0; càng lớn càng bền nhưng càng dễ nhìn)",
    )
    p.add_argument(
        "--redundancy",
        type=int,
        default=16,
        help="Số block trên mỗi bit payload (default 16)",
    )
    p.add_argument(
        "--payload-bits",
        type=int,
        default=256,
        help="Độ dài payload bits (default 256)",
    )
    p.add_argument(
        "--frames",
        type=int,
        default=None,
        help="(video) Giới hạn số frame xử lý",
    )
    p.add_argument(
        "--frame-stride",
        type=int,
        default=1,
        help="(video) Cứ mỗi N frame mới nhúng 1 lần (default 1 = mọi frame)",
    )
    p.add_argument(
        "--video-encoder",
        choices=("auto", "ffmpeg", "mp4v"),
        default="auto",
        help=(
            "(video) backend xuất file: ffmpeg = libx264 -crf 18 (giữ "
            "watermark); mp4v = OpenCV (lượng tử nặng, watermark dễ chết). "
            "auto = ffmpeg nếu có trong PATH, ngược lại mp4v."
        ),
    )

    args = p.parse_args(argv)
    in_path = Path(args.inp)
    out_path = Path(args.out)
    secret = parse_secret(args.secret)
    kind = detect_kind(in_path)

    if kind == "image":
        embed_image(
            in_path,
            out_path,
            user_id=args.user_id,
            secret=secret,
            redundancy=args.redundancy,
            strength=args.strength,
            payload_bits=args.payload_bits,
        )
    else:
        embed_video(
            in_path,
            out_path,
            user_id=args.user_id,
            secret=secret,
            redundancy=args.redundancy,
            strength=args.strength,
            payload_bits=args.payload_bits,
            max_frames=args.frames,
            frame_stride=args.frame_stride,
            encoder=args.video_encoder,
        )
    return 0


if __name__ == "__main__":
    sys.exit(main())
