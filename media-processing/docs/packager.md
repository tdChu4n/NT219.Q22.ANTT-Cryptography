# Tài liệu: Pipeline Đóng gói và Mã hóa Media (Media Packaging Pipeline)

Tài liệu này mô tả luồng xử lý (pipeline) để chuyển đổi video gốc thành các định dạng stream (DASH/HLS) có áp dụng mã hóa bản quyền (DRM) theo chuẩn CENC và FairPlay.

## 1. Luồng xử lý tổng quan (Pipeline)
1. **Input:** File video/audio gốc (định dạng MP4).
2. **Packager (Trình đóng gói):** Sử dụng Shaka Packager hoặc FFmpeg/Bento4 để phân mảnh (segmentation) và mã hóa (encryption).
3. **KMS (Key Management System):** Packager gọi đến KMS (hoặc dùng Raw Key) để lấy `Key` và `KeyID` cho quá trình mã hóa.
4. **Output:** - Playlist/Manifest files (`.mpd` cho DASH, `.m3u8` cho HLS).
   - Segments (`.m4s`, `.ts`) đã bị mã hóa.

## 2. Ví dụ lệnh đóng gói (Packager Commands)

### 2.1. Đóng gói MPEG-DASH với mã hóa CENC (Widevine/PlayReady)
Sử dụng Shaka Packager để tạo DASH với mã hóa AES-128-CTR (cenc):

\`\`\`bash
packager \
  in=raw_video.mp4,stream=video,output=video_enc.mp4 \
  in=raw_audio.mp4,stream=audio,output=audio_enc.mp4 \
  --enable_raw_key_encryption \
  --keys label=:key_id=1234567890abcdef1234567890abcdef:key=9989adb99119c956e1b7c3d4f5a6b7c8 \
  --mpd_output master.mpd
\`\`\`

### 2.2. Đóng gói HLS với mã hóa CBCS (Apple FairPlay)
Ví dụ lệnh áp dụng scheme `cbcs` (AES-128-CBC) cho luồng HLS:

\`\`\`bash
packager \
  in=raw_video.mp4,stream=video,output=video_hls.mp4 \
  --protection_scheme cbcs \
  --enable_raw_key_encryption \
  --keys label=:key_id=1234567890abcdef1234567890abcdef:key=9989adb99119c956e1b7c3d4f5a6b7c8 \
  --hls_master_playlist_output master.m3u8 \
  --hls_playlist_type VOD
\`\`\`

## 3. Xác thực Output
Sau khi chạy pipeline, thư mục đầu ra sẽ chứa các file manifest và dữ liệu đã mã hóa. Trình phát (Player) bắt buộc phải có License Token hợp lệ mới có thể giải mã khối dữ liệu này.