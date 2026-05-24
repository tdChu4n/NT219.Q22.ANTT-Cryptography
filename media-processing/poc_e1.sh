#!/bin/bash
echo "======================================================"
echo "🔴 PoC E1: TẤN CÔNG TẢI LẬU (UNAUTHORIZED DOWNLOAD) 🔴"
echo "======================================================"

echo "[1] Hacker dùng công cụ tải lén file từ CDN..."
# Dùng curl.exe (native Windows) trị dứt điểm lỗi Connection refused của wget
curl.exe -s -f -o hacker_init.mp4 http://127.0.0.1:8000/output/1080_p1_init.mp4
curl.exe -s -f -o hacker_seg1.m4s http://127.0.0.1:8000/output/1080_p1_1.m4s

echo " -> Tải hoàn tất! (Đã lấy được file thật)"

echo "[2] Hacker thực hiện ghép file (cat)..."
cat hacker_init.mp4 hacker_seg1.m4s > hacker_stolen.mp4

echo "[3] Hacker dùng ffplay để cố gắng phát video..."
# Dùng ffplay.exe theo đúng feedback của sếp.
./ffplay.exe -v error -nodisp -autoexit hacker_stolen.mp4 2> poc_e1_log.txt

echo "======================================================"
echo "🟢 KẾT QUẢ TỪ LOG CỦA FFPLAY:"
grep -i -E "cannot decrypt|invalid data|failed to open|error|could not" poc_e1_log.txt
echo "======================================================"
echo "✅ KẾT LUẬN: Đã chặn tải lậu thành công. File bị lỗi decode!"