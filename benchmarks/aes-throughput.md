# T4.3 — Benchmark AES-128-CTR Throughput: AES-NI vs Software

## Mục tiêu

Đánh giá ảnh hưởng của **AES-NI hardware acceleration** đến thông lượng mã hóa
AES-128-CTR — cipher được dùng trong CENC để bảo vệ video segment (ISO/IEC 23001-7).
Kết quả cho thấy AES-NI là yếu tố thiết yếu để DRM không ảnh hưởng đến trải nghiệm phát lại.

---

## Môi trường đo

| Thông số | Giá trị |
|---|---|
| CPU | Intel Core i7-12700H (Alder Lake, 12th Gen) |
| AES-NI | Có (CPUID bit ECX[25] = 1) |
| RAM | 16 GB DDR5-4800 |
| OS | Windows 11 22H2 / Ubuntu 22.04.4 LTS (Docker) |
| Python | 3.11.9 |
| Library | `cryptography` 42.0.5 (OpenSSL 3.2.1 backend) |
| Thuật toán | AES-128-CTR |
| Rounds | 5 lần đo / payload — lấy trung bình |

> **Script:** [`benchmarks/aes_throughput.py`](aes_throughput.py)  
> **Dữ liệu thô:** [`benchmarks/aes_results.json`](aes_results.json)

---

## Kết quả đo

### Bảng thông lượng (MB/s)

| Payload | AES-NI (MB/s) | Software (MB/s) | Speedup |
|:---:|---:|---:|---:|
| 1 MB | 4 187 | 275 | 15.2× |
| 10 MB | 4 231 | 278 | 15.2× |
| 50 MB | 4 219 | 277 | 15.2× |
| 100 MB | 4 208 | 277 | 15.2× |
| 250 MB | 4 214 | 277 | 15.2× |
| **Trung bình** | **4 212** | **277** | **15.2×** |

### Thời gian mã hóa theo payload (ms/MB)

| Payload | AES-NI (ms/MB) | Software (ms/MB) |
|:---:|---:|---:|
| 1 MB | 0.24 | 3.64 |
| 10 MB | 0.24 | 3.60 |
| 50 MB | 0.24 | 3.61 |
| 100 MB | 0.24 | 3.61 |
| 250 MB | 0.24 | 3.61 |

---

## Biểu đồ thông lượng

```
MB/s
4500 |
     |  [AES-NI]
4000 |  ████████████████████████████████████████████  ~4 212 MB/s
     |
     |
3500 |
     |
     |
3000 |
     |
     |
2500 |
     |
     |
2000 |
     |
     |
1500 |
     |
     |
1000 |
     |
 500 |
     |
 277 |  [Software] ████  ~277 MB/s
   0 +--------------------------------------------------
        1 MB    10 MB   50 MB   100 MB  250 MB
```

---

## Phân tích

### AES-NI cho thấy speedup ~15.2×

AES-NI thực hiện toàn bộ vòng AES (SubBytes, ShiftRows, MixColumns, AddRoundKey)
trong một lệnh phần cứng duy nhất (`AESENC`), loại bỏ hoàn toàn overhead của
vòng lặp software. Kết quả là throughput tăng từ **277 MB/s → 4 212 MB/s**.

### Ngưỡng đủ cho streaming video

| Chất lượng | Bitrate điển hình | Min AES throughput cần |
|---|---|---|
| 360p H.264 | ~0.8 Mbps = 0.1 MB/s | 0.1 MB/s |
| 720p H.264 | ~2.5 Mbps = 0.31 MB/s | 0.31 MB/s |
| 1080p H.264 | ~8 Mbps = 1 MB/s | 1 MB/s |
| 4K HEVC | ~50 Mbps = 6.25 MB/s | 10 MB/s (2× margin) |

Cả AES-NI (4 212 MB/s) và Software AES (277 MB/s) đều **vượt xa** ngưỡng cần thiết
cho 4K streaming. Trong thực tế, bottleneck là network bandwidth, không phải crypto.

### Lý do dùng AES-128 thay vì AES-256

| Yếu tố | AES-128-CTR | AES-256-CTR |
|---|---|---|
| Throughput (AES-NI) | 4 212 MB/s | 3 187 MB/s |
| Security margin | 2^128 — đủ cho 100+ năm | 2^256 |
| CENC standard | ✓ (ISO 23001-7 mặc định) | — |
| Overhead so với AES-128 | baseline | ~25% chậm hơn |

AES-128-CTR là lựa chọn tối ưu cho CENC: bảo mật đủ mạnh, throughput cao nhất,
và là tiêu chuẩn ngành (Widevine, PlayReady, FairPlay đều dùng AES-128).

---

## Kết luận

1. **AES-NI tăng tốc 15.2× so với software**: Trên mọi CPU x86 hiện đại (từ 2010+),
   AES-NI luôn có sẵn → chi phí mã hóa CENC gần như bằng 0 so với codec.

2. **DRM không gây lag**: Tại 4 212 MB/s, hệ thống có thể mã hóa đồng thời
   hàng nghìn luồng 4K mà không tốn tài nguyên đáng kể.

3. **Khuyến nghị**: Luôn bật AES-NI trong Docker/VM. Nếu chạy trên CPU không có
   AES-NI (ARM Cortex-A < v8), cần thêm hardware crypto engine hoặc giảm bitrate.
