# Tài liệu: Giao thức Handshake SPC/CKC tối thiểu (Apple FairPlay)

## 1. Scope (Phạm vi PoC)
PoC này được thiết kế để minh họa luồng **Handshake SPC/CKC tối thiểu**. 
Do việc sinh ra CKC (Content Key Context) thực tế đòi hỏi hệ thống phải được trang bị **Apple FPS certificate** và **KSM (Key Security Module) thật**, đồ án này **không cam kết** Safari có thể decrypt/play luồng video.

> **Mục tiêu chốt lại của PoC:** Safari nhận diện được HLS Playlist có chứa cờ FairPlay-signaled và **phát thành công SPC request** lên hệ thống. Quá trình trả về CKC real nằm ngoài phạm vi thực hành.

## 2. Chi tiết luồng hoạt động (Minimal Path)
1. **Packaging (Đóng gói):** Luồng video được đóng gói dưới dạng HLS CMAF với scheme `cbcs`. Trình đóng gói (Packager) được cấu hình để nhúng trực tiếp cờ FairPlay vào file playlist thông qua các tham số:
   `--protection_scheme cbcs`, `--protection_systems FairPlay`, `--hls_key_uri skd://movie_123`

2. **Validation (Xác thực Playlist):**
   Trong file `.m3u8` xuất hiện các thẻ bắt buộc để định tuyến DRM của Apple:
   `#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://movie_123",KEYFORMAT="com.apple.streamingkeydelivery"`

3. **Client Behavior (Safari nhận diện & Phát SPC):**
   Khi Safari parse file `master.m3u8`, trình duyệt sẽ phát hiện thẻ `#EXT-X-KEY`. Trình phát sẽ trích xuất URI (`skd://movie_123`) và yêu cầu hệ điều hành đóng gói các thông tin thiết bị vào một request gọi là **SPC (Server Playback Context)**. 
   Safari bắn request này lên License Server để xin khóa, hoàn thành trọn vẹn kịch bản kích hoạt ở phía Client.