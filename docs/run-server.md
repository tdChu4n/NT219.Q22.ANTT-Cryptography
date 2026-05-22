# Hướng dẫn chạy server

Tài liệu này dành cho thành viên trong nhóm khi cần chạy nhanh server để demo,
test API hoặc triển khai lên máy ảo Ubuntu.

## 1. Chọn cách chạy

| Nhu cầu | Cách chạy |
| --- | --- |
| Test nhanh API trên máy cá nhân | Chạy `license-server` local, có thể bỏ MongoDB để dùng PoC mode |
| Demo đầy đủ trên 1 máy/1 VM | MongoDB + `license-server` + Nginx trên cùng máy |
| Triển khai đúng kiến trúc báo cáo | 3 VM: `vm-db`, `vm-app`, `vm-edge` |

Khuyến nghị cho demo nhóm: chạy bản **1 VM Ubuntu** trước. Khi ổn định mới tách
thành 3 VM.

## 2. Yêu cầu phần mềm

### Windows local

- Node.js 20 hoặc mới hơn.
- MongoDB Community Server nếu muốn chạy DB mode.
- Git Bash hoặc WSL nếu muốn chạy `infra/smoke-test.sh`.

### Ubuntu VM

- Ubuntu 22.04/24.04.
- Node.js 20.
- MongoDB.
- Nginx.
- OpenSSL.
- FFmpeg, Shaka Packager, Bento4 nếu VM đó xử lý media.

## 3. Chạy nhanh License Server trên máy cá nhân

Dùng cách này để test API trước, chưa cần Nginx/CDN.

### PowerShell

```powershell
cd D:\NT219.Q22.ANTT-Cryptography\license-server
npm install

$env:PORT="3000"
$env:DB_NAME="drm_platform"
$env:KMS_MASTER_KEY=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
$env:JWT_HS256_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")

# Nếu có MongoDB local thì bật dòng này. Nếu không set MONGO_URI, server chạy PoC mode.
$env:MONGO_URI="mongodb://127.0.0.1:27017"

npm start
```

Kiểm tra:

```powershell
curl http://127.0.0.1:3000/
```

Nếu thấy JSON `status: ok` là server đã chạy.

### Bash / Ubuntu

```bash
cd /path/to/NT219.Q22.ANTT-Cryptography/license-server
npm install

export PORT=3000
export DB_NAME=drm_platform
export KMS_MASTER_KEY="$(openssl rand -hex 32)"
export JWT_HS256_SECRET="$(openssl rand -hex 32)"

# Nếu có MongoDB local thì bật dòng này. Nếu không set MONGO_URI, server chạy PoC mode.
export MONGO_URI="mongodb://127.0.0.1:27017"

npm start
```

## 4. Khởi tạo MongoDB

Chạy bước này khi dùng DB mode.

```bash
cd /path/to/NT219.Q22.ANTT-Cryptography
cd license-server && npm install && cd ..

export MONGO_URI="mongodb://127.0.0.1:27017"
export DB_NAME="drm_platform"
node database/migrate_init.js
```

Trên PowerShell:

```powershell
cd D:\NT219.Q22.ANTT-Cryptography
cd license-server; npm install; cd ..

$env:MONGO_URI="mongodb://127.0.0.1:27017"
$env:DB_NAME="drm_platform"
node database\migrate_init.js
```

## 5. Triển khai 1 VM Ubuntu

Mục tiêu: chạy MongoDB, `license-server`, Nginx/CDN trên cùng một VM.

### 5.1. Cài package

