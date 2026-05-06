#!/bin/sh
# =====================================================================
#  cdn-sim · Nginx entrypoint (Task T1.6 — TLS + Cert Pin)
#
#  Mục đích:
#    1. Khi container start, kiểm tra cert TLS đã mount tại
#       /etc/nginx/certs/{fullchain.pem, privkey.pem}.
#       - Có cert  → tính SPKI SHA-256 (RFC 7469) làm cert pin.
#       - Không có → tự sinh cert tạm (RSA-2048, 30 ngày) để nginx
#         vẫn boot được; pin sẽ ghi rõ "ephemeral-…" trong log.
#    2. Sinh /etc/nginx/conf.d/00-cert-pin.conf với biến `$cdn_cert_pin`
#       để nginx.conf gắn vào header `X-CDN-Cert-Pin`.
#    3. Sinh /etc/nginx/conf.d/01-tls-enabled.conf với biến `$tls_enabled`
#       để server { listen 80 } có thể redirect 301 sang HTTPS.
#    4. Validate config (`nginx -t`) rồi exec nginx ở foreground.
#
#  Lưu ý mật mã:
#    - Pin tính từ SubjectPublicKeyInfo (SPKI) — chuẩn của HPKP &
#      Chrome/Firefox cert-pinning. Khi rotate cert nhưng giữ key cũ,
#      pin KHÔNG đổi → cấp cert mới định kỳ vẫn an toàn cho client.
#    - Header này phục vụ "soft pin" cho Player browser: trình duyệt
#      đã validate cert qua OS trust store, Player kiểm tra thêm
#      `X-CDN-Cert-Pin` khớp danh sách pin hardcoded → fail-fast khi
#      MITM/CA giả mạo dù attacker có cert "valid" nhưng khác key.
# =====================================================================
set -eu

CERT_DIR="/etc/nginx/certs"
CERT="$CERT_DIR/fullchain.pem"
KEY="$CERT_DIR/privkey.pem"
PIN_CONF="/etc/nginx/conf.d/00-cert-pin.conf"
TLS_FLAG="/etc/nginx/conf.d/01-tls-enabled.conf"
PIN_FILE="$CERT_DIR/pin.sha256.txt"

mkdir -p "$CERT_DIR"

EPHEMERAL=0
if [ ! -f "$CERT" ] || [ ! -f "$KEY" ]; then
    echo "[entrypoint] ⚠ Không thấy cert mount tại $CERT_DIR — sinh cert tạm để nginx boot."
    echo "             (Production: chạy gen-selfsigned-cert.sh hoặc cấp cert thật.)"
    openssl req -x509 -nodes -newkey rsa:2048 \
        -keyout "$KEY" \
        -out    "$CERT" \
        -days   30 \
        -subj   "/C=VN/ST=HCM/O=NT219/OU=ephemeral/CN=cdn.local" \
        -addext "subjectAltName=DNS:cdn.local,DNS:localhost,IP:127.0.0.1" \
        2>/dev/null
    EPHEMERAL=1
fi

# ---- Tính SPKI SHA-256 (Base64) ----
PIN_VALUE=$(openssl x509 -in "$CERT" -pubkey -noout 2>/dev/null \
    | openssl pkey -pubin -outform DER 2>/dev/null \
    | openssl dgst -sha256 -binary 2>/dev/null \
    | openssl base64 -A 2>/dev/null \
    || echo "error")

# Ghi ra pin.sha256.txt để dev/CI dễ copy vào player/src/config/certPins.ts.
{
    echo "# SHA-256 SPKI pin của cdn-sim (RFC 7469 format)"
    echo "# Sinh tự động bởi entrypoint.sh — copy giá trị bên dưới sang"
    echo "# player/src/config/certPins.ts cho strict pinning."
    if [ "$EPHEMERAL" = "1" ]; then
        echo "# (EPHEMERAL — cert tạm, sẽ đổi mỗi lần restart container)"
    fi
    echo "sha256-${PIN_VALUE}"
} > "$PIN_FILE" 2>/dev/null || true

# Map biến nginx cho header X-CDN-Cert-Pin.
cat > "$PIN_CONF" <<EOF
# Auto-generated bởi entrypoint.sh — KHÔNG sửa tay.
map \$host \$cdn_cert_pin {
    default "sha256-${PIN_VALUE}";
}
EOF

# Flag bật/tắt redirect HTTP → HTTPS (HTTP server block dùng nó).
cat > "$TLS_FLAG" <<EOF
map \$host \$tls_enabled {
    default 1;
}
EOF

if [ "$EPHEMERAL" = "1" ]; then
    echo "[entrypoint] 🟡 TLS up · pin=sha256-${PIN_VALUE} (ephemeral)"
else
    echo "[entrypoint] ✅ TLS up · pin=sha256-${PIN_VALUE}"
fi

# Validate config trước khi exec — fail nhanh nếu cấu hình sai.
nginx -t

exec nginx -g 'daemon off;'
