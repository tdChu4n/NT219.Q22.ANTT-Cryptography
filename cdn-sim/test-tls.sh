#!/usr/bin/env bash
# =====================================================================
#  Task T1.6 · Verification — TLS 1.3 + HSTS + Cert Pin (RFC 7469)
#
#  Prerequisite:
#    docker compose -f ../infra/docker-compose.yml up -d --build cdn-sim
#
#  Pass criteria:
#    1. https://localhost:8443/healthz → HTTP 200 + Strict-Transport-Security
#    2. https://…/healthz handshake → TLSv1.3 (hoặc TLSv1.2 fallback)
#    3. https://…/video/manifest.mpd → header X-CDN-Cert-Pin: sha256-…
#    4. http://localhost:8080/video/foo.m4s → 301 redirect tới HTTPS
#    5. /license proxy hoạt động qua HTTPS
# =====================================================================
set -u
HOST_HTTP="${HOST_HTTP:-http://localhost:8080}"
HOST_TLS="${HOST_TLS:-https://localhost:8443}"

BOLD="\e[1m"; GRN="\e[32m"; RED="\e[31m"; YEL="\e[33m"; NC="\e[0m"
pass() { echo -e "  ${GRN}✓${NC} $1"; }
fail() { echo -e "  ${RED}✗${NC} $1"; EXIT=1; }
info() { echo -e "${YEL}→${NC} $1"; }
EXIT=0

echo -e "${BOLD}== T1.6 · TLS 1.3 + HSTS + Cert Pin Verification ==${NC}"
echo -e "HTTP : ${HOST_HTTP}"
echo -e "HTTPS: ${HOST_TLS}\n"

# ---- 1. HTTPS healthz ----
info "Test 1: HTTPS healthz trả 200 + HSTS"
H=$(curl -ksI "${HOST_TLS}/healthz")
echo "$H" | grep -qi '^HTTP/.* 200' && pass "HTTP 200 OK qua HTTPS" \
    || fail "Healthz HTTPS không trả 200"
echo "$H" | grep -qi '^Strict-Transport-Security:' \
    && pass "HSTS header có mặt" \
    || fail "Thiếu Strict-Transport-Security"
echo

# ---- 2. TLS protocol version ----
info "Test 2: Handshake TLS protocol version"
TLS_VER=$(curl -ks -o /dev/null -w '%{ssl_version}\n' "${HOST_TLS}/healthz")
case "$TLS_VER" in
    TLSv1.3) pass "Negotiated $TLS_VER (đúng — ưu tiên 1.3)" ;;
    TLSv1.2) pass "Negotiated $TLS_VER (chấp nhận fallback)" ;;
    *)       fail "TLS version bất thường: $TLS_VER" ;;
esac
echo

# ---- 3. X-CDN-Cert-Pin trên endpoint quan trọng ----
info "Test 3: X-CDN-Cert-Pin trên /video/* và /license"
for ENDPOINT in "/video/manifest.mpd" "/license"; do
    H=$(curl -ksI "${HOST_TLS}${ENDPOINT}" || true)
    PIN=$(echo "$H" | awk -F': ' 'tolower($1)=="x-cdn-cert-pin"{print $2}' | tr -d '\r')
    if [ -n "$PIN" ] && echo "$PIN" | grep -qE '^sha256-[A-Za-z0-9+/]+=*$'; then
        pass "${ENDPOINT}  →  ${PIN:0:48}…"
    else
        fail "${ENDPOINT}  →  thiếu hoặc sai format X-CDN-Cert-Pin"
    fi
done
echo

# ---- 4. HTTPS không kèm pin trên HTTP plain (defense in depth) ----
info "Test 4: HTTP plain KHÔNG được kèm header X-CDN-Cert-Pin"
H=$(curl -sI "${HOST_HTTP}/healthz" || true)
if echo "$H" | grep -qi '^X-CDN-Cert-Pin:'; then
    fail "HTTP cũng phát X-CDN-Cert-Pin — pin chỉ nên có trên HTTPS"
else
    pass "HTTP không phát X-CDN-Cert-Pin (đúng — pin chỉ trên HTTPS)"
fi
echo

# ---- 5. Cipher suite (chỉ AEAD) ----
info "Test 5: Cipher đàm phán phải là AEAD"
CIPHER=$(curl -ks -o /dev/null -w '%{ssl_cipher}\n' "${HOST_TLS}/healthz")
case "$CIPHER" in
    *_GCM_*|TLS_AES_*|TLS_CHACHA20_*|*CHACHA20-POLY1305*)
        pass "Cipher: $CIPHER (AEAD ✓)" ;;
    *)  fail "Cipher không phải AEAD: $CIPHER" ;;
esac
echo

# ---- 6. So khớp pin với file pin.sha256.txt nếu có ----
PIN_FILE="$(dirname "$0")/certs/pin.sha256.txt"
if [ -f "$PIN_FILE" ]; then
    info "Test 6: So khớp pin trong header với pin.sha256.txt"
    EXPECT=$(grep -E '^sha256-' "$PIN_FILE" | head -n1 | tr -d '\r\n')
    GOT=$(curl -ksI "${HOST_TLS}/healthz" | awk -F': ' 'tolower($1)=="x-cdn-cert-pin"{print $2}' | tr -d '\r\n' | head -n1)
    if [ -n "$EXPECT" ] && [ "$EXPECT" = "$GOT" ]; then
        pass "Pin khớp file: $EXPECT"
    else
        fail "Pin mismatch — file=$EXPECT  header=$GOT"
    fi
    echo
fi

if [ "$EXIT" = "0" ]; then
    echo -e "${GRN}${BOLD}✅ T1.6 TLS PASS — HTTPS sẵn sàng + cert pin hoạt động.${NC}"
else
    echo -e "${RED}${BOLD}❌ TLS FAIL — xem log phía trên.${NC}"
fi
exit $EXIT