```bash
sudo apt-get update
sudo apt-get install -y curl git nginx openssl rsync
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Cài MongoDB theo hướng dẫn chính thức của MongoDB cho Ubuntu, sau đó kiểm tra:

```bash
sudo systemctl status mongod
```

### 5.2. Chuẩn bị thư mục

```bash
sudo mkdir -p /opt/nt219/app /opt/nt219/app/database /srv/nt219/media/video /etc/nt219/certs
sudo useradd --system --home /opt/nt219/app/license-server --shell /usr/sbin/nologin nt219-license || true
sudo chown -R nt219-license:nt219-license /opt/nt219/app/database
sudo chown -R www-data:www-data /srv/nt219/media/video
sudo chmod 750 /etc/nt219
```

Copy hoặc clone repo vào:

```text
/opt/nt219/app
```

### 5.3. Cài dependency Node.js

```bash
cd /opt/nt219/app/license-server
npm ci --omit=dev
```

### 5.4. Tạo file môi trường

```bash
cd /opt/nt219/app
sudo cp infra/vm/license-server.env.example /etc/nt219/license-server.env
sudo nano /etc/nt219/license-server.env
sudo chmod 600 /etc/nt219/license-server.env
```

Với 1 VM, nội dung tối thiểu:

```env
NODE_ENV=production
PORT=3000
MONGO_URI=mongodb://127.0.0.1:27017
DB_NAME=drm_platform
KMS_MASTER_KEY=<64-hex>
JWT_HS256_SECRET=<secret>
```

Sinh secret:

```bash
openssl rand -hex 32
```

### 5.5. Chạy migration

```bash
cd /opt/nt219/app
set -a
. /etc/nt219/license-server.env
set +a
node database/migrate_init.js
```

### 5.6. Chạy license server bằng systemd

```bash
cd /opt/nt219/app
sudo chown -R nt219-license:nt219-license /opt/nt219/app/license-server /opt/nt219/app/database
sudo cp infra/vm/license-server.service /etc/systemd/system/license-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now license-server
sudo systemctl status license-server
```

Xem log:

```bash
sudo journalctl -u license-server -f
```

Kiểm tra API:

```bash
curl http://127.0.0.1:3000/
```

### 5.7. Cấu hình Nginx CDN

```bash
cd /opt/nt219/app
sudo cp infra/vm/nginx-cdn.conf /etc/nginx/sites-available/nt219-cdn.conf
sudo ln -sf /etc/nginx/sites-available/nt219-cdn.conf /etc/nginx/sites-enabled/nt219-cdn.conf
```

Sửa file Nginx:

```bash
sudo nano /etc/nginx/sites-available/nt219-cdn.conf
```

Với 1 VM, đổi:

```nginx
server VM_APP_PRIVATE_IP:3000;
```

thành:

```nginx
server 127.0.0.1:3000;
```

Đổi `cdn.example.local` thành hostname hoặc IP demo của VM.

Sinh cert self-signed và cert pin:

```bash
sudo bash infra/vm/generate-cert-pin.sh cdn.local /etc/nt219/certs
sudo nginx -t
sudo systemctl reload nginx
```

Kiểm tra:

```bash
curl -kI https://127.0.0.1/healthz
```

## 6. Triển khai 3 VM

### `vm-db`

- Chạy MongoDB.
- Chỉ mở `27017` cho private IP của `vm-app`.
- Bật backup định kỳ.

`MONGO_URI` trên `vm-app` sẽ có dạng:

```env
MONGO_URI=mongodb://<vm-db-private-ip>:27017
```

### `vm-app`

- Chạy `license-server` bằng `systemd`.
- File env đặt tại `/etc/nt219/license-server.env`.
- Chỉ mở port `3000` cho private IP của `vm-edge`.

### `vm-edge`

- Chạy Nginx public `80/443`.
- Sửa `infra/vm/nginx-cdn.conf`:

```nginx
server <vm-app-private-ip>:3000;
```

- Copy media đã mã hóa vào:

```text
/srv/nt219/media/video
```

## 7. Cài tool xử lý media trên VM

Chạy trên VM xử lý media hoặc VM edge nếu demo nhỏ:

```bash
cd /opt/nt219/app
sudo bash infra/vm/install-media-tools.sh
packager -version
ffmpeg -version
```

Sau khi tạo output:

```bash
rsync -av --delete media-processing/output/ /srv/nt219/media/video/
sudo chown -R www-data:www-data /srv/nt219/media/video
```

## 8. Smoke test

Chạy từ repo root.

```bash
LICENSE_BASE_URL=http://127.0.0.1:3000 \
CDN_BASE_URL=https://127.0.0.1 \
ALLOW_INSECURE_TLS=1 \
SEGMENT_PATH=/video/v_1.m4s \
bash infra/smoke-test.sh
```

Với 3 VM:

```bash
LICENSE_BASE_URL=http://<vm-app-private-ip>:3000 \
CDN_BASE_URL=https://<edge-hostname> \
ALLOW_INSECURE_TLS=1 \
SEGMENT_PATH=/video/v_1.m4s \
bash infra/smoke-test.sh
```

Nếu chưa có segment thật, smoke test có thể báo warning ở bước Range request.
Các bước health/auth/license vẫn phải pass.

## 9. Lệnh kiểm tra thường dùng

```bash
sudo systemctl status license-server
sudo journalctl -u license-server -f
sudo systemctl status nginx
sudo nginx -t
curl http://127.0.0.1:3000/
curl -kI https://127.0.0.1/healthz
curl -kI -H "Range: bytes=0-1023" https://127.0.0.1/video/v_1.m4s
```

## 10. Lỗi hay gặp

| Lỗi | Cách xử lý |
| --- | --- |
| Server log báo chạy PoC mode | Chưa set `MONGO_URI` hoặc file env chưa được systemd đọc |
| `KMS_MASTER_KEY không được set` | Thêm `KMS_MASTER_KEY` 64 hex chars vào `/etc/nt219/license-server.env` |
| Nginx lỗi `host not found in upstream` | Chưa đổi `VM_APP_PRIVATE_IP` trong `nginx-cdn.conf` |
| `curl -kI /healthz` không trả 200 | Kiểm tra `sudo nginx -t` và cert trong `/etc/nt219/certs` |
| License API trả 404 KID | Chưa import/sinh content key cho KID đang test |
| Range request trả 404 | Chưa copy segment vào `/srv/nt219/media/video` hoặc sai `SEGMENT_PATH` |
