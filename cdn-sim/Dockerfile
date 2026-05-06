# =====================================================================
#  CDN-SIM container — Nginx phục vụ video segments (DASH/HLS)
#  Task T1.6: Hardening — Range request, gzip off cho .m4s, TLS 1.3 + HSTS
#  Task T1.4: Cert pinning header (RFC 7469) phối hợp với Player
# =====================================================================
FROM nginx:1.27-alpine

# openssl: dùng trong entrypoint để tính SPKI SHA-256 + sinh cert tạm
# nếu host không mount cert thật.
RUN apk add --no-cache openssl

# Xoá default.conf của image base để tránh xung đột với block server
# tự định nghĩa trong /etc/nginx/nginx.conf (server_name _; default_server).
RUN rm -f /etc/nginx/conf.d/default.conf

# Config + entrypoint
COPY nginx.conf      /etc/nginx/nginx.conf
COPY entrypoint.sh   /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Thư mục cert TLS + thư mục video.
# /etc/nginx/certs sẽ được mount từ host (cdn-sim/certs/), entrypoint
# tự sinh cert tạm khi mount trống để nginx vẫn boot HTTPS.
RUN mkdir -p /etc/nginx/certs \
 && mkdir -p /usr/share/nginx/html/video

# Healthcheck: dùng wget tới /healthz HTTP (port 80) — vẫn được phục vụ
# kể cả khi TLS bật (xem nginx.conf, /healthz luôn HTTP để compose đơn giản).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1

EXPOSE 80
EXPOSE 443

ENTRYPOINT ["/entrypoint.sh"]
