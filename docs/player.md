# Player (Shaka + React) — Hướng dẫn vận hành

> Phạm vi: Web player phục vụ demo DRM E2E cho NT219.

## 1) Mục tiêu

Player thực thi luồng:

1. Load DASH manifest (`.mpd`).
2. Khởi tạo EME/CDM (`com.widevine.alpha`).
3. Gửi challenge tới endpoint license.
4. Nhận license và phát video đã mã hoá CENC.
5. Ghi log sự kiện + đo metric (license latency, TTFF).

## 2) Chạy local (không Docker)

```bash
cd player
npm install
npm run dev
```

Mặc định mở tại `http://localhost:5173`.

Vite dev proxy:

- `/video` -> `http://localhost:8080`
- `/license` -> `http://localhost:8080`

## 3) Chạy theo mô hình hiện tại (VM/systemd)

Với flow nhóm đang dùng:

- `license-server` chạy bằng `systemd` trên VM app.
- Nginx CDN chạy trên VM edge.
- Player chạy local bằng `npm run dev`.

Khi chạy local player để gọi hạ tầng VM:

- chỉnh `player/vite.config.ts` target proxy về host edge phù hợp,
- hoặc dùng hostname nội bộ đã map DNS/hosts.

## 4) Manifest demo nên dùng

- `Sintel · Widevine L3 (Demo EME)` -> dùng để kiểm tra luồng DRM chuẩn.
- `Angel One (Shaka clear)` -> đối chứng no-DRM.
- `Local cdn-sim · Widevine (HTTP/HTTPS)` -> kiểm tra stack nội bộ.

## 5) Theo dõi metric cho benchmark

Player log tự ghi dòng TTFF sau khi frame đầu xuất hiện:

```text
TTFF DRM · 1287ms · Sintel · Widevine L3 (Demo EME)
```

Kết hợp với panel License:

- `Last License RTT` (độ trễ request license gần nhất).
- `Total Requests`.
- `History` (các request gần đây).

## 6) Checklist demo E2E

1. Chọn manifest DRM (`Sintel Widevine`).
2. Kiểm tra panel License có request `OK`.
3. Kiểm tra Event Log có dòng `TTFF DRM`.
4. Chuyển manifest clear (`Angel One`).
5. Kiểm tra Event Log có dòng `TTFF CLEAR`.
6. So sánh TTFF DRM vs CLEAR (DRM phải cao hơn nhẹ, nhưng không quá lớn).
7. Ghi số liệu vào `benchmarks/ttff-samples.csv` để tổng hợp.

## 7) Lỗi thường gặp

- **DRM fail (code 6001/6007)**: browser chưa có Widevine CDM hoặc endpoint license lỗi.
- **CORS / preflight fail**: gọi license public nhưng gắn custom header không được allow.
- **Không có TTFF log**: video chưa tới trạng thái có frame đầu (chưa play hoặc load lỗi).
