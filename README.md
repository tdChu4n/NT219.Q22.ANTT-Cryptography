# 🔐 Thiết kế & Triển khai Nền tảng Dịch vụ Nội dung Đa phương tiện An toàn
> **Đồ án môn học: NT219 - Mật mã học**
> 
> *Dựa trên mô hình streaming thực tế (Netflix, Spotify), đồ án tập trung ứng dụng **Mật mã học** (CENC, AES-CTR, DRM, Key Management) để giải quyết bài toán cốt lõi: Chống sao chép, chống tải xuống nội dung và bảo vệ khóa phân phối trên môi trường mạng.*

---

## 📋 Mục lục

1. [Tóm tắt Đề tài & Các bên liên quan](#1-tóm-tắt-đề-tài--các-bên-liên-quan-stakeholders)
2. [Scenarios: Phân tích Rủi ro & Mục tiêu Giải quyết](#2-scenarios-phân-tích-rủi-ro--mục-tiêu-giải-quyết)
3. [Câu hỏi Nghiên cứu & Giả thuyết (RQ & Hypotheses)](#3-câu-hỏi-nghiên-cứu--giả-thuyết-rq--hypotheses)
4. [Kiến trúc Hệ thống Mạng & Tương tác Node](#4-kiến-trúc-hệ-thống-mạng--tương-tác-node)
5. [Thiết kế Giải pháp Mật mã Cốt lõi (Crypto Focus)](#5-thiết-kế-giải-pháp-mật-mã-cốt-lõi-crypto-focus)
6. [Triển khai Ứng dụng Client & Giao thức Nền tảng](#6-triển-khai-ứng-dụng-client--giao-thức-nền-tảng)
7. [Watermarking — Giải pháp giảm thiểu](#7-watermarking--giải-pháp-giảm-thiểu)
8. [Kế hoạch Thực nghiệm & Metrics](#8-kế-hoạch-thực-nghiệm--metrics)
9. [Deliverables & Cấu trúc Repository](#9-deliverables--cấu-trúc-repository)
10. [Ethics & Compliance](#10-ethics--compliance-đạo-đức--tuân-thủ)
11. [Tài liệu Khảo sát](#11-tài-liệu-khảo-sát-literature--industry-references)
12. [Timeline & Thành viên](#12-timeline--thành-viên)

---

## 1. Tóm tắt Đề tài & Các bên liên quan (Stakeholders)

Nền tảng streaming đa phương tiện phân phối tài sản số có dung lượng cực lớn và giá trị bản quyền cao. Trọng tâm của đồ án không phải là xây dựng một trang web xem phim thông thường, mà là xây dựng **đường ống bảo vệ nội dung (pipeline an ninh)** từ máy chủ đến màn hình người dùng bằng mật mã học.

**Các bên liên quan trong ngữ cảnh:**
- **Content Provider (Nhà cung cấp nội dung):** Nắm bản quyền, yêu cầu hệ thống phải ngăn chặn tuyệt đối việc leak/download file raw.
- **Platform Operator (Hệ thống điều hành - Chúng ta):** Quản lý Transcode, Encrypt, License và Auth. Phải đảm bảo an toàn key.
- **Third-party CDN (Mạng phân phối bên thứ 3):** Lưu trữ file video để phát cho người dùng, tối ưu tốc độ nhưng **không được tin tưởng** về mặt bảo mật.
- **End-User (Khách hàng):** Trả tiền để nhận quyền truy cập, phát nội dung trên nhiều thiết bị (Web, App).
- **Pirate/Attacker (Tin tặc):** Chặn bắt mạng, dùng tool tải lậu, hoặc can thiệp RAM để đánh cắp video.

---

## 2. Scenarios: Phân tích Rủi ro & Mục tiêu Giải quyết

Dựa trên ngữ cảnh thực tế, hệ thống đối mặt với rất nhiều rủi ro. Đồ án sẽ liệt kê và **tập trung chọn lọc các rủi ro liên quan đến Mật mã học** để xử lý triệt để.

| Rủi ro / Scenarios | Mức độ | Mục tiêu của Đồ án & Phương án xử lý |
|---|---|---|
| **1. Client-side Attacks (Memory Scraping)**<br>Thiết bị đã root/jailbreak, hacker dump RAM để tìm Key hoặc lấy khung hình đã giải mã. | Rất Cao | **🎯 Trọng tâm xử lý:** Buộc giải mã trong phần cứng TEE (Widevine L1). Các thiết bị không có TEE chỉ được cấp Key hạ độ phân giải (SD). |
| **2. Unauthorized Download & Edge Leakage**<br>Dùng IDM tải file từ CDN. CDN bị hack làm lộ file video. | Rất Cao | **🎯 Trọng tâm xử lý:** CDN chỉ lưu trữ **Ciphertext**. Sử dụng CENC mã hóa luồng dữ liệu. Dù tải hết về cũng không thể xem. |
| **3. License Token Replay / Session Hijacking**<br>Hacker bắt request lấy Key, dùng lại token cho máy khác. | Cao | **🎯 Trọng tâm xử lý:** Xác thực Device Attestation. License cấp ra chứa khóa đã mã hóa RSA, gắn cứng với Public Key của thiết bị (Device Binding). |
| **4. Cryptographic Flaws (Nonce Reuse / Poor RNG)**<br>Dùng lại IV cho các đoạn video khác nhau, sinh khóa yếu. | Nghiêm trọng | **🎯 Trọng tâm xử lý:** Khai thác CSPRNG chuẩn. Thiết kế mỗi segment video bắt buộc có IV duy nhất. |
| **5. Quay lén / HDMI Capture (Analog Hole)**<br>Giới hạn vật lý, không thể dùng mật mã để chặn. | Trung bình | **⚠️ Giải pháp giảm thiểu:** Áp dụng Forensic Watermarking để nhúng UserID vào video. Nhận thức rõ watermark có thể bị phá nếu nén lại. |

**Kết luận:** Đồ án dồn toàn lực vào **Mã hóa nội dung (CENC) & Phân phối khóa an toàn (DRM KMS)** để chặn đường đánh cắp số.

---

## 3. Câu hỏi Nghiên cứu & Giả thuyết (RQ & Hypotheses)

**Câu hỏi nghiên cứu (RQs):**
- **RQ1:** Thiết kế key distribution nào cân bằng tốt nhất giữa bảo mật (binding key tới thiết bị), độ trễ (license latency) và khả năng mở rộng (CDN/Edge)?
- **RQ2:** Các lỗ hổng mật mã (Nonce/IV reuse, License Token Replay) trong pipeline streaming tồn tại ở đâu và phương pháp phòng thủ thực tế có hiệu quả như thế nào?
- **RQ3:** Truy vết rò rỉ bằng Forensic Watermarking trong kịch bản Analog Hole đạt hiệu quả (detectability) ra sao khi đối mặt với các kỹ thuật phá hoại (transcoding, cropping) và chi phí xử lý là bao nhiêu?

**Giả thuyết (Hypothesis):**
- Kết hợp giải mã trong **TEE (Attestation)** + **Short-lived keys (Key Rotation)** + **Per-device licensing** sẽ giảm triệt để rủi ro rò rỉ khóa. Đồng thời, Forensic Watermarking giúp truy vết vi phạm (Analog Hole) dù làm tăng chi phí tính toán.

---

## 4. Kiến trúc Hệ thống Mạng & Tương tác Node

Hệ thống được chia thành các node mạng chuyên biệt. Mỗi node đảm nhận một khâu trong pipeline, được thiết kế để giao tiếp an toàn và **chống fail (High Availability)**.

```text
       [NODE 1: PROCESSING]                    [NODE 2: KMS & LICENSE SERVER]
   (Backend Worker - Internal VPC)             (Security Node - Public API an toàn)
  ┌─────────────────────────────┐           ┌───────────────────────────────────┐
  │ 1. Transcode video (FFmpeg) │──(Lưu Key)─▶│ 1. Sinh Key (CSPRNG), lưu DB HSM  │
  │ 2. Cắt Segment (fMP4 CMAF)  │           │ 2. Nhận Request từ Client         │
  │ 3. Mã hóa CENC (AES-CTR)    │           │ 3. Check Auth & Device Attestation│
  └─────────────────────────────┘           │ 4. Trả License (RSA Encrypted)    │
                 │                          └───────────────────────────────────┘
          (Upload Ciphertext)                                 ▲
                 ▼                                       (TLS 1.3 req)
        [NODE 3: CDN / EDGE]                                  │
    (Third-party - Public Network)                  [NODE 4: CLIENT APP]
  ┌─────────────────────────────┐           ┌───────────────────────────────────┐
  │ 1. Phân phối Playlist (.mpd)│◀─(Tải MPD)─│ 1. Player (Web / Mobile App)      │
  │ 2. Caching Segment mã hóa   │◀─(Tải Seg)─│ 2. Fetch đoạn video (Ciphertext)  │
  │ (Hỗ trợ Fallback CDN)       │           │ 3. Giải mã ngay trong RAM (Buffer)│
  └─────────────────────────────┘           └───────────────────────────────────┘
```

### Vai trò & Thiết kế Chống Fail cho từng Node

| Node Mạng | Vai trò | Tương tác & Chống Fail (Reliability) |
|---|---|---|
| **Node 1: Processing** | Biến video thô thành các segment nhỏ đã mã hóa AES-CTR, trích xuất KID và IV. | Chạy dạng Background Worker (Message Queue). Nếu fail lúc mã hóa, worker tự retry mà không ảnh hưởng người dùng. |
| **Node 2: KMS & License** | Quản lý vòng đời Key, bảo vệ Key master, xác thực quyền user để trả Key mã hóa cho DRM. | Là node kịch độc (Single point of failure). Phải triển khai Microservices load-balancer, dùng Redis cache session, Database Replica. |
| **Node 3: CDN** (Third-party) | Nơi duy nhất lưu trữ dung lượng lớn để phân phối nhanh cho End-User. Không bao giờ lưu Key. | Cấu hình **Fallback/Multi-CDN**: Nếu CDN 1 sập, Client tự động gọi CDN 2 tải segment tiếp theo mà không đứt luồng xem. |
| **Node 4: Client** (App/Web) | Xin License, kéo Ciphertext từ CDN, giải mã ngay trong buffer, xuất ra màn hình. | Tự thích ứng băng thông (ABR). Mạng yếu sẽ kéo segment chất lượng thấp, chống buffering. |

---

## 5. Thiết kế Giải pháp Mật mã Cốt lõi (Crypto Focus)

Thay vì thiết kế tính năng web rườm rà, đồ án tập trung 100% vào Mật mã học cho luồng streaming:

### 4.1. Thiết kế Segment & Giải mã Buffer (Anti-Download)
- Video 5GB không mã hóa nguyên cục. Nó được băm thành **hàng trăm segment (2-10 giây)**.
- Khi người dùng tải lậu 1 segment, họ nhận được Ciphertext vô nghĩa.
- Ứng dụng Client **không tải hết**, nó tải segment 1, đưa vào RAM, CDM giải mã -> Phát hình -> **Gán = 0 và xóa ngay khỏi RAM**. File bản rõ không bao giờ tồn tại trên ổ cứng.

### 4.2. Mã dòng AES-128-CTR (Streaming Encryption)
- **Tại sao không dùng AES-ECB/CBC?** Streaming cần tốc độ cao, giải mã song song và đặc biệt là khả năng **tua (seek)**. Phải giải mã từ giữa video mà không cần giải mã đoạn đầu.
- **Giải pháp:** Biến block cipher thành mã dòng với **AES-CTR**. Tốc độ AES-NI cực nhanh (~4GB/s).
- Rủi ro mật mã duy nhất của AES-CTR là *Nonce Reuse*. Hệ thống triệt tiêu rủi ro này bằng cách ép **mỗi segment có một IV (Initialization Vector) riêng biệt** sinh bằng CSPRNG.

### 4.3. Key Distribution & Rotation (Quản lý và Xoay Khóa)
**Bài toán:** Phim dài 2 tiếng có 720 segment. 720 Key thì quá tải hệ thống, 1 Key chung thì lộ là mất cả phim.
**Giải pháp kiến trúc:**
- Sử dụng chiến lược **Key Rotation (Short-lived keys)**. Mỗi bộ phim chia làm các Period (ví dụ 30 phút).
- Hệ thống cần **4 Khóa cho 1 bộ phim**. 
- Nếu hacker dump RAM lấy được 1 Khóa, kẻ đó chỉ giải mã được 30 phút phim, giảm thiểu tối đa damage.
- Các khóa K1, K2... truyền qua License Server được **đóng gói RSA-OAEP** bằng Public Key của TEE thiết bị khách.

---

## 6. Triển khai Ứng dụng Client & Giao thức Nền tảng

Môi trường Client không an toàn là nơi hacker tấn công nhiều nhất. Đồ án thiết kế triển khai nền tảng linh hoạt qua API chuẩn:

1. **Triển khai trên Web Browser (Chrome, Edge):**
   - Sử dụng chuẩn **W3C EME (Encrypted Media Extensions)** kết hợp Shaka Player.
   - Code JS trên trình duyệt không bao giờ thấy Key. Trình duyệt đóng vai trò cầu nối, đẩy Key và Ciphertext xuống phần mềm DRM cấp thấp (Widevine CDM) để giải mã.
2. **Triển khai trên Native App (Mobile/SmartTV):**
   - Android dùng **ExoPlayer** giao tiếp thẳng với MediaDrm API (hỗ trợ Widevine L1 bằng phần cứng).
   - Apple iOS dùng **AVFoundation** cho luồng FairPlay (sử dụng CBCS mode). Hệ thống Packager CMAF hỗ trợ xuất file tương thích cả 2 nền tảng này.

---

## 7. Watermarking — Giải pháp giảm thiểu

Bởi vì Mật mã học bị giới hạn trước Camera quay lén (Analog Hole), đồ án tích hợp Watermarking như một chốt chặn cuối:
- **Nguyên lý:** Nhúng một Forensic ID (danh tính người dùng) vào các hệ số tần số (DCT) của ảnh.
- **Khảo sát:** Rủi ro false-positive hoặc mất watermark khi hacker cố tình Re-encode (nén chất lượng thấp) hoặc Crop hình.
- **Kết luận thiết kế:** Watermarking đánh đổi chất lượng/hiệu năng lấy tính truy vết. Trong đồ án này, Watermarking là yếu tố phụ, không thay thế cho AES-CTR hay DRM.

---

## 8. Kế hoạch Thực nghiệm & Metrics

### 7.1. Proof of Concept (PoC) Pipeline
Đồ án sẽ xây dựng 1 pipeline mô phỏng thực tế (Scale nhỏ gọn):
1. FFmpeg + Shaka-packager (Cắt CMAF + Mã hóa CENC với Test KIDs).
2. License Server bằng Node.js giả lập OAuth2, Device Attestation và xuất License.
3. Nginx đóng vai trò CDN. Shaka Player phát EME trên browser.

### 7.2. Test Tấn công Mật mã & Bảo mật
| Bài Test | Phương thức | Đánh giá |
|---|---|---|
| **Memory Scraping** | Dùng Frida can thiệp memory quá trình giải mã | Thất bại nếu chạy trên môi trường TEE (Widevine L1). Thành công minh họa trên L3. |
| **Token Replay** | Bắt License Response, truyền cho máy ảo khác | Phải bị Server chặn do mismatch Nonce hoặc Device Attestation. |
| **IV Reuse** | Cố tình tái sử dụng IV cho 2 đoạn video | Hacker XOR được Ciphertext để lấy ảnh thô. Chứng minh CENC bắt buộc IV unique. |

### 7.3. Thu thập Metrics
- **Performance:** License latency (thời gian trễ khi xin khóa), TTFF (Time-To-First-Frame), mức ngốn CPU khi giải mã AES-CTR.
- **Security:** Tỉ lệ chống tải lậu thành công (100%), rủi ro lộ khóa.

---

## 9. Deliverables & Cấu trúc Repository

**Sản phẩm giao nộp (Deliverables):**
1. **Source code:** Các script Transcoding/Packaging (FFmpeg, Shaka), License Server (Node.js), Web Player.
2. **Artifacts:** Đoạn video mẫu đã mã hóa CENC, KIDs, log từ License Server, dữ liệu đo đạc (CSV/Plots) về TTFF & Latency.
3. **Báo cáo (Report & Demo):** Sơ đồ kiến trúc cuối cùng, báo cáo phân tích bảo mật, và video demo chặn Token Replay / chặn tải lậu.

**Cấu trúc Repository:**
```text
project-root/
  ├─ ingest/             # Script transcode FFmpeg (tạo ABR renditions)
  ├─ packager/           # shaka-packager tạo CMAF/fMP4 và CENC encryption
  ├─ license-server/     # Node.js OAuth2 + DRM License API
  ├─ cdn-sim/            # Nginx mô phỏng CDN & Caching
  ├─ player/             # Shaka Player Web App
  ├─ watermark/          # Script nhúng & dò tìm Forensic Watermarking
  └─ docs/               # Báo cáo, slide, kiến trúc
```

---

## 10. Ethics & Compliance (Đạo đức & Tuân thủ)

- **Bản quyền:** Chỉ sử dụng các mẫu video (sample/synthetic assets) được cấp phép mã nguồn mở hoặc tự quay để thử nghiệm.
- **Quyền riêng tư (Privacy/GDPR):** Forensic Watermarking chỉ nhúng các ID ẩn danh hóa định dạng Hash (không nhúng PII trực tiếp của user vào video). 
- **Log & Telemetry:** Tuân thủ lưu trữ log hệ thống an toàn và có chính sách xóa định kỳ.

---

## 11. Tài liệu Khảo sát (Literature & Industry References)

- ISO/IEC 23001-7 (MPEG-CENC Specification).
- Widevine DRM Architecture & PlayReady Documentation.
- Các bài báo nghiên cứu về Robust Watermarking & Forensic Tracking.
- **Công cụ:** FFmpeg, `shaka-packager`, Bento4, Shaka Player.

---

## 12. Timeline & Thành viên

**Timeline Đồ án:** [Link Spreadsheet](https://docs.google.com/spreadsheets/d/1w1mKGpv5SPb5p1dqNdZideCGQb87z6QokOSiyGN1Ckk/edit?gid=0#gid=0)

**Nhóm thực hiện:**
| MSSV | Họ và tên | Vai trò |
| :--- | :--- | :--- |
| 24520074 | Trầm Tính Ấn | Trưởng nhóm|
| 24520228 | Trần Đức Chuẩn | Thành viên|
| 24520975 | Chung Hữu Lộc | Thành viên|

---
<div align="center">
<b>Đại học Công nghệ Thông tin — Đồ án chuyên ngành Mật Mã Học</b>
</div>
