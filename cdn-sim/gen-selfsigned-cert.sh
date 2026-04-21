#!/usr/bin/env bash
# =====================================================================
#  Task T1.6 · Chuẩn bị TLS — sinh self-signed cert cho dev/local test
#  Output: ./certs/fullchain.pem  ./certs/privkey.pem
#  Production: dùng Let's Encrypt / cert nội bộ thay cho script này.
# =====================================================================
set -euo pipefail
CERT_DIR="$(dirname "$0")/certs"
mkdir -p "$CERT_DIR"

CN="${CN:-cdn.local}"
DAYS="${DAYS:-365}"

openssl req -x509 -nodes -newkey rsa:2048 \
    -keyout "$CERT_DIR/privkey.pem" \
    -out    "$CERT_DIR/fullchain.pem" \
    -days   "$DAYS" \
    -subj   "/C=VN/ST=HCM/L=UIT/O=NT219/OU=Capstone/CN=$CN" \
    -addext "subjectAltName=DNS:$CN,DNS:localhost,IP:127.0.0.1"

chmod 600 "$CERT_DIR/privkey.pem"
echo "[OK] Self-signed cert đã tạo tại $CERT_DIR/ (CN=$CN, $DAYS ngày)"
echo "Bước tiếp: bỏ comment block 'server { listen 443 ssl ... }' trong nginx.conf rồi rebuild."
