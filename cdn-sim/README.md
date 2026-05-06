# CDN-SIM · Nginx Edge phục vụ Video Segment

> Task **T1.6 — Hardening nginx**: Range request, `gzip off` cho `.m4s`, chuẩn bị TLS.
> Acceptance: `nginx.conf` cập nhật + `curl Range OK`.

---

## 1. Vai trò

`cdn-sim` mô phỏng một **Edge/CDN node** phục vụ:

| Đường dẫn | Nội dung | Ghi chú |
|---|---|---|
| `/video/*.m4s`, `.mp4`, `.ts` | Segment video đã mã hoá CENC | Immutable, cache 30 ngày |
| `/video/*.mpd`, `.m3u8` | Manifest DASH / HLS | **Không cache** |
| `/license` | Proxy sang `license-server:3000` | `Cache-Control: no-store` |
| `/healthz` | Health check | Trả 200 `ok` |

---

## 2. Những thay đổi của Task T1.6

### 2.1 Byte-Range request (`curl Range OK`)

Shaka Player / dash.js / hls.js **luôn** gửi `Range: bytes=a-b` để seek/tua video.
Nginx đã hỗ trợ Range gốc cho file tĩnh, nhưng nginx.conf được gia cố thêm:

- `add_header Accept-Ranges "bytes" always;` — public rõ ràng để player tự tin gửi Range.
- `max_ranges 100;` — chặn **multipart Range DoS** (attacker gửi hàng ngàn khoảng Range để ép Nginx đọc rải rác).
- `expose_headers Content-Range, Accept-Ranges` trong CORS — để JavaScript player đọc được.
- Log format in kèm `$http_range` → dễ debug khi player tua.

Kiểm tra nhanh:

```bash
curl -I -H "Range: bytes=0-1023" http://localhost:8080/video/seg_001.m4s
# HTTP/1.1 206 Partial Content
# Content-Range: bytes 0-1023/5242880
# Accept-Ranges: bytes
# Cache-Control: public, max-age=2592000, immutable
```

### 2.2 `gzip off` cho `.m4s` (và các video type)

**Tại sao?**

1. Segment video (H.264/H.265 trong fMP4) **đã được nén bởi codec** — gzip thêm chỉ ~0-1% nhưng tốn CPU.
2. Gzip làm **Content-Length bị re-compute**, có thể **phá vỡ Range request** (gzip + Range là cấu hình xung khắc trong nhiều phiên bản Nginx).
3. Segment đã mã hoá AES-CTR → entropy cao → gzip **không nén được** (ciphertext nhìn như ngẫu nhiên).

Cấu hình: `gzip on` toàn cục cho text (manifest JSON/XML/CSS), nhưng `gzip off; gzip_static off;` trong `location /video/` và location regex `\.(m4s|mp4|m4v|ts)$`.

Kiểm tra:

```bash
curl -I -H "Accept-Encoding: gzip" http://localhost:8080/video/seg_001.m4s | grep -i content-encoding
# (không có header Content-Encoding: gzip → đúng)
```

### 2.3 TLS 1.2 / 1.3 + HSTS + Cert Pinning (đã hoàn tất)

Toàn bộ luồng License (Key) và segment đi qua **TLS 1.3** (TLS 1.2 fallback). `nginx.conf` đã bật chính thức:

- `listen 443 ssl` + `http2 on`, chỉ chấp nhận `TLSv1.2 / TLSv1.3` (chặn POODLE/BEAST/Heartbleed).
- Cipher suite chỉ gồm **AEAD** (`AES-GCM`, `ChaCha20-Poly1305`) với ECDHE forward-secrecy. TLS 1.3 ciphers được pin qua `ssl_conf_command`.
- **HSTS** `max-age=31536000; includeSubDomains` trên mọi response HTTPS — sau lần truy cập đầu, browser tự ép HTTPS cho 1 năm.
- **Cert pinning header** `X-CDN-Cert-Pin: sha256-<base64-spki>` (RFC 7469) — Player browser kiểm tra giá trị này so với danh sách hardcode trong `player/src/config/certPins.ts` để fail-fast khi MITM.
- Hardening header phụ: `X-Content-Type-Options nosniff`, `Referrer-Policy no-referrer`, `X-Frame-Options DENY`.

`entrypoint.sh` được container chạy ở PID 1: tự tính SPKI SHA-256 từ cert đang mount, sinh `/etc/nginx/conf.d/00-cert-pin.conf` với biến `$cdn_cert_pin`. Nếu host KHÔNG mount cert, entrypoint sinh cert tạm 30 ngày để nginx vẫn boot HTTPS — log sẽ ghi rõ `(ephemeral)`.

