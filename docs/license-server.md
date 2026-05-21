# License Server — Tài liệu kỹ thuật

> **Task T5.4** | Phụ trách: Chuẩn | Phiên bản: 1.0.0

## Tổng quan

License Server là thành phần trung tâm của hệ thống DRM NT219. Nó cấp **Content Key được mã hóa** cho player đã xác thực, sau khi kiểm tra entitlement và áp dụng session control.

```
Player                  License Server              KMS / DB
  │                          │                         │
  │── POST /api/auth/login ──▶│                         │
  │◀─ JWT RS256 (2h) ─────────│                         │
  │                          │                         │
  │── POST /api/license ─────▶│                         │
  │   Bearer JWT             │── verify JWT ──────────▶│
  │   kid, nonce             │── check entitlement ────▶│
  │   device_public_key      │── fetch content key ────▶│
  │                          │── RSA-OAEP wrap key      │
  │◀─ encrypted_key ─────────│                         │
  │   expires_at             │                         │
```

---

## Cài đặt & chạy

```bash
cd license-server
npm install
npm start          # Port 3000, PoC mode (file JSON)

# MongoDB mode:
MONGO_URI=mongodb://localhost:27017 \
KMS_MASTER_KEY=<32-byte-hex> \
npm start
```

### Docker

```bash
cd infra
docker compose up --build
# License Server tự động kết nối MongoDB trong compose network
```

---

## Biến môi trường

| Biến | Mặc định | Mô tả |
|---|---|---|
| `PORT` | `3000` | Cổng lắng nghe |
| `MONGO_URI` | _(không set)_ | URI MongoDB. Nếu không set → PoC mode |
| `DB_NAME` | `drm_platform` | Tên database MongoDB |
| `KMS_MASTER_KEY` | _(random)_ | AES-256 Master Key (64 hex chars). **Bắt buộc trong production** |
| `JWT_HS256_SECRET` | `nt219_hs256_secret_...` | Secret cho HS256 (internal) |

> **Cảnh báo:** Không set `KMS_MASTER_KEY` → server sinh key ngẫu nhiên mỗi lần restart, làm mất toàn bộ Content Key đã encrypt.

---

## Cấu trúc source

```
license-server/
├── src/
│   ├── index.js              # Entry point, Express app, MongoDB connect
│   ├── auth/
│   │   └── jwt.js            # T1.5: JWT HS256 + RS256 issue/verify
│   ├── crypto/
│   │   └── rsa_oaep.js       # T2.5: RSA-OAEP encrypt/decrypt Content Key
│   ├── kms/
│   │   ├── kms.js            # T2.6: AES-256-GCM, Nonce store, Time-bound license
│   │   └── kms_rotate.js     # T3.5: Master Key Rotation API
│   └── routes/
│       └── license.js        # T2.4: POST /api/license endpoint
├── tests/
│   ├── jwt.test.js           # Unit tests JWT (T1.5)
│   ├── kms_rsa.test.js       # Unit tests KMS + RSA-OAEP (T2.5, T2.6)
│   ├── kms_rotate.test.js    # Unit tests Key Rotation (T3.5)
│   └── license_api.test.js   # Integration tests HTTP API (T5.3)
├── openapi.yaml              # API spec (T5.4)
└── package.json
```

---

## API Endpoints

