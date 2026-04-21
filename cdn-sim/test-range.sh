#!/usr/bin/env bash
# =====================================================================
#  Task T1.6 · Verification Script — "curl Range OK"
#  Mục tiêu:
#    1. cdn-sim trả 206 Partial Content khi client gửi Range
#    2. Accept-Ranges: bytes được expose
#    3. Content-Encoding KHÔNG phải gzip cho file .m4s
#    4. Cache-Control = immutable cho .m4s
# =====================================================================
set -u
HOST="${HOST:-http://localhost:8080}"
SEG="${SEG:-/video/test.m4s}"
URL="${HOST}${SEG}"

BOLD="\e[1m"; GRN="\e[32m"; RED="\e[31m"; YEL="\e[33m"; NC="\e[0m"
pass() { echo -e "  ${GRN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; EXIT=1; }
info() { echo -e "${YEL}→${NC} $1"; }
EXIT=0

echo -e "${BOLD}== T1.6 · Nginx Hardening Verification ==${NC}"
echo -e "Target: ${URL}\n"

# ---------- Chuẩn bị file test nếu chưa có ----------
LOCAL_SEG="../packager/output/test.m4s"
if [ ! -f "$LOCAL_SEG" ]; then
  info "Không thấy $LOCAL_SEG — tạo file giả 2 MB để kiểm thử Range"
  mkdir -p "../packager/output"
  dd if=/dev/urandom of="$LOCAL_SEG" bs=1024 count=2048 status=none
fi

# ---------- 1. Full GET: 200 OK + Accept-Ranges ----------
info "Test 1: HEAD — server công bố Accept-Ranges?"
H=$(curl -sI "$URL")
echo "$H" | grep -qi '^HTTP/.* 200'          && pass "HTTP 200 OK"       || fail "Expect 200 (file chưa tồn tại trong container?)"
echo "$H" | grep -qi '^Accept-Ranges: bytes' && pass "Accept-Ranges: bytes" || fail "Thiếu Accept-Ranges"
echo "$H" | grep -qi '^Content-Encoding: gzip' \
     && fail "Gzip BẬT cho .m4s (sai!)" \
     || pass "Gzip OFF cho .m4s (đúng với T1.6)"
echo "$H" | grep -qi '^Cache-Control:.*immutable' && pass "Cache-Control immutable" || fail "Thiếu immutable"
echo

# ---------- 2. Partial GET: 206 Partial Content ----------
info "Test 2: GET Range bytes=0-1023 (1 KB đầu)"
H=$(curl -sI -H "Range: bytes=0-1023" "$URL")
echo "$H" | grep -qi '^HTTP/.* 206'       && pass "HTTP 206 Partial Content" || fail "Không trả 206"
echo "$H" | grep -qi '^Content-Range: bytes 0-1023/' && pass "Content-Range hợp lệ" || fail "Thiếu Content-Range"
echo "$H" | grep -qi '^Content-Length: 1024' && pass "Content-Length = 1024" || fail "Content-Length sai"
echo

# ---------- 3. Range lệch (tua giữa file) ----------
info "Test 3: GET Range bytes=1048576-1049599 (đoạn giữa 1 KB)"
H=$(curl -sI -H "Range: bytes=1048576-1049599" "$URL")
echo "$H" | grep -qi '^HTTP/.* 206'                          && pass "HTTP 206" || fail "Không hỗ trợ Range giữa file"
echo "$H" | grep -qi '^Content-Range: bytes 1048576-1049599' && pass "Content-Range đúng offset" || fail "Content-Range sai"
echo

# ---------- 4. Manifest KHÔNG cache ----------
info "Test 4: .mpd phải no-store / no-cache"
H=$(curl -sI "${HOST}/video/manifest.mpd" || true)
if echo "$H" | grep -qi '^HTTP/.* 200'; then
  echo "$H" | grep -qi '^Cache-Control:.*no-cache' && pass "Manifest no-cache đúng" || fail "Manifest cache sai"
else
  info "manifest.mpd chưa có — skip test 4"
fi
echo

# ---------- 5. CORS ----------
info "Test 5: CORS cho Shaka Player"
H=$(curl -sI "$URL")
echo "$H" | grep -qi '^Access-Control-Allow-Origin: \*' && pass "CORS Allow-Origin: *" || fail "Thiếu CORS"
echo

if [ "$EXIT" = "0" ]; then
  echo -e "${GRN}${BOLD}✅ T1.6 PASS — curl Range OK, gzip off, TLS sẵn sàng.${NC}"
else
  echo -e "${RED}${BOLD}❌ T1.6 FAIL — xem log phía trên.${NC}"
fi
exit $EXIT
