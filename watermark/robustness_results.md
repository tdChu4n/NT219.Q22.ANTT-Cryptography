# Watermark Robustness Results

Benchmark cho task T4.6: detect watermark và đo robustness với re-encode, crop, blur, rotate.

- Input: `watermark/test-assets/sample_wm_robust.mp4`
- Sidecar: `watermark/test-assets/sample_wm_robust.mp4.wm.json`
- Threshold detected: bit recall >= 75%
- Precision: TP / (TP + FP) trên tập candidate user; `N/A` nghĩa là không candidate nào vượt threshold.

| Attack | Transform | Bit recall (%) | Detected | Precision (%) | False positives | Best user | Best recall (%) |
|---|---|---:|---|---:|---:|---|---:|
| original | Không biến đổi (control) | 100.00 | yes | 100.00 | 0 | `user-24520228` | 100.00 |
| reencode-crf23 | Tái nén H.264 CRF 23 | 100.00 | yes | 100.00 | 0 | `user-24520228` | 100.00 |
| crop-4pct-resize | Crop giữa 4% rồi resize về kích thước gốc | 48.83 | no | N/A | 0 | `user-fake-01` | 53.91 |
| blur-sigma1 | Gaussian blur sigma=1 | 100.00 | yes | 100.00 | 0 | `user-24520228` | 100.00 |
| rotate-2deg | Xoay 2 độ, giữ canvas gốc | 48.83 | no | N/A | 0 | `user-fake-01` | 53.91 |

## Nhận xét

- Re-encode/blur nhẹ thường vẫn đọc được nhờ vote qua nhiều block và nhiều frame.
- Crop/rotate làm lệch lưới block 8x8 nên detector cơ bản có thể giảm mạnh recall.
- Để chống crop/rotate tốt hơn cần thêm bước đồng bộ hình học (anchor, feature matching hoặc grid search).
