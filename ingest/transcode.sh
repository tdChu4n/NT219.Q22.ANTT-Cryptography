#!/usr/bin/env bash
##############################################################################
# transcode.sh — ABR Encoding Script (Task 3)
# Chuyển đổi video gốc thành 3 renditions: 360p, 720p, 1080p
#
# Usage:
#   bash transcode.sh input/sample.mp4
#   bash transcode.sh input/sample.mp4 custom_output/
#
# Yêu cầu: FFmpeg >= 6.x
##############################################################################

set -euo pipefail

# ─── Arguments ──────────────────────────────────────────────────────────────
INPUT_FILE="${1:?❌ Usage: bash transcode.sh <input_video> [output_dir]}"
OUTPUT_DIR="${2:-./output}"

# ─── Kiểm tra FFmpeg ───────────────────────────────────────────────────────
if ! command -v ffmpeg &>/dev/null; then
    echo "❌ FFmpeg chưa được cài đặt."
    echo "   Ubuntu/Debian: sudo apt install ffmpeg"
    echo "   macOS:         brew install ffmpeg"
    exit 1
fi

# ─── Kiểm tra file đầu vào ─────────────────────────────────────────────────
if [ ! -f "$INPUT_FILE" ]; then
    echo "❌ Không tìm thấy file đầu vào: $INPUT_FILE"
    exit 1
fi

# ─── Tạo thư mục đầu ra ────────────────────────────────────────────────────
mkdir -p "$OUTPUT_DIR"

# ─── Lấy tên file gốc ──────────────────────────────────────────────────────
BASENAME=$(basename "$INPUT_FILE" | sed 's/\.[^.]*$//')

echo ""
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║           🎬 ABR Encoding — Task 3 (NT219)                 ║"
echo "║           FFmpeg H.264 + AAC Transcoding                   ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo ""
echo "📥 Input:  $INPUT_FILE"
echo "📤 Output: $OUTPUT_DIR"
echo ""

# ─── Hiển thị thông tin video gốc ──────────────────────────────────────────
echo "📊 Thông tin video gốc:"
echo "─────────────────────────────────────────"
ffmpeg -i "$INPUT_FILE" -hide_banner 2>&1 | grep -E "Duration|Video|Audio|Stream" || true
echo ""

# ─── Rendition definitions ─────────────────────────────────────────────────
#       Name    Scale       VideoBit  MaxRate   BufSize   AudioBit
RENDITIONS=(
    "360p   640:360     800k      856k      1200k     96k"
    "720p   1280:720    2500k     2675k     3750k     128k"
    "1080p  1920:1080   5000k     5350k     7500k     192k"
)

TOTAL_START=$(date +%s)

for rendition in "${RENDITIONS[@]}"; do
    read -r NAME SCALE VBIT MAXRATE BUFSIZE ABIT <<< "$rendition"
    
    OUTFILE="${OUTPUT_DIR}/${BASENAME}_${NAME}.mp4"
    
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "🔄 Encoding ${NAME} (${SCALE}) → ${OUTFILE}"
    echo "   Video: H.264 @ ${VBIT} | Audio: AAC @ ${ABIT}"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

    START_TIME=$(date +%s)

    ffmpeg -i "$INPUT_FILE" \
        -vf "scale=${SCALE}" \
        -c:v libx264 \
        -preset medium \
        -profile:v main \
        -b:v "$VBIT" \
        -maxrate "$MAXRATE" \
        -bufsize "$BUFSIZE" \
        -g 48 \
        -keyint_min 48 \
        -sc_threshold 0 \
        -c:a aac \
        -b:a "$ABIT" \
        -ar 44100 \
        -ac 2 \
        -movflags +faststart \
        -y \
        "$OUTFILE" 2>/dev/null

    END_TIME=$(date +%s)
    DURATION=$((END_TIME - START_TIME))
    FILESIZE=$(du -h "$OUTFILE" | cut -f1)

    echo "✅ ${NAME} hoàn thành! (${DURATION}s, ${FILESIZE})"
    echo ""
done

TOTAL_END=$(date +%s)
TOTAL_DURATION=$((TOTAL_END - TOTAL_START))

echo "╔══════════════════════════════════════════════════════════════╗"
echo "║                    📋 KẾT QUẢ ENCODING                    ║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║ Tổng thời gian: ${TOTAL_DURATION}s"
echo "║"
echo "║ Files đầu ra:"

for rendition in "${RENDITIONS[@]}"; do
    read -r NAME _ <<< "$rendition"
    OUTFILE="${OUTPUT_DIR}/${BASENAME}_${NAME}.mp4"
    if [ -f "$OUTFILE" ]; then
        FILESIZE=$(du -h "$OUTFILE" | cut -f1)
        echo "║   ✅ ${BASENAME}_${NAME}.mp4  (${FILESIZE})"
    else
        echo "║   ❌ ${BASENAME}_${NAME}.mp4  (FAILED)"
    fi
done

echo "║"
echo "╠══════════════════════════════════════════════════════════════╣"
echo "║ 🔜 Bước tiếp theo: Package & Encrypt (shaka-packager)     ║"
echo "║    cd ../packager/                                         ║"
echo "║    bash package_encrypt.sh --input ../ingest/output/       ║"
echo "╚══════════════════════════════════════════════════════════════╝"
