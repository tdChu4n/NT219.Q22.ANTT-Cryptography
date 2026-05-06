#!/usr/bin/env bash
# =====================================================================
#  Task T1.6 · Sinh self-signed cert TLS cho cdn-sim (dev/local).
#
#  Output:
#    cdn-sim/certs/fullchain.pem      — cert (PEM, x509)
#    cdn-sim/certs/privkey.pem        — RSA-2048 private key
#    cdn-sim/certs/pin.sha256.txt     — SPKI SHA-256 (RFC 7469)
#    cdn-sim/certs/san.cnf            — config tạm (xoá ngay sau khi tạo)
#
#  Production: thay self-signed bằng Let's Encrypt / cert nội bộ CA.
#  Player phải copy giá trị pin.sha256.txt sang
#  player/src/config/certPins.ts để bật strict pinning.
# =====================================================================
set -euo pipefail

CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

CN="${CN:-cdn.local}"
DAYS="${DAYS:-365}"
KEY="$CERT_DIR/privkey.pem"
CERT="$CERT_DIR/fullchain.pem"
SAN_CNF="$CERT_DIR/san.cnf"
PIN_FILE="$CERT_DIR/pin.sha256.txt"

# ---- 1. Sinh RSA-2048 private key ----
echo "[1/3] Sinh RSA-2048 private key…"
openssl genrsa -out "$KEY" 2048 >/dev/null 2>&1
chmod 600 "$KEY"

# ---- 2. Tạo cert có SAN (để Chrome chấp nhận localhost + cdn.local) ----
echo "[2/3] Sinh self-signed cert (CN=$CN, $DAYS ngày, SAN: localhost, $CN, 127.0.0.1)…"
cat > "$SAN_CNF" <<EOF
[req]
default_bits       = 2048
prompt             = no
default_md         = sha256
distinguished_name = dn
x509_extensions    = v3_req

[dn]
C  = VN
ST = HCM
L  = UIT
O  = NT219
OU = Capstone
CN = $CN

[v3_req]
subjectAltName   = @alt_names
keyUsage         = digitalSignature, keyEncipherment
extendedKeyUsage = serverAuth

[alt_names]
DNS.1 = $CN
DNS.2 = localhost
DNS.3 = cdn-sim
IP.1  = 127.0.0.1
EOF

openssl req -new -x509 -key "$KEY" -out "$CERT" -days "$DAYS" -config "$SAN_CNF" >/dev/null 2>&1
rm -f "$SAN_CNF"

# ---- 3. Tính SPKI SHA-256 (RFC 7469 cert pin format) ----
echo "[3/3] Tính SPKI SHA-256 fingerprint cho cert pinning…"
PIN_RAW=$(openssl x509 -in "$CERT" -pubkey -noout \
    | openssl pkey -pubin -outform DER \
    | openssl dgst -sha256 -binary \
    | openssl base64 -A)

cat > "$PIN_FILE" <<EOF
# SHA-256 SPKI pin của cdn-sim (RFC 7469 format).
# Sinh tự động bởi gen-selfsigned-cert.sh — copy giá trị bên dưới sang
# player/src/config/certPins.ts cho strict pinning.
sha256-${PIN_RAW}
EOF

echo
echo "=== DONE ==="
echo "  Private key  : $KEY"
echo "  Certificate  : $CERT"
echo "  Pin (SHA-256): $PIN_FILE"
echo
echo "Pin SHA-256 (copy vào player/src/config/certPins.ts):"
echo "  sha256-${PIN_RAW}"
echo
echo "Bước tiếp:"
echo "  1. docker compose -f infra/docker-compose.yml up -d --build cdn-sim"
echo "  2. curl -kI https://localhost:8443/healthz   # phải 200, có HSTS + X-CDN-Cert-Pin"
echo "  3. Cập nhật pin trong player/src/config/certPins.ts rồi npm run dev"
