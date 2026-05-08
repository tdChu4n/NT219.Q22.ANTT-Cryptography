# `watermark/` — Forensic Watermarking (DCT mid-frequency)

Module nhúng & dò tìm watermark theo sơ đồ **Koch–Zhao** trên hệ số DCT 8x8
trong miền tần số trung bình. Dùng cho **truy vết người dùng đã rò rỉ video**
(scenario *Analog Hole* — README §7 / §E7).

> Watermarking là **giải pháp giảm thiểu**, không thay thế CENC/AES-CTR/DRM.
> Nó chỉ giúp truy vết khi nội dung đã rò rỉ.

## Cài đặt

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r watermark/requirements.txt
```

## Chạy demo

### 1) Watermark 1 ảnh

```powershell
# extract 1 frame từ video sample (cần ffmpeg trong PATH)
ffmpeg -y -ss 00:00:02 -i ingest/input/sample.mp4 -frames:v 1 `
    watermark/test-assets/sample_frame.png

python watermark/embed.py `
    --in  watermark/test-assets/sample_frame.png `
    --out watermark/test-assets/sample_frame_wm.png `
    --user-id user-24520228 `
    --strength 14 --redundancy 16
```

Kết quả:
- `sample_frame_wm.png` — ảnh đã nhúng watermark.
- `sample_frame_wm.png.wm.json` — sidecar (scheme, payload, seed, …) để
  detector đối chiếu.

### 2) Watermark video (PoC, 60 frame đầu)

```powershell
python watermark/embed.py `
    --in  ingest/input/sample.mp4 `
    --out watermark/test-assets/sample_wm.mp4 `
    --user-id user-24520228 `
    --frames 60 --frame-stride 5 --strength 12
```

`--frame-stride 5`: cứ mỗi 5 frame mới nhúng 1 lần (giảm chi phí, tăng tốc).

`--video-encoder`:

| Giá trị | Hành vi |
|---|---|
| `auto` *(default)* | Dùng `ffmpeg libx264 -crf 18` nếu `ffmpeg` có trong PATH, ngược lại fallback `mp4v`. |
| `ffmpeg` | Bắt buộc dùng ffmpeg (libx264, near-lossless). Watermark sống sót tốt. |
| `mp4v` | OpenCV mp4v fourcc — quantize nặng, watermark thường **chết** sau encode. Chỉ dùng khi không có ffmpeg. |

## Tham số quan trọng

| Tham số | Ý nghĩa | Đánh đổi |
|---|---|---|
| `--strength` Δ | margin giữa C(3,4) và C(4,3) | Δ lớn → bền với re-encode/blur, nhưng dễ thấy artefact |
| `--redundancy` r | mỗi bit payload nhúng vào r block | r lớn → recall tăng (majority vote), nhưng chiếm nhiều block |
| `--payload-bits` | độ dài payload | 256 bit là đủ cho HMAC-SHA256(user_id) |
| `--frame-stride` | (video) chu kỳ nhúng | stride=1 nhúng mọi frame; stride=5 đủ cho PoC |

## Sơ đồ payload

```
secret (KMS)  +  user_id  ──HMAC-SHA256──▶  payload (256 bit)
                                              │
                                              └──▶ broadcast vào DCT blocks
                                                    (redundant r lần)
```

`block_seed = HMAC-SHA256(secret, user_id || "blocks")` — quyết định
thứ tự block được chọn (PRNG seeded). Detector chỉ cần biết `secret +
user_id` (hoặc nhận sidecar JSON) là tái sinh được permutation và đọc bit.

## Sidecar JSON

`embed.py` luôn ghi 1 sidecar `*.wm.json` cạnh output. Nó là input cho
`detect.py` ở task T4.6 (kế tiếp).

## Số đo PoC (sample 1080p)

Cấu hình mặc định: payload 256 bit, redundancy 16, Δ = 12 (video) / 14 (image),
pipeline: `ingest/input/sample.mp4` → 60 frame đầu → `--frame-stride 5`
→ libx264 -crf 18.

| Chỉ tiêu | Giá trị đo được |
|---|---|
| **Imperceptibility (image)** | PSNR ≈ **51.9 dB** — vô hình bằng mắt thường |
| **Throughput embed** | ≈ **41 fps** (1080p, single-thread Python) |
| **Bit recall (per frame, sau libx264 -crf 18)** | trung bình **90.6 %** (12 frame) |
| **Bit recall (aggregate vote 12 frame)** | **256 / 256 = 100 %** |
| **Bit recall (image, không re-encode)** | **256 / 256 = 100 %** |

Vote ngang qua nhiều watermark-frame là chiến lược chính của detector
(`detect.py` ở task T4.6).

## Hạn chế đã biết (tổng hợp cho task T4.7)

- **Re-encode bitrate thấp** (CRF≥30 hoặc x264 preset slower): có thể mất bit
  → cần Δ ≥ 12 và r ≥ 16.
- **Cropping ≥ 25%**: detector cần grid-search vị trí block hoặc có anchor.
- **Collusion** giữa nhiều bản watermark khác nhau cho cùng nội dung
  → cần thêm mã collusion-resistant (e.g. Tardos code).
- **Quay lén analog**: giảm robustness mạnh; cần thêm watermark spread-spectrum.
