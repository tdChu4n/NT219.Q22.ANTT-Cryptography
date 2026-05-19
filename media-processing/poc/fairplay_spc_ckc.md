# Tài liệu: Giao thức Handshake SPC/CKC trong Apple FairPlay DRM

Để Safari có thể phát được luồng HLS mã hóa bằng scheme `cbcs`, trình phát (Player) và máy chủ khóa (License Server) phải thực hiện một quá trình trao đổi an toàn (Handshake) thông qua hai thành phần chính: **SPC** và **CKC**.

## 1. SPC (Server Playback Context) - "Gói yêu cầu"
Khi Player đọc file `.m3u8` và thấy thẻ `#EXT-X-KEY:METHOD=SAMPLE-AES` chứa `skd://`, nó sẽ nhờ hệ điều hành (Apple OS) tạo ra một gói SPC.
* **Nội dung của SPC:** Chứa thông tin định danh của thiết bị, chứng chỉ (FairPlay Certificate) từ Apple, và thông tin xác thực để chứng minh thiết bị này an toàn (không bị jailbreak).
* **Luồng đi:** Player gửi gói SPC này lên máy chủ License Server (KMS).

## 2. CKC (Content Key Context) - "Gói trả lời"
Khi License Server nhận được SPC, nó sẽ kiểm tra quyền của người dùng (Token hợp lệ không). Nếu pass, Server sẽ "mở gói" SPC, lấy ra khóa AES (Content Key) và bọc nó lại thành một gói CKC.
* **Nội dung của CKC:** Chứa Content Key đã được mã hóa theo cách mà **chỉ có phần cứng của thiết bị yêu cầu (TEE)** mới có thể giải mã được.
* **Luồng đi:** License Server trả CKC về cho Player. Player đưa CKC vào phần cứng Apple để giải mã các block video `cbcs` và phát lên màn hình.

## 3. Tóm tắt Handshake
1. Safari yêu cầu phát luồng `cbcs`.
2. HĐH tạo **SPC** gửi lên Server.
3. Server giải mã SPC, lấy Key, đóng gói thành **CKC** trả về.
4. HĐH giải mã **CKC**, lấy Key và phát video.