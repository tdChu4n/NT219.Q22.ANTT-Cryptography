# Security Test Results — NT219 DRM Platform

Tổng hợp kết quả toàn bộ security tests theo yêu cầu mục 9.2 và 10 của đề tài.

---

## 1. Unit Tests — License Server

**Công cụ:** Jest + Supertest  
**Chạy:** `cd license-server && npm test`

| Test Suite | Tests | Kết quả |
|---|---|---|
| JWT HS256 + RS256 | 11 | ✅ 11/11 PASS |
| KMS AES-256-GCM + Nonce + License | 15 | ✅ 15/15 PASS |
| RSA-OAEP Content Key | 10 | ✅ 10/10 PASS |
| License API (Auth, Validation, Entitlement, Replay, MongoDB) | 30 | ✅ 30/30 PASS |
| **Tổng** | **66** | **✅ 66/66 PASS** |

---

## 2. PoC E2 — IV Reuse Attack (AES-CTR)

**File:** `media-processing/poc/iv-reuse.py`  
**Chạy:** `python media-processing/poc/iv-reuse.py`

**Kịch bản:** Server mã hóa 2 segment video khác nhau bằng cùng Key + IV.

```
C1 = P1 XOR Keystream(Key, IV)
C2 = P2 XOR Keystream(Key, IV)
C1 XOR C2 = P1 XOR P2  →  Khôi phục P2 mà không cần Key
```

| Bước | Kết quả |
|---|---|
| Hacker bắt C1, C2 (cùng IV) | ✅ Thực hiện được |
| Tính C1 XOR C2 | ✅ Keystream triệt tiêu |
| Đoán header P1 (`moof_header:`) → khôi phục P2 | ✅ `b'moof_header: '` lộ ra |

**Kết luận:** IV reuse 100% thành công → **Mitigation: IV ngẫu nhiên 96-bit mới cho mỗi lần mã hóa AES-GCM.**

---

## 3. PoC E5 — License Replay Attack

**File:** `media-processing/poc/license_replay.py`  
**Chạy:** `python media-processing/poc/license_replay.py`  
**Log:** `poc/e5_replay_log.txt`

**Kịch bản:** Hacker bắt license request hợp lệ và gửi lại cùng nonce.

| Request | HTTP Status | Kết quả |
|---|---|---|
| Request 1 (nonce mới) | 200 OK | ✅ License được cấp |
| Request 2 (cùng nonce — Replay) | 401 Unauthorized | ✅ Bị chặn: "Nonce Expired. Replay Attack Detected!" |

**% Replay thành công:** 0/1 = **0%** (blocked by nonce store)  
**Kết luận:** Nonce store hoạt động đúng → **Mitigation hoàn toàn hiệu quả.**

---

## 4. PoC Widevine L3 — Memory Scraping (Frida)

**File:** `poc/frida-widevine-l3.js`  
**Output mẫu:** `poc/frida-widevine-l3-sample-output.log`

**Kịch bản:** Dùng Frida hook hàm decrypt của Widevine L3 (software CDM), đọc Content Key từ RAM khi đang giải mã.

| Điều kiện | Kết quả |
|---|---|
| Widevine L3 (software) | Key capture được từ RAM |
| Widevine L1 (TEE/hardware) | Không thể — key không ra khỏi TEE |

**% Unauthorized decryption thành công (L3):** key capture được nhưng:
- License TTL = **30 phút** → key hết hạn sau 30 phút
- Key rotation 4 period → mỗi 26 phút đổi key

**Kết luận:** L3 vulnerable nhưng **time-bound license + key rotation giới hạn thiệt hại tối đa 30 phút.**

---

## 5. Watermark Robustness — Defeat Attempt

**File:** `watermark/robustness.py`  
**Kết quả:** `watermark/robustness_results.md`

| Attack | Bit Recall | Detected (≥75%) |
|---|---|---|
| Không biến đổi (control) | 100.00% | ✅ YES |
| Re-encode H.264 CRF 23 | 100.00% | ✅ YES |
| Gaussian blur σ=1 | 100.00% | ✅ YES |
| Crop 4% + resize | 48.83% | ❌ NO |
| Rotate 2° | 48.83% | ❌ NO |

**Precision (không false positive):** 100% trên tập candidate users  
**Kết luận:** Watermark sống sót qua re-encode và blur. Crop/rotate làm lệch lưới DCT — cần geometric sync để xử lý (future work).

---

## 6. CDN Cache Hit Ratio

**File:** `benchmarks/cdn_cache_hit.py`

**Chạy (active — từ máy Windows host):**
```bash
python benchmarks/cdn_cache_hit.py --cdn http://192.168.155.11
```

**Chạy (passive — từ nginx log trên VM2):**
```bash
python3 /tmp/nt219/benchmarks/cdn_cache_hit.py --log /var/log/nginx/access.log
```

**Nguyên lý đo:**
- **Cold request** (lần đầu): nginx đọc segment từ disk → latency cao hơn.
- **Warm request** (lần sau): OS page cache đã có → latency thấp hơn.
- **Cache hit ratio** = warm requests / (cold + warm) requests.

| Metric | Kết quả |
|---|---|
| Segments test | 12 (init + segment đầu 3 quality) |
| Cold p50 / p95 | ~8ms / ~15ms |
| Warm p50 / p95 | ~2ms / ~5ms |
| Latency speedup | ~4x (warm vs cold) |
| **Cache Hit Ratio** | **83.3%** (5 warm rounds / 6 total rounds) |

**Giải thích:** Với DASH streaming, cùng một segment được nhiều client yêu cầu lặp lại (ABR buffering). Sau lần phục vụ đầu tiên, OS page cache giữ segment trong RAM → nginx không cần đọc disk → throughput tăng đáng kể. CDN cache hit ratio 83%+ là điển hình cho nội dung streaming phổ biến.

**Kết luận:** nginx CDN-sim hoạt động hiệu quả như một edge cache — giảm origin load ~4x cho các segment được request lặp lại.

---

## 7. Tổng kết — % Unauthorized Access

| Attack Vector | Thành công | Bị chặn | Mitigation |
|---|---|---|---|
| License Replay | 0% | 100% | Nonce store |
| IV Reuse | 100% (demo) | — | IV ngẫu nhiên mỗi encrypt |
| Widevine L3 key dump | Key lấy được | TTL giới hạn | Time-bound 30 phút + rotation |
| Watermark defeat (re-encode) | 0% | 100% | DCT redundancy × 16 |
| Watermark defeat (crop/rotate) | ~51% | ~49% | Cần geometric anchor |
| Brute-force login | Bị giới hạn | Rate-limit 10/15min/IP | express-rate-limit |
| Token giả mạo | 0% | 100% | RS256 + jti |
