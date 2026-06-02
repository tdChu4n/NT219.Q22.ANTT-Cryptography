#!/bin/bash
# pipeline_watermark.sh — Full watermark + CENC pipeline cho NT219
# Chạy trên VM2: bash /tmp/nt219/media-processing/pipeline_watermark.sh
set -e
log() { echo "[$(date '+%H:%M:%S')] $*"; }

MOVIE=/tmp/movie/source.mp4
WORK=/tmp/movie
REPO=/tmp/nt219
DEPLOY=/srv/nt219/media/video

KID1=915c46b4c759db1207fbfb0973327b3d; KEY1=10e5dacf2e000bace0f4ae8265c86e71
KID2=4440f98ff26d514ca01d65aa81a049c0; KEY2=0416bf43e3b1d833c6247c1b88c38832
KID3=f29da1910f02a9f722d5b87818d8e9d7; KEY3=74d1e83ce83a0a507aa9ebbdd3004ab7
KID4=ecc458ee315a80b92662aaf855001b65; KEY4=f15479f83d2b0f2511c8f4aeef4501cc

mkdir -p $WORK/{transcoded,watermarked,periods,packaged}

# ── BƯỚC 1: Clone / update repo ─────────────────────────────────
log "STEP 1: Repo"
if [ -d $REPO ]; then
  cd $REPO && git pull --quiet
else
  git clone https://github.com/tdChu4n/NT219.Q22.ANTT-Cryptography $REPO
fi

# ── BƯỚC 2: Transcode ───────────────────────────────────────────
log "STEP 2: Transcode 1080p"
ffmpeg -i $MOVIE -vf scale=1920:1080 -c:v libx264 -crf 20 -preset medium -an -y $WORK/transcoded/1080p.mp4

log "STEP 2: Transcode 720p"
ffmpeg -i $MOVIE -vf scale=1280:720 -c:v libx264 -crf 20 -preset medium -an -y $WORK/transcoded/720p.mp4

log "STEP 2: Transcode 480p"
ffmpeg -i $MOVIE -vf scale=854:480 -c:v libx264 -crf 20 -preset medium -an -y $WORK/transcoded/480p.mp4

log "STEP 2: Extract audio"
ffmpeg -i $MOVIE -vn -c:a aac -b:a 128k -y $WORK/transcoded/audio.mp4

# ── BƯỚC 3: Watermark (chậm ~3-4 tiếng) ────────────────────────
cd $REPO
for q in 1080p 720p 480p; do
  log "STEP 3: Watermark $q..."
  python3 watermark/embed.py \
    --in $WORK/transcoded/${q}.mp4 \
    --out $WORK/watermarked/${q}_wm.mp4 \
    --user-id demo_user \
    --strength 14 --redundancy 16 --frame-stride 30 \
    --video-encoder ffmpeg
  log "STEP 3: Watermark $q DONE"
done

# ── BƯỚC 4: Split 4 period (mỗi period ~1575s = 26p15s) ─────────
log "STEP 4: Split periods"
for q in 1080p 720p 480p; do
  ffmpeg -i $WORK/watermarked/${q}_wm.mp4 -ss 0    -t 1575 -c copy -y $WORK/periods/${q}_p1.mp4
  ffmpeg -i $WORK/watermarked/${q}_wm.mp4 -ss 1575 -t 1575 -c copy -y $WORK/periods/${q}_p2.mp4
  ffmpeg -i $WORK/watermarked/${q}_wm.mp4 -ss 3150 -t 1575 -c copy -y $WORK/periods/${q}_p3.mp4
  ffmpeg -i $WORK/watermarked/${q}_wm.mp4 -ss 4725          -c copy -y $WORK/periods/${q}_p4.mp4
done
ffmpeg -i $WORK/transcoded/audio.mp4 -ss 0    -t 1575 -c copy -y $WORK/periods/audio_p1.mp4
ffmpeg -i $WORK/transcoded/audio.mp4 -ss 1575 -t 1575 -c copy -y $WORK/periods/audio_p2.mp4
ffmpeg -i $WORK/transcoded/audio.mp4 -ss 3150 -t 1575 -c copy -y $WORK/periods/audio_p3.mp4
ffmpeg -i $WORK/transcoded/audio.mp4 -ss 4725          -c copy -y $WORK/periods/audio_p4.mp4

# ── BƯỚC 5: Package CENC ────────────────────────────────────────
log "STEP 5: Package CENC"
pack_period() {
  local P=$1 KID=$2 KEY=$3
  log "  Packaging period $P (KID=${KID:0:8}...)"
  packager \
    "in=$WORK/periods/1080p_p${P}.mp4,stream=video,init_segment=$WORK/packaged/p${P}_v1080_init.mp4,segment_template=$WORK/packaged/p${P}_v1080_\$Number\$.m4s" \
    "in=$WORK/periods/720p_p${P}.mp4,stream=video,init_segment=$WORK/packaged/p${P}_v720_init.mp4,segment_template=$WORK/packaged/p${P}_v720_\$Number\$.m4s" \
    "in=$WORK/periods/480p_p${P}.mp4,stream=video,init_segment=$WORK/packaged/p${P}_v480_init.mp4,segment_template=$WORK/packaged/p${P}_v480_\$Number\$.m4s" \
    "in=$WORK/periods/audio_p${P}.mp4,stream=audio,init_segment=$WORK/packaged/p${P}_a_init.mp4,segment_template=$WORK/packaged/p${P}_a_\$Number\$.m4s" \
    --enable_raw_key_encryption \
    --protection_scheme cenc \
    --keys "label=:key_id=${KID}:key=${KEY}" \
    --segment_duration 4 \
    --mpd_output $WORK/packaged/p${P}.mpd
}

pack_period 1 $KID1 $KEY1
pack_period 2 $KID2 $KEY2
pack_period 3 $KID3 $KEY3
pack_period 4 $KID4 $KEY4

# ── BƯỚC 6: Merge MPD ───────────────────────────────────────────
log "STEP 6: Merge MPD"
python3 $REPO/media-processing/merge_mpd.py \
  $WORK/packaged/p1.mpd \
  $WORK/packaged/p2.mpd \
  $WORK/packaged/p3.mpd \
  $WORK/packaged/p4.mpd \
  --out $WORK/packaged/manifest_movie.mpd \
  --period-durations 1575 1575 1575 1574

# ── BƯỚC 7: Deploy ──────────────────────────────────────────────
log "STEP 7: Deploy"
sudo cp $WORK/packaged/*.m4s $DEPLOY/
sudo cp $WORK/packaged/*_init.mp4 $DEPLOY/
sudo cp $WORK/packaged/manifest_movie.mpd $DEPLOY/
sudo chown www-data:www-data $DEPLOY/*.m4s $DEPLOY/*_init.mp4 $DEPLOY/manifest_movie.mpd

log "=== DONE === Verify:"
curl -s -o /dev/null -w "manifest HTTP %{http_code}\n" http://localhost/video/manifest_movie.mpd
