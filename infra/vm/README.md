# Hướng dẫn triển khai trên VM (thay thế Docker)

Tài liệu này hướng dẫn chạy toàn bộ hệ thống NT219 DRM trên các Ubuntu VM
riêng biệt — thay thế luồng Docker Compose cũ.

## Mô hình khuyến nghị (3 VM)

| VM | Vai trò | Cổng mở |
|---|---|---|
| `vm-db` | MongoDB, lưu trữ key và entitlement | `27017` — chỉ từ `vm-app` |
| `vm-app` | License Server (Node.js + systemd) | `3000` — chỉ từ `vm-edge` |
| `vm-edge` | Nginx public edge, phân phối video + proxy license | `80`, `443` public |

> **Demo trên 1 máy duy nhất:** Có thể gộp cả 3 vai trò vào 1 VM.
> MongoDB và License Server bind `127.0.0.1`, Nginx bind public `80/443`.

---

## Đường dẫn chuẩn trên VM

```
/opt/nt219/app                      # thư mục gốc repo
/opt/nt219/app/license-server       # source Node.js
/srv/nt219/media/video              # manifest + segment đã mã hóa
/etc/nt219/license-server.env       # secrets/biến môi trường (chmod 600)
/etc/nt219/certs                    # fullchain.pem, privkey.pem, pin.sha256.txt
/var/log/nginx                      # log Nginx mặc định
```

Tạo user và thư mục:

```bash
sudo useradd --system --home /opt/nt219/app/license-server \
    --shell /usr/sbin/nologin nt219-license

sudo mkdir -p /opt/nt219/app /opt/nt219/app/database \
    /srv/nt219/media/video /etc/nt219/certs

sudo chown -R nt219-license:nt219-license /opt/nt219/app/license-server
sudo chown -R nt219-license:nt219-license /opt/nt219/app/database
sudo chown -R www-data:www-data /srv/nt219/media/video
sudo chmod 750 /etc/nt219
```

---

## Bước 0 — Clone repo (tất cả VM cần làm)

```bash
sudo apt-get update && sudo apt-get install -y git
sudo git clone https://github.com/tdChu4n/NT219.Q22.ANTT-Cryptography.git \
    /opt/nt219/app
sudo chown -R nt219-license:nt219-license /opt/nt219/app
```

---

## Bước 1 — Cài đặt VM Database (`vm-db`)

### 1.1 Cài MongoDB 7.x

```bash
sudo apt-get update && sudo apt-get install -y gnupg curl

curl -fsSL https://www.mongodb.org/static/pgp/server-7.0.asc \
    | sudo gpg --dearmor -o /usr/share/keyrings/mongodb-server-7.0.gpg

echo "deb [ arch=amd64,arm64 signed-by=/usr/share/keyrings/mongodb-server-7.0.gpg ] \
    https://repo.mongodb.org/apt/ubuntu jammy/mongodb-org/7.0 multiverse" \
    | sudo tee /etc/apt/sources.list.d/mongodb-org-7.0.list

sudo apt-get update && sudo apt-get install -y mongodb-org
sudo systemctl enable --now mongod
```

### 1.2 Cấu hình bind IP

Sửa `/etc/mongod.conf`:

```yaml
net:
  port: 27017
  bindIp: 127.0.0.1,<VM_DB_PRIVATE_IP>   # chỉ nghe trên private network
```

```bash
sudo systemctl restart mongod
```

### 1.3 Bật authentication và tạo user ứng dụng

```bash
# Kết nối mongo shell
mongosh

# Tạo admin user
use admin
db.createUser({
  user: "admin",
  pwd: "<ADMIN_PASSWORD>",
  roles: [ { role: "userAdminAnyDatabase", db: "admin" } ]
})

# Tạo user cho ứng dụng
use drm_platform
db.createUser({
  user: "nt219_app",
  pwd: "<APP_PASSWORD>",
  roles: [ { role: "readWrite", db: "drm_platform" } ]
})
exit
```

Bật authentication trong `/etc/mongod.conf`:

```yaml
security:
  authorization: enabled
```

```bash
sudo systemctl restart mongod
```

### 1.4 Firewall — chỉ cho `vm-app` kết nối

```bash
sudo ufw allow from <VM_APP_PRIVATE_IP> to any port 27017
sudo ufw deny 27017
```

### 1.5 Chạy migration

```bash
cd /opt/nt219/app
MONGO_URI='mongodb://nt219_app:<APP_PASSWORD>@<VM_DB_PRIVATE_IP>:27017/drm_platform' \
DB_NAME='drm_platform' \
node database/migrate_init.js
```

