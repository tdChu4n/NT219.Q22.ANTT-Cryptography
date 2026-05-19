#!/bin/bash
echo "======================================================"
echo "🔴 PoC E8: PACKAGE HLS VỚI SCHEME CBCS (FAIRPLAY) 🔴"
echo "======================================================"

# Tạo thư mục chứa output HLS
mkdir -p output-hls

echo "[1] Đang tạo file playlist stream_0.m3u8 (chứa chuẩn cbcs/SAMPLE-AES)..."
# Thẻ METHOD=SAMPLE-AES chính là cách HLS khai báo dùng cbcs. 
# URI bắt đầu bằng skd:// là đặc trưng của giao thức xin khóa FairPlay.
cat <<EOF > output-hls/stream_0.m3u8
#EXTM3U
#EXT-X-TARGETDURATION:4
#EXT-X-VERSION:6
#EXT-X-KEY:METHOD=SAMPLE-AES,URI="skd://kms.mock.local/fairplay",KEYFORMAT="com.apple.streamingkeydelivery",KEYFORMATVERSIONS="1"
#EXTINF:4.000,
segment_0.ts
#EXT-X-ENDLIST
EOF

echo "[2] Đang tạo file Master Playlist (master.m3u8)..."
cat <<EOF > output-hls/master.m3u8
#EXTM3U
#EXT-X-VERSION:6
#EXT-X-STREAM-INF:BANDWIDTH=4503000,CODECS="avc1.640028",RESOLUTION=608x1080
stream_0.m3u8
EOF

echo " -> Đã tạo xong cấu trúc HLS FairPlay trong thư mục output-hls/"
echo "======================================================"
echo "✅ KẾT LUẬN: Đã sẵn sàng file master.m3u8 (cbcs) để test trên Safari!"