# Database Schema — NT219 Multimedia DRM Platform

MongoDB database: `drm_platform`

---

## 1. Collection: `kids` (Key IDs)

Lưu danh sách các Key ID (KID) gắn với từng nội dung video. Mỗi KID đại diện cho một Period trong Key Rotation.

```json
{
  "_id":         "ObjectId",
  "kid_hex":     "string",       // 32-char hex, ví dụ: "19d57c6451..."
  "content_id":  "string",       // ID bộ phim/nội dung, ví dụ: "movie_123"
  "period":      "number",       // Số thứ tự Period (1, 2, 3, 4...)
  "algorithm":   "string",       // "AES-128-CTR" (CENC)
  "iv_hex":      "string",       // 32-char hex IV, unique mỗi segment/period
  "created_at":  "Date"
}
```

Index: `kid_hex` (unique), `content_id`

---

## 2. Collection: `content_keys_enc` (Encrypted Content Keys)

Lưu Content Key (CK) đã được **mã hóa bằng Master Key** (hoặc HSM). Key bản rõ **không bao giờ** được lưu trực tiếp vào database.

```json
{
  "_id":              "ObjectId",
  "kid_hex":          "string",    // FK → kids.kid_hex
  "content_id":       "string",
  "key_enc_b64":      "string",    // Content Key đã mã hóa bằng AES-256-GCM (Master Key)
  "key_enc_iv_b64":   "string",    // IV dùng để mã hóa key_enc_b64
  "key_version":      "number",    // Hỗ trợ rollover Key
  "created_at":       "Date",
  "expires_at":       "Date"       // Thời hạn sử dụng Key (Short-lived)
}
```

Index: `kid_hex` (unique), `expires_at` (TTL index)

---

## 3. Collection: `users`

Thông tin người dùng trả phí.

```json
{
  "_id":           "ObjectId",
  "user_id":       "string",       // UUID v4
  "email":         "string",
  "password_hash": "string",       // bcrypt hash
  "role":          "string",       // "free" | "premium"
  "created_at":    "Date",
  "updated_at":    "Date"
}
```

Index: `email` (unique), `user_id` (unique)

---

## 4. Collection: `entitlements` (Quyền truy cập nội dung)

Ghi nhận user được phép xem nội dung nào, hết hạn khi nào.

```json
{
  "_id":          "ObjectId",
  "user_id":      "string",        // FK → users.user_id
  "content_id":   "string",        // ID bộ phim/nội dung
  "granted_at":   "Date",
  "expires_at":   "Date",          // null = vĩnh viễn
  "source":       "string"         // "purchase" | "subscription" | "trial"
}
```

Index: `{ user_id, content_id }` (compound unique)

---

## 5. Collection: `devices`

Lưu thông tin thiết bị đã đăng ký (Device Attestation / Device Binding).

```json
{
  "_id":              "ObjectId",
  "device_id":        "string",    // UUID sinh phía client
  "user_id":          "string",    // FK → users.user_id
  "device_type":      "string",    // "web" | "android" | "ios" | "smarttv"
  "widevine_level":   "string",    // "L1" | "L3" (null nếu là web)
  "public_key_pem":   "string",    // RSA Public Key để Device Binding (RSA-OAEP)
  "registered_at":    "Date",
  "last_seen_at":     "Date",
  "is_trusted":       "boolean"
}
```

Index: `device_id` (unique), `user_id`

---

## 6. Collection: `sessions` (License Sessions)

Mỗi lần cấp License thì tạo một Session, dùng để chặn Token Replay.

```json
{
  "_id":           "ObjectId",
  "session_id":    "string",       // UUID v4, dùng làm JWT jti (JWT ID)
  "user_id":       "string",
  "device_id":     "string",
  "content_id":    "string",
  "issued_at":     "Date",
  "expires_at":    "Date",
  "nonce":         "string",       // One-time nonce, chặn Replay Attack
  "is_revoked":    "boolean"       // true = Session đã bị thu hồi
}
```

Index: `session_id` (unique), `nonce` (unique), TTL index trên `expires_at`

---

## Tóm tắt quan hệ

```
users ──┬──< entitlements >── content_id
        └──< devices
             └──< sessions
kids >── content_keys_enc (via kid_hex)
kids.content_id ── entitlements.content_id
```