---

## Bước 2 — Cài đặt VM App (`vm-app`)

### 2.1 Cài Node.js 20

```bash
sudo apt-get update && sudo apt-get install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v   # phải là v20.x
```

### 2.2 Cài dependencies

```bash
cd /opt/nt219/app/license-server
sudo -u nt219-license npm ci --omit=dev
```

### 2.3 Cấu hình biến môi trường

```bash
sudo mkdir -p /etc/nt219
sudo cp /opt/nt219/app/infra/vm/license-server.env.example \
    /etc/nt219/license-server.env
sudo chmod 600 /etc/nt219/license-server.env
sudo nano /etc/nt219/license-server.env   # điền MONGO_URI, KMS_MASTER_KEY, JWT_HS256_SECRET
```

Sinh `KMS_MASTER_KEY`:

```bash
openssl rand -hex 32   # copy kết quả vào KMS_MASTER_KEY
```

### 2.4 Đăng ký systemd service

```bash
sudo cp /opt/nt219/app/infra/vm/license-server.service \
    /etc/systemd/system/license-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now license-server
sudo systemctl status license-server
```

### 2.5 Firewall — chỉ cho `vm-edge` kết nối

```bash
sudo ufw allow from <VM_EDGE_PRIVATE_IP> to any port 3000
sudo ufw deny 3000
```

---

## Bước 3 — Cài đặt VM Edge (`vm-edge`)

### 3.1 Cài Nginx

```bash
sudo apt-get update && sudo apt-get install -y nginx openssl rsync
sudo mkdir -p /srv/nt219/media/video /etc/nt219/certs
sudo chown -R www-data:www-data /srv/nt219/media/video
```

### 3.2 Cấu hình Nginx

Sửa các placeholder trong file config:

```bash
sudo cp /opt/nt219/app/infra/vm/nginx-cdn.conf \
    /etc/nginx/sites-available/nt219-cdn.conf

sudo nano /etc/nginx/sites-available/nt219-cdn.conf
# Thay VM_APP_PRIVATE_IP → IP thật của vm-app
# Thay cdn.example.local  → hostname thật (hoặc IP của vm-edge)

sudo ln -sf /etc/nginx/sites-available/nt219-cdn.conf \
    /etc/nginx/sites-enabled/nt219-cdn.conf
sudo rm -f /etc/nginx/sites-enabled/default
```

### 3.3 Sinh TLS cert và cert pin

```bash
sudo bash /opt/nt219/app/infra/vm/generate-cert-pin.sh \
    cdn.local /etc/nt219/certs

sudo nginx -t && sudo systemctl reload nginx
```

Giá trị `pin.sha256.txt` cần đồng bộ vào cấu hình player nếu bật cert pinning strict.

### 3.4 Đẩy media lên edge

Từ máy xử lý media (hoặc `vm-edge` trực tiếp):

```bash
rsync -av --delete media-processing/output/ \
    vm-edge:/srv/nt219/media/video/
```

---

## Bước 4 — Cài công cụ xử lý media (trên `vm-edge` hoặc VM riêng)

```bash
sudo bash /opt/nt219/app/infra/vm/install-media-tools.sh
packager -version
ffmpeg -version
```

---

## Thứ tự khởi động và kiểm tra

1. **Start MongoDB** (`vm-db`) → xác nhận firewall private
2. **Chạy migration** database
3. **Start `license-server`** (`vm-app`) → `systemctl status license-server`
4. **Start Nginx** (`vm-edge`) → `nginx -t && systemctl reload nginx`
5. **Chạy smoke test** từ repo root:

```bash
LICENSE_BASE_URL=http://<vm-app-private-ip>:3000 \
CDN_BASE_URL=https://<vm-edge-hostname> \
SEGMENT_PATH=/video/chunk-stream0-00001.m4s \
bash infra/smoke-test.sh
```

---

## Checklist bảo mật

- [ ] `KMS_MASTER_KEY` là 64 hex chars và được backup an toàn (ngoài VM)
- [ ] `/etc/nt219/license-server.env` quyền `600`, owner `root`
- [ ] MongoDB không public Internet (chỉ bind private IP)
- [ ] Port `3000` chỉ cho `vm-edge` (ufw rule)
- [ ] Port `27017` chỉ cho `vm-app` (ufw rule)
- [ ] TLS cert hợp lệ, cert pin đã đồng bộ vào player config
- [ ] Nginx không gzip video segment (đã cấu hình `gzip off` cho `.m4s`)
- [ ] Nginx trả `206 Partial Content` cho byte-range request (kiểm tra bằng `curl -r 0-1023`)
