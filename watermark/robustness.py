"""watermark/robustness.py -- run watermark robustness benchmark.

Tạo các biến thể tấn công cơ bản của video đã watermark rồi chạy
`watermark/detect.py` để đo:

* bit recall của user thật;
* precision khi so với vài user giả;
* false positive count.

Yêu cầu `ffmpeg` trong PATH cho các phép re-encode/filter video.
"""

from __future__ import annotations

import argparse
import csv
import json
import shutil
import subprocess
import sys
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, Sequence

from detect import evaluate_path, result_to_dict
from embed import DEFAULT_SECRET, parse_secret


@dataclass(frozen=True)
class AttackSpec:
    name: str
    description: str
    ffmpeg_args: list[str] | None


def _run(cmd: Sequence[str]) -> None:
    proc = subprocess.run(cmd, check=False)
    if proc.returncode != 0:
        raise RuntimeError(f"Command failed ({proc.returncode}): {' '.join(cmd)}")


def _ffmpeg() -> str:
    ff = shutil.which("ffmpeg")
    if not ff:
        raise RuntimeError("Không tìm thấy ffmpeg trong PATH")
    return ff


def _build_attacks(width: int, height: int) -> list[AttackSpec]:
    """Các attack nhẹ/vừa để minh họa robustness trong PoC."""
    return [
        AttackSpec(
            name="original",
            description="Không biến đổi (control)",
            ffmpeg_args=None,
        ),
        AttackSpec(
            name="reencode-crf23",
            description="Tái nén H.264 CRF 23",
            ffmpeg_args=["-c:v", "libx264", "-preset", "medium", "-crf", "23"],
        ),
        AttackSpec(
            name="crop-4pct-resize",
            description="Crop giữa 4% rồi resize về kích thước gốc",
            ffmpeg_args=[
                "-vf",
                f"crop={int(width * 0.96)}:{int(height * 0.96)}:"
                f"{int(width * 0.02)}:{int(height * 0.02)},scale={width}:{height}",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
            ],
        ),
        AttackSpec(
            name="blur-sigma1",
            description="Gaussian blur sigma=1",
            ffmpeg_args=[
                "-vf",
                "gblur=sigma=1",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
            ],
        ),
        AttackSpec(
            name="rotate-2deg",
            description="Xoay 2 độ, giữ canvas gốc",
            ffmpeg_args=[
                "-vf",
                "rotate=2*PI/180:c=black",
                "-c:v",
                "libx264",
                "-preset",
                "medium",
                "-crf",
                "18",
            ],
        ),
    ]


def _make_attack_video(
    ffmpeg: str,
    input_path: Path,
    output_dir: Path,
    attack: AttackSpec,
) -> Path:
    if attack.ffmpeg_args is None:
        return input_path

    output_path = output_dir / f"{input_path.stem}__{attack.name}.mp4"
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel",
        "error",
        "-i",
        str(input_path),
        "-an",
        *attack.ffmpeg_args,
        "-pix_fmt",
        "yuv420p",
        "-movflags",
        "+faststart",
        str(output_path),
    ]
    _run(cmd)
    return output_path


def _precision_summary(result: dict, true_user_id: str) -> tuple[str, int, bool]:
    true_positive = False
    false_positives = 0
    positives = 0

    for candidate in result["candidates"]:
        if not candidate["detected"]:
            continue
        positives += 1
        if candidate["user_id"] == true_user_id:
            true_positive = True
        else:
            false_positives += 1

    if positives == 0:
        return "N/A", false_positives, true_positive

    precision = (1 if true_positive else 0) / positives
    return f"{precision * 100:.2f}", false_positives, true_positive


def _format_bool(value: bool) -> str:
    return "yes" if value else "no"


def _write_csv(path: Path, rows: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0].keys()))
        writer.writeheader()
        writer.writerows(rows)


