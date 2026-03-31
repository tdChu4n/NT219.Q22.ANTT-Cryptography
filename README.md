# 🎬 Secure Multimedia Streaming Platform

> **NT219 - Cryptography | Capstone Project**
>
> Thiết kế & Triển khai nền tảng dịch vụ nội dung đa phương tiện an toàn (Netflix/Spotify-inspired) — kiến trúc, bảo mật mật mã, DRM, và kịch bản triển khai thực tế.

---

## 📋 Mục lục

- [Tổng quan](#-tổng-quan)
- [Mục tiêu học thuật](#-mục-tiêu-học-thuật)
- [Kiến trúc hệ thống](#-kiến-trúc-hệ-thống)
- [Công nghệ sử dụng](#️-công-nghệ-sử-dụng)
- [Cài đặt & Chạy thử](#-cài-đặt--chạy-thử)
- [Cấu trúc dự án](#-cấu-trúc-dự-án)
- [Thực nghiệm & Đánh giá](#-thực-nghiệm--đánh-giá)
- [Phân tích rủi ro bảo mật](#-phân-tích-rủi-ro-bảo-mật)
- [Timeline](#-timeline)
- [Deliverables](#-deliverables)
- [Thành viên nhóm](#-thành-viên-nhóm)

---

## 🎯 Tổng quan

Dự án này xây dựng một **nền tảng dịch vụ nội dung đa phương tiện (streaming media)** cấp thực nghiệm, lấy cảm hứng từ các hệ thống như Netflix và Spotify. Trọng tâm là các cơ chế bảo mật mật mã bao gồm:

| Lĩnh vực | Mô tả |
|---|---|
| **DRM & Bản quyền** | Bảo vệ nội dung số qua Widevine/PlayReady/FairPlay |
| **Phân phối khóa** | Key Management System (KMS) + License Server |
| **Bảo vệ trên đường truyền** | TLS 1.3, AES-128-CTR (CENC `cenc` scheme), AES-128-CBC (CBCS/SAMPLE-AES) |
| **Xác thực người dùng & thiết bị** | OAuth2/OpenID, TPM/TEE attestation |
| **Anti-Piracy** | Forensic watermarking, stream-rip detection |
| **Hiệu năng** | CDN/Edge caching, ABR streaming, CMAF |

### Pipeline tổng quát

```
[Ingest] → [Transcode] → [Package] → [Encrypt] → [CDN/Edge] → [Client Decrypt] → [Playback]
```

---

## 📚 Mục tiêu học thuật

1. **Quy trình end-to-end streaming:** Encoding, packaging (CMAF/HLS/DASH), encryption & key distribution, CDN integration, client playback.
2. **Bảo vệ nội dung số:** Common Encryption (CENC — AES-128-CTR/CBC), SAMPLE-AES (AES-128-CBC), tích hợp DRM license servers (Widevine/PlayReady emulation).
3. **Quản lý khóa an toàn (KMS):** Key provisioning, rotation, device attestation, audit logging.
4. **Watermarking:** Forensic & robust watermarking, phân tích trade-off giữa robustness vs quality/latency.
5. **Vận hành thực tế:** Scalability (CDN, edge), latency, storage, và tuân thủ pháp lý (GDPR, copyright).

---

## 🏗️ Kiến trúc hệ thống

```
┌─────────────────────────────────────────────────────────────────┐
│                        CONTENT PIPELINE                         │
│                                                                  │
│  ┌──────────┐    ┌──────────┐    ┌──────────┐    ┌──────────┐  │
│  │  Ingest  │───▶│ Transcode│───▶│ Package  │───▶│ Encrypt  │  │
│  │ (Source) │    │ (FFmpeg) │    │(shaka/   │    │(CENC/    │  │
│  └──────────┘    └──────────┘    │ Bento4)  │    │SAMPLE-   │  │
│                                   └──────────┘    │  AES)    │  │
│                                                   └────┬─────┘  │
└────────────────────────────────────────────────────────┼────────┘
                                                          │
                    ┌─────────────────────────────────────▼──────────────┐
                    │                    LICENSE SERVER                    │
                    │  (OAuth2 + Device Attestation + KMS/HSM + Audit)    │
                    └─────────┬───────────────────────────────────────────┘
                              │
          ┌───────────────────┼────────────────────┐
          │                   │                    │
          ▼                   ▼                    ▼
    ┌──────────┐       ┌──────────┐        ┌──────────┐
    │   CDN /  │       │Watermark │        │   Auth   │
    │   Edge   │       │& Forensic│        │& Billing │
    │  Cache   │       │ Engine   │        │& Logging │
    └────┬─────┘       └──────────┘        └──────────┘
         │
         ▼
  ┌──────────────────┐
  │   CLIENT / APP   │
  │ (EME/CDM/TEE +   │
  │  Shaka/ExoPlayer)│
  └──────────────────┘
```

### Các thành phần chính

| Thành phần | Mô tả | Công nghệ |
|---|---|---|
| **Content Ingest & Encoding** | Transcode nguồn thô sang ABR renditions (360p/720p/1080p) | FFmpeg |
| **Packaging & Encryption** | Tạo CMAF/fMP4 segments; áp dụng CENC (AES-128-CTR) với KID | shaka-packager |
| **Database** | Lưu trữ Content ID, Key ID (KID), Content Key, entitlement records | MongoDB |
| **Auth System** | Xác thực người dùng, phát hành JWT access token | OAuth2, JWT (Node.js) |
| **License Server / KMS** | Nhận license request, xác thực JWT, trả về Content Key đã mã hoá | Node.js + KMS |
| **CDN / Edge Cache** | Phân phối encrypted segments; license response KHÔNG được cache | NGINX |
| **Client App / Player** | EME API để yêu cầu license; CDM giải mã segment trong TEE | Shaka Player (HTML5) |
| **Watermarking Engine** | Nhúng ID người dùng vào metadata frame; phát hiện qua frame analysis | FFmpeg, OpenCV |
| **Auth & Logging** | Định danh người dùng, audit logs, monitoring | OAuth2/JWT, Prometheus |

---

## 🛠️ Công nghệ sử dụng

### Encoding & Packaging

- **FFmpeg** — Transcoding, tạo ABR renditions (360p, 720p, 1080p), encode H.264/AAC
- **shaka-packager** — CMAF/fMP4 packaging + CENC encryption (AES-128-CTR, tạo KID/Key mapping)
- **Bento4** — Phân tích MP4 boxes (`mp4info`, `mp4dump`), kiểm tra CENC metadata trong container
- **GPAC** — Media container processing, kiểm tra segment đầu ra

### DRM & Bảo mật

- **Widevine** (Google) — DRM cho Android, Chrome, Smart TV *(emulation trong PoC)*
- **PlayReady** (Microsoft) — DRM cho Windows, Xbox, Edge *(emulation trong PoC)*
- **FairPlay** (Apple) — DRM cho iOS, macOS, Safari; dùng scheme `cbcs` (AES-128-CBC)
- **Common Encryption (CENC)** — Chuẩn ISO/IEC 23001-7; scheme `cenc`: AES-128-CTR (DASH); scheme `cbcs`: AES-128-CBC with pattern (HLS/FairPlay)
- **JWT (JSON Web Token)** — RFC 7519; dùng để mang license claim, xác thực entitlement
- **Software KMS** — Lưu trữ & phân phối Content Key an toàn *(cloud KMS tùy chọn)*

### Player & Client

- **Shaka Player** — Web (EME/MSE-based)
- **ExoPlayer** — Android (Widevine CDM)
- **AVFoundation + FairPlay SDK** — iOS/macOS

### Database & Infrastructure

- **MongoDB** — Lưu Content ID → KID → Content Key mapping, entitlement records
- **Docker / Docker Compose** — Containerization toàn bộ hệ thống (web server, license server, CDN sim, DB)
- **NGINX** — CDN simulation + edge caching (không cache license response)
- **Prometheus + ELK Stack** — Monitoring & audit logging *(tùy chọn)*
- **Kubernetes (k3s/minikube)** — Orchestration *(nằm ngoài phạm vi MVP, tùy chọn)*

### Testing & Security Analysis

- **JMeter / wrk** — Load & latency testing cho license server
- **Python (cryptography, scapy)** — IV Reuse testing, token replay simulation, memory scraping PoC

---

## 🚀 Cài đặt & Chạy thử

### Yêu cầu hệ thống

- Docker >= 24.x & Docker Compose >= 2.x
- FFmpeg >= 6.x
- Node.js >= 18.x (cho license server)
- Python >= 3.10 (cho watermarking scripts)
- Tài khoản Cloud KMS (AWS/GCP) — tùy chọn, có thể dùng software KMS

### Clone repository

```bash
git clone https://github.com/<your-org>/secure-streaming-platform.git
cd secure-streaming-platform
```

### Chạy toàn bộ hệ thống bằng Docker Compose

```bash
# Khởi động tất cả services (CDN sim, license server, player)
docker compose -f infra/docker-compose.yml up -d

# Kiểm tra trạng thái
docker compose ps
```

### Chạy pipeline encoding & packaging

```bash
# Bước 1: Transcode nguồn sang ABR renditions
cd ingest/
bash transcode.sh input/sample.mp4

# Bước 2: Package & Encrypt với CENC
cd ../packager/
bash package_encrypt.sh --input ../ingest/output/ --kid <KID> --key <CONTENT_KEY>

# Bước 3: Kiểm tra segment đầu ra
ls packager/output/
```

### Chạy License Server

```bash
cd license-server/
npm install
npm start
# License server sẽ chạy tại http://localhost:8080
```

### Mở player

```bash
cd player/
npx serve -p 3000 .
# Truy cập: http://localhost:3000
```

---

## 📁 Cấu trúc dự án

```
project-root/
├─ ingest/              # Scripts transcode (FFmpeg), tạo ABR renditions
│   ├─ transcode.sh
│   └─ output/
├─ packager/            # shaka-packager / Bento4 configs & encrypted segments
│   ├─ package_encrypt.sh
│   ├─ configs/
│   └─ output/          # Encrypted CMAF/fMP4 segments
├─ database/            # MongoDB schema: Content ID, KID, Content Key, entitlements
│   └─ schema.js
├─ license-server/      # OAuth2/JWT auth + license issuance (Node.js)
│   ├─ src/
│   │   ├─ auth/        # OAuth2 + JWT issuance & validation
│   │   ├─ kms/         # Key management: lưu/tra cứu Content Key theo KID
│   │   └─ license/     # DRM license response logic (PSSH box, key response)
│   └─ tests/
├─ cdn-sim/             # NGINX-based CDN emulator + caching configs
│   ├─ nginx.conf
│   └─ Dockerfile
├─ player/              # Web player (Shaka Player) + integration scripts
│   ├─ index.html
│   ├─ player.js
│   └─ drm-config.js
├─ watermark/           # Embedding & detection scripts + test files
│   ├─ embed.py
│   ├─ detect.py
│   └─ test-assets/
├─ infra/               # Docker Compose / Helm charts
│   ├─ docker-compose.yml
│   └─ helm/
├─ benchmarks/          # Load test scripts, raw CSVs, analysis notebooks
│   ├─ jmeter/
│   ├─ data/
│   └─ notebooks/
└─ docs/                # Report, slides, demo instructions
    ├─ report.pdf
    ├─ slides.pdf
    └─ demo/
```

---

## 🧪 Thực nghiệm & Đánh giá

### Thực nghiệm

| # | Thực nghiệm | Mục tiêu |
|---|---|---|
| E1 | **Latency / QoE Tests** | Đo startup latency, TTFF, rebuffer dưới các license TTL khác nhau |
| E2 | **Scale Tests** | Mô phỏng concurrent clients, đo license server throughput & CDN load |
| E3 | **License Token Replay** | Thử replay attack và kiểm tra device binding mitigation |
| E4 | **Rooted Device Emulation** | Dump decrypted frames dưới TEE vs non-TEE |
| E5 | **IV Reuse Attack** | Reuse IV/nonce trên các renditions và thử plaintext recovery |
| E6 | **Watermark Defeat** | Tấn công xóa watermark và đo detection recall/precision |

### Metrics đánh giá

**Bảo mật:**
- Tỷ lệ giải mã trái phép thành công (trong controlled attacks)
- Số lần token replay thành công
- Watermark detection recall & precision

**Hiệu năng:**
- License latency: median / p95 / p99
- Time-to-First-Frame (TTFF) distribution
- License server throughput (requests/sec)
- CDN cache hit ratio
- CPU overhead của encryption & watermarking

**Vận hành:**
- Ước tính chi phí: storage, CDN egress, license server instances
- Độ phức tạp của key rotation flow
- Thời gian thu hồi entitlement (revocation latency)

---

## ⚠️ Phân tích rủi ro bảo mật

### 1. Key Management & License Distribution

| Rủi ro | Mô tả | Mitigation |
|---|---|---|
| **Key Leakage** | HSM/KMS bị xâm phạm → giải mã toàn bộ nội dung | HSM với hardware binding, audit logs, key rotation |
| **Long-lived Keys** | TTL dài → segment bị copy có thể giải mã sau | Short-lived keys (TTL ngắn), offline playback giới hạn |
| **License Token Replay** | Attacker tái sử dụng license token hợp lệ | Device attestation, TLS/mTLS, nonce challenge |

### 2. CDN & Edge Cache

| Rủi ro | Mô tả | Mitigation |
|---|---|---|
| **Cached License Responses** | License keys bị cache công khai trên edge | `Cache-Control: no-store` cho license responses |
| **TLS Downgrade / MITM** | Origin-to-edge kết nối không an toàn | Mutual TLS (mTLS) cho license calls, HSTS |

### 3. Client & Device

| Rủi ro | Mô tả | Mitigation |
|---|---|---|
| **Rooted/Jailbroken Devices** | Extract keys từ memory, dump decrypted frames | TEE/CDM enforcement, Widevine L1 cho HD/4K |
| **Patched CDMs** | Modified player bypass license checks | Device attestation, SafetyNet/Play Integrity API |
| **Insecure Device Key Provisioning** | Thiết bị không có TEE nhận full-quality stream | Hạn chế quality (SD only) trên non-TEE devices |

### 4. Watermarking & Forensics

| Rủi ro | Mô tả | Mitigation |
|---|---|---|
| **Watermark Removal** | Transcoding/edit loại bỏ watermark | Robust embedding với redundancy |
| **False Positives** | Sai cáo buộc người dùng | Low false-positive threshold, human review |

### 5. Cryptographic Issues

| Rủi ro | Mô tả | Mitigation |
|---|---|---|
| **Nonce/IV Reuse (AES-CTR)** | Nếu dùng lại IV với cùng Key trong AES-CTR → XOR xác định plaintext (two-time pad attack) | Unique KID + IV per segment & rendition; mỗi rendition phải có IV riêng |
| **Poor RNG** | Keys/nonces/IV có thể đoán được nếu dùng PRNG yếu | Dùng CSPRNG (os.urandom / /dev/urandom) cho key & IV generation |
| **Algorithm Misuse** | ECB mode không an toàn (pattern leakage); AES-CTR thiếu authentication tag → dễ bị bit-flip | Dùng AES-GCM (AEAD) cho API/license transport; AES-128-CTR cho CENC theo chuẩn ISO/IEC 23001-7 |

---

## 📅 Timeline

https://docs.google.com/spreadsheets/d/1xy16zcxfLQ3jjUdWAUrzMyoJbKQ3jQkPNidLN4lXorg/edit?gid=0#gid=0

---

## 👥 Thành viên nhóm

| MSSV | Họ và tên | Vai trò |
|2452xxxx|Trầm Tính Ân|Trưởng nhóm|
|2452022|Trần Đức Chuẩn|Thành viên|
|2452xxxx|Chung Hữu Lộc|Thành viên|
---

<div align="center">

**NT219.Q22.ANTT — Cryptography Capstone Project**

*Khoa Mạng máy tính & Truyền thông — Đại học Công nghệ Thông tin*

</div>
