# Tài liệu: Pipeline Đóng gói Media (DASH CENC & HLS CBCS)

Tài liệu này định nghĩa luồng xử lý (pipeline) đóng gói video từ dạng ABR sang các chuẩn streaming có áp dụng mã hóa DRM. T5.2 định nghĩa các command và scope, làm tiền đề để T5.1 thực thi và sinh output.

## 1. Prerequisites (Yêu cầu hệ thống)
* **Docker image:** `media-processing` (Môi trường thực thi chính).
* **Công cụ đóng gói:** `packager` (Shaka Packager).
* **Công cụ phân tích:** `Bento4` (Sử dụng để kiểm tra cấu trúc box của file MP4).

## 2. Input Contract
* **Đầu vào:** Các phân đoạn video/audio đã được xử lý ABR (Adaptive Bitrate) lấy từ thư mục `ingest/output`.

## 3. Lệnh đóng gói DASH CENC (Widevine/PlayReady)
Sử dụng Shaka Packager để phân mảnh và mã hóa luồng DASH với scheme `cenc` (AES-128-CTR).

\`\`\`bash
packager \
  in=ingest/output/video_1080p.mp4,stream=video,output=output-dash/video_1080p_cenc.mp4 \
  in=ingest/output/audio_aac.mp4,stream=audio,output=output-dash/audio_aac_cenc.mp4 \
  --enable_raw_key_encryption \
  --keys label=:key_id=1234567890abcdef1234567890abcdef:key=9989adb99119c956e1b7c3d4f5a6b7c8 \
  --mpd_output output-dash/master.mpd
\`\`\`

## 4. Lệnh đóng gói HLS CBCS/FairPlay (Apple DRM)
Sử dụng Shaka Packager để tạo luồng HLS CMAF với scheme `cbcs` (AES-128-CBC) và nhúng tín hiệu FairPlay.

\`\`\`bash
packager \
  in=ingest/output/video_1080p.mp4,stream=video,output=output-hls/video_1080p_cbcs.mp4 \
  --protection_scheme cbcs \
  --protection_systems FairPlay \
  --hls_key_uri "skd://movie_123" \
  --enable_raw_key_encryption \
  --keys label=:key_id=1234567890abcdef1234567890abcdef:key=9989adb99119c956e1b7c3d4f5a6b7c8 \
  --hls_master_playlist_output output-hls/master.m3u8
\`\`\`

## 5. Verify (Phương pháp kiểm chứng)
Sau khi chạy các lệnh trên, cần thực hiện các bước sau để nghiệm thu:
1. **Kiểm tra tenc box:** Dùng lệnh `mp4dump output-hls/video_1080p_cbcs.mp4` (từ bộ công cụ Bento4) để xác nhận có sự tồn tại của Track Encryption Box (`tenc`).
2. **Kiểm tra Playlist:** Mở file `output-hls/master.m3u8` và `stream_0.m3u8`, xác nhận có thẻ `#EXT-X-KEY` với các tham số: `METHOD=SAMPLE-AES` và `KEYFORMAT="com.apple.streamingkeydelivery"`.
3. **Playback Test:** Mở URL qua CDN mô phỏng (ví dụ: `http://<cdn-ip>:<port>/video/master.m3u8`) trên Safari để kích hoạt luồng phát request SPC.

## 6. Known Limitation (Giới hạn của PoC)
* Việc trả về Content Key Context (CKC) thật để giải mã luồng HLS FairPlay yêu cầu hệ thống phải được cấp **Apple FPS certificate** và tích hợp **KSM (Key Security Module) thật**. 
* Do đó, trong khuôn khổ đồ án này, chúng ta chỉ dừng ở mức độ PoC/Mock: xác nhận Safari nhận diện được HLS FairPlay-signaled và phát thành công SPC request.