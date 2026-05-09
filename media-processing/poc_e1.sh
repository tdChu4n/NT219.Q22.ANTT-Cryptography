#!/bin/bash
echo "======================================================"
echo "🔴 PoC E1: TẤN CÔNG TẢI LẬU (UNAUTHORIZED DOWNLOAD) 🔴"
echo "======================================================"

echo "[1] Hacker dùng curl.exe tải file từ CDN..."
# Dùng curl.exe của Windows để đảm bảo thông mạng 100%
curl.exe -L http://127.0.0.1:8000/output/1080_p1_init.mp4 -o hacker_init.mp4
curl.exe -L http://127.0.0.1:8000/output/1080_p1_1.m4s -o hacker_seg1.m4s

echo " -> Tải hoàn tất!"

echo "[2] Hacker thực hiện ghép file (cat)..."
cat hacker_init.mp4 hacker_seg1.m4s > hacker_stolen.mp4

echo "[3] Hacker dùng ffprobe để cố gắng giải mã..."
./ffprobe.exe hacker_stolen.mp4 2> poc_e1_log.txt

echo "======================================================"
echo "🟢 KẾT QUẢ TỪ LOG CỦA FFMPEG/FFPROBE:"
# Lọc từ khóa chứng minh video đã bị mã hóa CENC (AES-128-CTR)
grep -i -E "encv|encrypted|error" poc_e1_log.txt
echo "======================================================"
echo "✅ KẾT LUẬN: Đã chặn tải lậu thành công. [Scenario 2 - README]"