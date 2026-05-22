# VM Deployment Guide

Tai lieu nay thay the luong chay Docker Compose bang cac dich vu native tren
Ubuntu VM: MongoDB, Node.js license server, Nginx CDN edge va tooling xu ly
media.

## Mo hinh khuyen nghi

Dung 3 VM khi co private network:

| VM | Vai tro | Cong mo |
| --- | --- | --- |
| `vm-db` | MongoDB, persistent disk, backup | `27017` chi tu `vm-app` |
| `vm-app` | `license-server` Node.js, systemd | `3000` chi tu `vm-edge` |
| `vm-edge` | Nginx public edge, `/video`, `/license` proxy | `80`, `443` public |

Neu chi demo tren lab, co the gom tat ca vao mot VM:

- MongoDB bind `127.0.0.1:27017`.
- License server bind `127.0.0.1:3000`.
- Nginx bind public `80/443` va proxy `/license` ve localhost.

## Duong dan tren VM

Khuyen nghi dung cac duong dan co dinh:

```text
/opt/nt219/app                     # repo root
/opt/nt219/app/license-server      # source Node.js API
/srv/nt219/media/video             # manifest + segment da ma hoa
/etc/nt219/license-server.env      # secrets/runtime env
/etc/nt219/certs                   # fullchain.pem, privkey.pem, pin.sha256.txt
/var/log/nginx                     # log Nginx mac dinh
```

Tao user rieng cho license server:

```bash
sudo useradd --system --home /opt/nt219/app/license-server --shell /usr/sbin/nologin nt219-license
sudo mkdir -p /opt/nt219/app/license-server /opt/nt219/app/database /srv/nt219/media/video /etc/nt219/certs
sudo chown -R nt219-license:nt219-license /opt/nt219/app/license-server
sudo chown -R nt219-license:nt219-license /opt/nt219/app/database
sudo chown -R www-data:www-data /srv/nt219/media/video
sudo chmod 750 /etc/nt219
```

## Cai dat DB VM

1. Cai MongoDB theo goi chinh thuc cua Ubuntu/MongoDB.
2. Trong `/etc/mongod.conf`, bind vao private IP cua `vm-db` hoac localhost
   neu all-in-one.
3. Bat authentication, tao user DB rieng cho ung dung.
4. Chi cho firewall tu private IP cua `vm-app` den `27017`.
5. Chay migration:

```bash
cd /opt/nt219/app
MONGO_URI='mongodb://nt219_app:<password>@<db-private-ip>:27017' \
DB_NAME='drm_platform' \
node database/migrate_init.js
```

Script migration tu dong fallback sang dependency trong
`license-server/node_modules`, nen hay chay `npm ci` cho `license-server`
truoc khi migration.

## Cai dat App VM

```bash
sudo apt-get update
sudo apt-get install -y curl git
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs
```

Clone/copy repo vao `/opt/nt219/app`, sau do:

```bash
cd /opt/nt219/app/license-server
npm ci --omit=dev
cd /opt/nt219/app
sudo cp infra/vm/license-server.env.example /etc/nt219/license-server.env
sudo chmod 600 /etc/nt219/license-server.env
sudo cp infra/vm/license-server.service /etc/systemd/system/license-server.service
sudo systemctl daemon-reload
sudo systemctl enable --now license-server
sudo systemctl status license-server
```

Cap nhat `/etc/nt219/license-server.env` truoc khi start. Bat buoc dung
`MONGO_URI`, khong dung `MONGO_URL`, vi code doc bien `MONGO_URI`.

## Cai dat Edge VM

```bash
sudo apt-get update
sudo apt-get install -y nginx openssl rsync
sudo mkdir -p /srv/nt219/media/video /etc/nt219/certs
sudo chown -R www-data:www-data /srv/nt219/media/video
sudo cp infra/vm/nginx-cdn.conf /etc/nginx/sites-available/nt219-cdn.conf
sudo ln -sf /etc/nginx/sites-available/nt219-cdn.conf /etc/nginx/sites-enabled/nt219-cdn.conf
```

Sua cac placeholder trong `nginx-cdn.conf`:

- `VM_APP_PRIVATE_IP` thanh private IP/DNS cua `vm-app`.
- `cdn.example.local` thanh hostname demo/thuc te.
- Duong dan cert neu khong dung `/etc/nt219/certs`.

Sinh hoac cap cert TLS:

```bash
sudo bash infra/vm/generate-cert-pin.sh cdn.local /etc/nt219/certs
sudo nginx -t && sudo systemctl reload nginx
```

Gia tri `pin.sha256.txt` can duoc dong bo vao config player khi bat cert
pinning strict.

## Cai dat Processing VM

Co the chay chung tren `vm-edge` cho demo, nhung nen tach ra neu media co dung
luong lon.

```bash
sudo bash infra/vm/install-media-tools.sh
packager -version
ffmpeg -version
```

Sau khi chay `ingest/transcode.sh` va `media-processing/generate_cenc_keys.py`,
sync output da ma hoa sang edge:

```bash
rsync -av --delete media-processing/output/ vm-edge:/srv/nt219/media/video/
```

Chi publish ciphertext/manifest ra edge. Key JSON va material tao key khong
nen nam tren public edge VM lau dai.

## Thu tu start va kiem tra

1. Start MongoDB va xac nhan firewall private.
2. Chay migration database.
3. Start `license-server`.
4. Start Nginx edge.
5. Chay smoke test tu repo root:

```bash
LICENSE_BASE_URL=http://<vm-app-private-ip>:3000 \
CDN_BASE_URL=https://<edge-hostname> \
SEGMENT_PATH=/video/v_1.m4s \
bash infra/smoke-test.sh
```

## Checklist bao mat

- `KMS_MASTER_KEY` la 64 hex chars va duoc backup an toan.
- `/etc/nt219/license-server.env` quyen `600`, owner `root`.
- MongoDB khong public Internet.
- Port `3000` chi cho `vm-edge`.
- Port `27017` chi cho `vm-app`.
- TLS cert va cert pin duoc rotate co quy trinh.
- Nginx khong gzip video segment va van tra `206 Partial Content` cho Range.
