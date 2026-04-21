# =====================================================================
#  CDN-SIM container — Nginx phục vụ video segments (DASH/HLS)
#  Task T1.6: Hardening — Range request, gzip off cho .m4s, sẵn TLS
# =====================================================================
FROM nginx:1.27-alpine

# Copy config hardening
COPY nginx.conf /etc/nginx/nginx.conf

# Thư mục chứa TLS cert (sẽ mount từ host hoặc để trống cho HTTP-only)
RUN mkdir -p /etc/nginx/certs \
 && mkdir -p /usr/share/nginx/html/video

# Health check đơn giản cho orchestrator
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
    CMD wget -qO- http://127.0.0.1/healthz || exit 1

EXPOSE 80
EXPOSE 443