**Kích hoạt TLS (full flow):**

```bash
# 1. Sinh self-signed cert + xuất pin SHA-256
cd cdn-sim
bash gen-selfsigned-cert.sh          # → certs/fullchain.pem, privkey.pem, pin.sha256.txt
# Windows:
pwsh -File gen-selfsigned-cert.ps1

# 2. Copy pin từ pin.sha256.txt vào player/src/config/certPins.ts
cat certs/pin.sha256.txt
# → sha256-<base64> ; paste vào CDN_CERT_PIN_CONFIG.pins

# 3. Build & up cdn-sim
docker compose -f ../infra/docker-compose.yml up -d --build cdn-sim

# 4. Verify TLS + HSTS + pin header
bash test-tls.sh
# ✅ T1.6 TLS PASS — HTTPS sẵn sàng + cert pin hoạt động.

# 5. Quick curl
curl -kI https://localhost:8443/healthz
# HTTP/2 200
# strict-transport-security: max-age=31536000; includeSubDomains
# x-cdn-cert-pin: sha256-...
```

**Cách Player verify pin:**

`player/src/security/certPinning.ts` đăng ký response filter trên Shaka NetworkingEngine. Mọi response từ origin trong `pinnedOrigins` (cdn-sim HTTPS) đều được kiểm header `X-CDN-Cert-Pin` so với pin hardcode. 3 chế độ:

| Mode | Hành vi khi mismatch |
|---|---|
| `off` | Bỏ qua — dùng khi disable PoC. |
| `warn` | Log cảnh báo, vẫn cho phát (mặc định dev). |
| `enforce` | Throw → Shaka coi là network error → fail manifest/segment/license. |

Production: chuyển `mode: 'enforce'` trước khi build prod. Browser đã validate cert qua OS trust store, pin là **lớp 2** chống cert giả mạo dù attacker có CA hợp lệ.

### 2.4 Gia cố phụ (bonus)

| Hạng mục | Giá trị |
|---|---|
| `server_tokens off` | Ẩn phiên bản Nginx trong header/error page |
| CORS đầy đủ | `Access-Control-Allow-Origin/Methods/Headers/Expose-Headers` cho EME player |
| Preflight `OPTIONS` | Trả 204 ngắn gọn, không chạm disk |
| `sendfile on` + `tcp_nopush on` | Tối ưu throughput file lớn |
| `multi_accept on` | Xử lý nhiều connection mới mỗi vòng event loop |
| Health check Docker | `HEALTHCHECK` gọi `/healthz` |

---

## 3. Chạy & kiểm thử

```bash
# Build + khởi động stack
cd infra
docker compose up -d --build cdn-sim

# Kiểm tra Range + gzip off + CORS
cd ../cdn-sim
bash test-range.sh
# => ✅ T1.6 PASS — curl Range OK, gzip off, TLS sẵn sàng.
```

Biến môi trường:

- `HOST=http://localhost:8080` (mặc định)
- `SEG=/video/seg_001.m4s` (đường dẫn segment để test)

---

## 4. Liên kết với luồng mật mã

| Lớp bảo vệ (README gốc) | Đóng góp của `cdn-sim` |
|---|---|
| Lớp 1 — Segmentation | Chỉ serve `.m4s/.mpd`, **không có endpoint file hoàn chỉnh** |
| Lớp 2 — Mã hoá segment | Phục vụ ciphertext — `gzip off` không làm rò rỉ entropy |
| Lớp 3 — Streaming buffer | Range request chuẩn → player tải đủ theo buffer, không cần tải hết |
| Lớp 4 — Bảo vệ Key | `/license` proxy qua TLS + `Cache-Control: no-store` → không lưu Key ở cache trung gian |

---

## 5. Next steps (sprint sau)

- [ ] Bổ sung rate-limit (`limit_req_zone`) chống scraping segment hàng loạt.
- [ ] Tích hợp **Signed URL / Signed Cookie** (HMAC-SHA256) cho `/video/*.m4s`.
- [ ] Thay self-signed bằng cert nội bộ CA của trường / Let's Encrypt ACME.
- [ ] Bật HTTP/3 (QUIC) khi lên production để giảm latency khởi đầu.
- [ ] Pin rotation: thêm endpoint `/.well-known/cert-pins.json` để Player tải dynamic.
- [ ] Tự động drop port 80 ở edge LB (Cloudflare/AWS ALB) thay vì chỉ rely HSTS.