def _write_markdown(path: Path, rows: list[dict], *, input_path: Path, sidecar_path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    lines = [
        "# Watermark Robustness Results",
        "",
        "Benchmark cho task T4.6: detect watermark và đo robustness với "
        "re-encode, crop, blur, rotate.",
        "",
        f"- Input: `{input_path.as_posix()}`",
        f"- Sidecar: `{sidecar_path.as_posix()}`",
        "- Threshold detected: bit recall >= 75%",
        "- Precision: TP / (TP + FP) trên tập candidate user; `N/A` nghĩa là "
        "không candidate nào vượt threshold.",
        "",
        "| Attack | Transform | Bit recall (%) | Detected | Precision (%) | False positives | Best user | Best recall (%) |",
        "|---|---|---:|---|---:|---:|---|---:|",
    ]
    for row in rows:
        lines.append(
            "| {attack} | {transform} | {true_bit_recall_pct} | {detected} | "
            "{precision_pct} | {false_positive_count} | `{best_user_id}` | "
            "{best_bit_recall_pct} |".format(**row)
        )
    lines.extend(
        [
            "",
            "## Nhận xét",
            "",
            "- Re-encode/blur nhẹ thường vẫn đọc được nhờ vote qua nhiều block và nhiều frame.",
            "- Crop/rotate làm lệch lưới block 8x8 nên detector cơ bản có thể giảm mạnh recall.",
            "- Để chống crop/rotate tốt hơn cần thêm bước đồng bộ hình học (anchor, feature matching hoặc grid search).",
        ]
    )
    path.write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_robustness(
    input_path: Path,
    sidecar_path: Path,
    *,
    output_dir: Path,
    candidate_user_ids: Sequence[str],
    secret: bytes = DEFAULT_SECRET,
    threshold: float = 0.75,
    max_frames: int | None = None,
) -> tuple[list[dict], Path, Path]:
    sidecar = json.loads(sidecar_path.read_text(encoding="utf-8"))
    true_user_id = str(sidecar["user_id"])
    width, height = [int(x) for x in sidecar["size"]]
    ffmpeg = _ffmpeg()
    output_dir.mkdir(parents=True, exist_ok=True)

    candidates = list(dict.fromkeys([true_user_id, *candidate_user_ids]))
    rows: list[dict] = []

    for attack in _build_attacks(width, height):
        attack_path = _make_attack_video(ffmpeg, input_path, output_dir, attack)
        result = evaluate_path(
            attack_path,
            sidecar_path,
            candidate_user_ids=candidates,
            secret=secret,
            threshold=threshold,
            max_frames=max_frames,
        )
        data = result_to_dict(result)
        true_candidate = next(
            item for item in data["candidates"] if item["user_id"] == true_user_id
        )
        precision_pct, false_positive_count, true_positive = _precision_summary(
            data, true_user_id
        )

        rows.append(
            {
                "attack": attack.name,
                "transform": attack.description,
                "true_bit_recall_pct": f"{true_candidate['bit_recall'] * 100:.2f}",
                "detected": _format_bool(true_positive),
                "precision_pct": precision_pct,
                "false_positive_count": false_positive_count,
                "best_user_id": data["best_user_id"],
                "best_bit_recall_pct": f"{data['best_bit_recall'] * 100:.2f}",
                "output_path": attack_path.as_posix(),
            }
        )

    csv_path = output_dir / "robustness_results.csv"
    md_path = Path("watermark/robustness_results.md")
    _write_csv(csv_path, rows)
    _write_markdown(md_path, rows, input_path=input_path, sidecar_path=sidecar_path)
    return rows, csv_path, md_path


def main(argv: Iterable[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        prog="watermark.robustness",
        description="Benchmark robustness watermark với re-encode/crop/blur/rotate.",
    )
    parser.add_argument("--in", dest="inp", required=True, help="video đã watermark")
    parser.add_argument("--sidecar", required=True, help="file *.wm.json")
    parser.add_argument(
        "--out-dir",
        default="watermark/test-assets/robustness",
        help="thư mục chứa attack outputs + CSV",
    )
    parser.add_argument(
        "--candidate-user-id",
        action="append",
        default=[],
        help="User giả để đo false positive; truyền nhiều lần được",
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
        help="Giới hạn số frame watermark dùng khi detect",
    )

    args = parser.parse_args(argv)
    t0 = time.perf_counter()
    rows, csv_path, md_path = run_robustness(
        Path(args.inp),
        Path(args.sidecar),
        output_dir=Path(args.out_dir),
        candidate_user_ids=args.candidate_user_id
        or ["user-fake-01", "user-fake-02", "user-fake-03"],
        secret=parse_secret(args.secret),
        threshold=args.threshold,
        max_frames=args.max_frames,
    )
    elapsed = time.perf_counter() - t0

    print("[robustness] attack results")
    for row in rows:
        precision = (
            f"{row['precision_pct']}%"
            if row["precision_pct"] != "N/A"
            else "N/A"
        )
        print(
            f"- {row['attack']}: recall={row['true_bit_recall_pct']}% "
            f"detected={row['detected']} precision={precision} "
            f"fp={row['false_positive_count']}"
        )
    print(f"[robustness] csv={csv_path.as_posix()}")
    print(f"[robustness] report={md_path.as_posix()}")
    print(f"[robustness] elapsed={elapsed:.2f}s")
    return 0


if __name__ == "__main__":
    sys.exit(main())
