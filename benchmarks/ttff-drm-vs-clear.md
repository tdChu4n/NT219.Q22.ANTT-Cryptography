# T5.5 — Benchmark TTFF: DRM vs No-DRM

## Mục tiêu

Đo **Time-To-First-Frame (TTFF)** để so sánh ảnh hưởng thực tế của DRM lên
trải nghiệm phát video.

- **DRM scenario**: DASH CENC + Widevine.
- **Clear scenario**: DASH clear (không EME/license).

## Cách đo

Player đã được instrument để log TTFF khi frame đầu tiên xuất hiện:

```text
TTFF DRM · 1287ms · Sintel · Widevine L3 (Demo EME)
TTFF CLEAR · 702ms · Angel One (Shaka clear)
```

### Quy trình đo thủ công

1. Chạy `license-server` + Nginx CDN theo `docs/run-server.md` (local hoặc VM).
2. Chạy player local:

```bash
cd player
npm install
npm run dev
```

3. Mở `http://localhost:5173`.
4. Chọn manifest DRM, reload 10 lần (hoặc hơn), ghi lại TTFF.
5. Chọn manifest clear, lặp lại 10 lần.
6. Ghi dữ liệu vào CSV:

```csv
scenario,ttff_ms
drm,1382
clear,764
```

7. Tổng hợp:

```bash
node benchmarks/ttff-summary.js benchmarks/ttff-samples.csv
```

## Kết quả mẫu (local demo)

Kết quả dưới đây lấy từ file mẫu `benchmarks/ttff-samples.csv`:

- DRM avg: ~`1352.2 ms`
- CLEAR avg: ~`722.8 ms`
- Chênh lệch trung bình: ~`629.4 ms` (`~1.87x`)

> Ghi chú: số liệu thật phụ thuộc máy, browser profile, cache, và mạng.

## Kết luận

- DRM làm tăng TTFF vì thêm bước EME + license request + CDM setup.
- Với demo local, overhead vẫn nằm trong ngưỡng chấp nhận được cho UX
  (sub-2s ở cả hai kịch bản).
- Nên báo cáo cả p50/p95 thay vì chỉ avg để phản ánh độ ổn định.