> Xem đầy đủ tại [openapi.yaml](../license-server/openapi.yaml)  
> Swagger UI: mở `openapi.yaml` tại [editor.swagger.io](https://editor.swagger.io)

### `POST /api/auth/login`

Cấp JWT RS256 (mô phỏng đăng nhập).

```bash
curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username": "alice"}' | jq .token
```

**Response:**
```json
{
  "token": "eyJhbGciOiJSUzI1NiIsInR5cCI6IkpXVCJ9...",
  "message": "Đăng nhập thành công"
}
```

---

### `POST /api/license`

Endpoint chính — cấp DRM license.

**Header:** `Authorization: Bearer <JWT RS256>`

**Body:**

| Field | Type | Mô tả |
|---|---|---|
| `kid` | string | Key ID hex 32 chars (từ DASH manifest) |
| `device_id` | string | ID thiết bị |
| `device_public_key_pem` | string | RSA-2048 Public Key PEM của device |
| `nonce` | string (UUID) | UUID v4 mới mỗi request |
| `content_id` | string | ID video (phải có trong entitlement) |

**Ví dụ:**
```bash
TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"alice"}' | jq -r .token)

curl -s -X POST http://localhost:3000/api/license \
  -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' \
  -d '{
    "kid": "19d57c645156a5a0ddd23849e6377665",
    "device_id": "device_chrome_001",
    "device_public_key_pem": "-----BEGIN PUBLIC KEY-----\n...",
    "nonce": "550e8400-e29b-41d4-a716-446655440000",
    "content_id": "movie_123"
  }' | jq .
```

**Response 200:**
```json
{
  "kid": "19d57c645156a5a0ddd23849e6377665",
  "encrypted_key": "base64encodedRSAOAEPwrappedContentKey...",
  "issued_at": 1716000000,
  "expires_at": 1716007200,
  "license_nonce": "a1b2c3d4-e5f6-7890-abcd-ef1234567890"
}
```

**Mã lỗi:**

| Code | Tình huống |
|---|---|
| 400 | Thiếu field / RSA key không hợp lệ |
| 401 | JWT thiếu / hết hạn / sai thuật toán |
| 403 | Không có entitlement / vượt 2 thiết bị |
| 404 | KID không tìm thấy trong KMS |
| 409 | Nonce đã dùng — Replay Attack bị chặn |

---

### `GET /kms/status`

```bash
curl http://localhost:3000/kms/status
# {"status":"ok","master_key_set":true,"key_length_bits":256}
```

---

### `POST /kms/rotate` (admin only)

```bash
ADMIN_TOKEN=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"username":"admin"}' | jq -r .token)
# Lưu ý: trong production, role admin cần set riêng trong DB/IAM

curl -s -X POST http://localhost:3000/kms/rotate \
  -H "Authorization: Bearer $ADMIN_TOKEN" | jq .
```

---

## Mô hình bảo mật

### 1. JWT RS256 (T1.5)

- Private Key lưu tại `database/keys/rs256_private.pem` (mode 600)
- Token TTL: 2h, chứa `jti` (UUID) để phân biệt
- Verify bằng Public Key — chỉ server có Private Key mới ký được

### 2. Nonce Store (T2.6)

- Mỗi license request phải kèm UUID mới (nonce)
- Nonce được lưu vào in-memory Map với TTL = 1h
- Nonce dùng lại → 409 Conflict (chặn Replay Attack)
- Production: dùng Redis để chia sẻ nonce store giữa nhiều instance

### 3. RSA-OAEP (T2.5)

- Content Key (16 bytes) được encrypt bằng RSA-OAEP SHA-256
- Chỉ device có Private Key mới giải mã được
- Mỗi lần encrypt → ciphertext khác nhau (OAEP random padding)

### 4. AES-256-GCM Master Key (T2.6)

- Content Key lưu trong MongoDB dưới dạng ciphertext AES-GCM
- IV 96-bit ngẫu nhiên mỗi lần encrypt → không bao giờ reuse IV
- Auth Tag 128-bit → detect tampering

### 5. Session Control (T3.4)

- Tối đa 2 thiết bị đồng thời / user
- Device thứ 3 bị từ chối và ghi vào `licenses_audit`
- Session hết hạn theo `expires_at` của license

### 6. Time-bound License (T2.6)

- License TTL mặc định: **7200 giây (2 giờ)**
- Client phải xin license mới khi hết hạn

---

## Chạy tests

```bash
cd license-server

# Chạy tất cả tests
npm test

# Với coverage report
npx jest --coverage

# Kết quả mong đợi
# Tests:       66 passed
# Coverage:    88% statements, 94% routes/license.js
```

---

## Hiệu năng

> Chi tiết xem [benchmarks/license-latency.md](../benchmarks/license-latency.md)

| Metric | Giá trị |
|---|---|
| p50 latency | 4.8 ms |
| p95 latency | 11.3 ms |
| p99 latency | 24.7 ms |
| RPS (20 VUs) | ~29.5 req/s |
| Bottleneck | RSA-OAEP (~2.1 ms/req) |
