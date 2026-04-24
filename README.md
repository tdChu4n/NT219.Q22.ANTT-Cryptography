# 🔐 Bảo vệ Bản quyền Nội dung Đa phương tiện bằng Mật mã học

> **NT219 - Mật mã học | Đồ án Capstone**
>
> Xuất phát từ ngữ cảnh ứng dụng nền tảng phân phối nội dung đa phương tiện (streaming media), hệ thống tập trung giải quyết bài toán **chống sao chép nội dung (copyright protection)** thông qua kiến trúc phân mảnh và mật mã hóa luồng.

---

## 📋 Mục lục

- [1. Ngữ cảnh & Bài toán cốt lõi](#1-ngữ-cảnh--bài-toán-cốt-lõi)
- [2. Giải pháp kỹ thuật (Mật mã)](#2-giải-pháp-kỹ-thuật-mật-mã)
- [3. Hệ thống mạng & Tương tác các Node](#3-hệ-thống-mạng--tương-tác-các-node)
- [4. Đảm bảo giao tiếp & Tránh lỗi (High Availability)](#4-đảm-bảo-giao-tiếp--tránh-lỗi-high-availability)
- [5. Cài đặt & Chạy thử](#5-cài-đặt--chạy-thử)
- [6. Thực nghiệm & Đánh giá](#6-thực-nghiệm--đánh-giá)
- [7. Timeline & Thành viên nhóm](#7-timeline--thành-viên-nhóm)

---

## 1. Ngữ cảnh & Bài toán cốt lõi

### Ngữ cảnh (Scenarios)
Nội dung đa phương tiện (phim ảnh, khóa học video) là tài sản số có giá trị cao, được phân phối qua các ứng dụng streaming (như Netflix, Coursera). Đặc thù của streaming là dữ liệu lớn, người dùng cần xem liên tục mà không cần tải xong toàn bộ, đồng thời phải hỗ trợ tua (seek) một cách nhanh chóng.

### Liệt kê rủi ro
1. **Tải lậu file trực tiếp**: Kẻ gian bắt link CDN và tải toàn bộ video về lưu trữ cá nhân.
2. **Đánh cắp khóa (Key Extraction)**: Hacker lấy Content Key truyền trên mạng hoặc lấy trực tiếp từ RAM thiết bị để giải mã file tải lậu.
3. **Tấn công Replay / MITM**: Kẻ gian bắt yêu cầu gọi API cấp phép từ một máy hợp lệ và gửi lại trên nhiều máy khác để xem chùa.
4. **Quay màn hình (Analog Hole)**: Dùng thiết bị phần cứng hoặc phần mềm ngoài quay lại màn hình phát video.

### Vấn đề tập trung giải quyết
Đồ án **tập trung giải quyết rủi ro 1 & 2 (Ngăn chặn tải lậu và bảo vệ khóa phân phối)**.
- **Cách giải quyết**: Không bao giờ truyền file video nguyên bản. Chia video thành hàng trăm segment nhỏ (độ dài vài giây), mã hóa từng segment độc lập bằng **AES-128-CTR**. Key không đính kèm file tĩnh mà được quản lý và phân phối qua một luồng xác thực API riêng biệt (License Server), đồng thời được giải mã trong vùng nhớ an toàn (TEE - Trusted Execution Environment) để ngăn chặn rò rỉ RAM.

---

## 2. Giải pháp kỹ thuật (Mật mã)

Hệ thống ứng dụng kết hợp nhiều cơ chế mật mã:
1. **Mã hóa nội dung**: Sử dụng **AES-128-CTR** (mã dòng). Chế độ CTR cho phép giải mã song song, không làm chậm quá trình streaming, hỗ trợ người dùng tua video nhanh chóng do không cần giải mã tuần tự từ đầu phim.
2. **Phân phối khóa (License)**: Giao tiếp qua **TLS 1.3**. Key trả về cho Client được License Server mã hóa lớp thứ hai bằng **RSA-OAEP** với Public Key của thiết bị (CDM), giúp chống lại tấn công MITM.
3. **Bảo vệ khóa lưu trữ**: Tại KMS Server, khóa được mã hóa an toàn (at-rest) bằng **AES-256-GCM** để chống truy cập trái phép vào Database.

*(Các chi tiết lý thuyết rườm rà về Watermarking và so sánh thuật toán không liên quan trực tiếp đến hệ thống mạng được lược bỏ để tập trung vào bảo mật truyền tải).*

---

## 3. Hệ thống mạng & Tương tác các Node

### Các bên liên quan (Stakeholders)
- **Content Provider (Nhà cung cấp)**: Upload nội dung, quản lý quy trình Packager để mã hóa video.
- **End-User (Khách hàng)**: Đăng nhập hệ thống, gửi yêu cầu xác thực để xem nội dung.
- **Third-party Infrastructure**: Hệ thống CDN (VD: Cloudflare, AWS CloudFront) được thuê để phân phối file tĩnh.

### Thiết kế các Node mạng
Hệ thống được chia thành 4 cụm node mạng chính. Môi trường triển khai dành cho người dùng là **Ứng dụng Web**.

| Node Mạng | Số lượng thiết kế | Vai trò & Nhiệm vụ | Nền tảng triển khai |
|---|---|---|---|
| **1. Packager (Xử lý Data)** | 1 (Internal) | Nhận video gốc, encode và chia segment (fMP4), sau đó mã hóa (Encrypt) bằng khóa cấp bởi KMS. | Backend Server (FFmpeg, Shaka-packager) |
| **2. KMS (Key Management)** | 2 (Primary/Replica) | Tạo, lưu trữ và quản lý Content Key. Chỉ giao tiếp với Packager (khi tạo key) và License Server (khi user xin key). | Backend Server (Node.js/Python) |
| **3. CDN Server (Lưu trữ)** | Nhiều (Edge Nodes) | Lưu trữ các segment đã bị mã hóa (`.m4s`). Tối ưu tốc độ tải file cho Client thông qua proxy và cache tĩnh. | Hệ thống bên thứ ba (Third-party CDN) |
| **4. License Server (Xác thực)** | 2+ (Load Balanced) | Xác thực user (đọc JWT), kiểm tra quyền mua phim. Trả về Content Key bảo mật cho Client hợp lệ. | Backend API (Node.js) |
| **5. Client App (Trình phát)** | N (User devices) | Ứng dụng Frontend để user tương tác. Tải segment từ CDN, xin Key từ License Server, đưa vào CDM (Content Decryption Module) để giải mã. | **Web Application** (React / Shaka Player) |

### Tương tác giữa các Node
1. **[Packager]** xin khóa từ **[KMS]** $\rightarrow$ Mã hóa video thành nhiều phần $\rightarrow$ Đẩy hàng loạt file tĩnh lên **[CDN]**.
2. **[Client Web]** truy cập web, load trình phát $\rightarrow$ Yêu cầu tải Manifest và các segment mã hóa từ **[CDN]**.
3. Trình duyệt trên **[Client Web]** phát hiện file bị mã hóa $\rightarrow$ Chặn lại và gửi API request (kèm User JWT) lên **[License Server]**.
4. **[License Server]** gọi nội bộ sang **[KMS]** lấy khóa gốc tương ứng $\rightarrow$ Xác thực quyền của User $\rightarrow$ Đóng gói khóa trả về cho **[Client Web]**.

---

## 4. Đảm bảo giao tiếp & Tránh lỗi (High Availability)

Để hệ thống mạng không bị sập (Fail) và đảm bảo trải nghiệm streaming mượt mà:

- **Đảm bảo kênh truyền (Security)**: Toàn bộ đường truyền dùng HTTPS/TLS 1.3. Các kết nối backend (KMS $\leftrightarrow$ License Server) dùng VPC Private IP, hạn chế lộ ra Internet.
- **Tránh Fail ở tải dữ liệu (CDN)**: Thay vì dùng máy chủ riêng phân phối file video lớn gây nghẽn mạng, kiến trúc dùng **CDN phân tán**. Nếu 1 Edge Node lỗi, hệ thống tự động trỏ đến Node tiếp theo. File segment rất nhẹ (vài MB) giảm nguy cơ đứt gãy.
- **Tránh Fail ở xác thực (License Server)**:
  - Máy chủ cấp phép là điểm nghẽn lớn nhất. Giải pháp là thiết kế từ **2 máy chủ License Server trở lên**, đặt sau một Load Balancer.
  - **Cơ chế Retry (Thử lại)**: Trên Web App (Shaka Player), áp dụng cơ chế `Exponential Backoff`. Nếu API gọi License Server bị rớt mạng hoặc timeout, ứng dụng tự động thực hiện gửi lại (Retry) 3 lần trước khi báo lỗi cho người dùng.
- **Tính liên tục của nội dung**: Adaptive Bitrate Streaming được tích hợp. Khi mạng người dùng yếu, trình duyệt tự động request tới CDN để lấy các segment có độ phân giải thấp hơn (480p thay vì 1080p), đảm bảo video không bị giật lag (buffer).

---

## 5. Cài đặt & Chạy thử

**Yêu cầu:** FFmpeg, Node.js >= 18.

```bash
# 1. Mã hóa video (Chạy Packager)
cd packager/
bash package_encrypt.sh --input ../ingest/output/ --kid <KID_HEX> --key <CONTENT_KEY_HEX>

# 2. Khởi chạy cụm License Server
cd license-server/
npm install && npm start # Chạy API cấp phép tại localhost:8080

# 3. Phân phối CDN tĩnh
# (Mô phỏng tại localhost môi trường test)
npx http-server packager/output -p 8081 --cors
```

---

## 6. Thực nghiệm & Đánh giá

| Kịch bản Thực nghiệm | Kết quả thu được / Đánh giá |
|---|---|
| **Tải lậu trực tiếp** | User tải thành công file `.m4s` từ CDN nhưng trình duyệt/phần mềm báo lỗi không thể phát vì thiếu Content Key. |
| **Bắt gói tin lấy Key** | Bắt được License API Response nhưng Key bên trong bị mã hóa bằng Public Key RSA của CDM, kẻ tấn công MITM không đọc được. |
| **Replay Attack** | Lấy API call hợp lệ chạy sang máy khác $\rightarrow$ License Server từ chối do khác Device ID hoặc Token đã hết hạn. |
| **Thử nghiệm ngắt kết nối Node** | Tắt thủ công 1 node License Server $\rightarrow$ Load balancer tự điều phối, streaming vẫn tiếp tục bình thường (Zero downtime). |

---

## 7. Timeline & Thành viên nhóm

- **Timeline dự án**: https://docs.google.com/spreadsheets/d/1w1mKGpv5SPb5p1dqNdZideCGQb87z6QokOSiyGN1Ckk/edit?usp=sharing
- **Thành viên nhóm**:
  | MSSV | Họ và tên | Vai trò |
  | :--- | :--- | :--- |
  | 24520074 | Trầm Tính Ân | Trưởng nhóm |
  | 24520228 | Trần Đức Chuẩn | Thành viên |
  | 24520975 | Chung Hữu Lộc | Thành viên |

---

<div align="center">

**NT219.Q22.ANTT — Đồ án Mật mã học**

*Khoa Mạng máy tính & Truyền thông — Đại học Công nghệ Thông tin*

</div>
