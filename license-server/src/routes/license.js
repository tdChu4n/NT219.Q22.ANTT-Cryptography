/**
 * T2.4: routes/license.js
 * POST /license endpoint đầy đủ:
 *   - Verify JWT (dùng module T1.5)
 *   - Check entitlement từ MongoDB (collection entitlements)
 *   - Lấy Content Key từ DB (collection content_keys_enc) và giải mã bằng KMS
 *   - Mã hóa Content Key bằng RSA-OAEP (T2.5)
 *   - Chống Replay bằng nonce store (T2.6)
 *   - Trả về Time-bound License (T2.6)
 */

'use strict';

const express  = require('express');
const router   = express.Router();
const { verifyRS256 } = require('../auth/jwt');
const { encryptKey }  = require('../crypto/rsa_oaep');
const { consumeNonce, issueLicense } = require('../kms/kms');

// Hàm tiện ích để lấy MongoDB db instance (sẽ được inject từ index.js)
let _db = null;
function setDb(db) { _db = db; }

// ---------------------------------------------------------------
// POST /license
// Body: { kid: string, device_public_key_pem: string, nonce: string, content_id: string }
// Header: Authorization: Bearer <JWT RS256>
// ---------------------------------------------------------------
router.post('/', async (req, res) => {
    // 1. Xác thực JWT (RS256 từ module T1.5)
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or malformed token' });
    }

    const token = authHeader.split(' ')[1];
    const { valid, decoded, error: jwtError } = verifyRS256(token);
    if (!valid) {
        return res.status(401).json({ error: `Unauthorized: ${jwtError}` });
    }

    // 2. Validate request body
    const { kid, device_public_key_pem, nonce, content_id } = req.body;
    if (!kid || !device_public_key_pem || !nonce || !content_id) {
        return res.status(400).json({ error: 'Bad Request: Thiếu kid, device_public_key_pem, nonce hoặc content_id' });
    }

    // 3. Chống Replay Attack — kiểm tra nonce
    const nonceResult = consumeNonce(nonce);
    if (!nonceResult.ok) {
        return res.status(409).json({ error: `Conflict: ${nonceResult.error}` });
    }

    // 4. Check Entitlement trong MongoDB
    if (_db) {
        try {
            const entitlement = await _db.collection('entitlements').findOne({
                user_id:    decoded.userId,
                content_id: content_id,
            });

            if (!entitlement) {
                return res.status(403).json({
                    error: `Forbidden: User "${decoded.userId}" chưa mua quyền xem "${content_id}"`
                });
            }

            // Kiểm tra entitlement chưa hết hạn
            if (entitlement.expires_at && new Date() > new Date(entitlement.expires_at)) {
                return res.status(403).json({
                    error: 'Forbidden: Quyền xem nội dung đã hết hạn'
                });
            }
        } catch (dbErr) {
            return res.status(500).json({ error: 'DB Error: ' + dbErr.message });
        }
    } else {
        // Fallback PoC: Check entitlement từ JWT payload (không cần DB)
        const entitlements = decoded.entitlements || [];
        if (!entitlements.includes(content_id)) {
            return res.status(403).json({
                error: `Forbidden: User chưa có quyền xem "${content_id}"`
            });
        }
    }

    // 5. Lấy Content Key từ DB hoặc file JSON (fallback)
    let contentKeyHex = null;
    let kidHex = kid.replace(/-/g, '').toLowerCase();

    if (_db) {
        try {
            const kms = require('../kms/kms');
            const keyDoc = await _db.collection('content_keys_enc').findOne({
                kid_hex: kidHex
            });
            if (!keyDoc) {
                return res.status(404).json({ error: `Not Found: Không tìm thấy key cho KID "${kid}"` });
            }
            // Giải mã Content Key từ DB bằng Master Key (AES-256-GCM)
            contentKeyHex = kms.decryptContentKey(
                keyDoc.key_enc_b64,
                keyDoc.key_enc_iv_b64,
                keyDoc.auth_tag_b64
            );
        } catch (dbErr) {
            return res.status(500).json({ error: 'KMS Error: ' + dbErr.message });
        }
    } else {
        // Fallback PoC: Đọc từ license_keys.json
        const fs   = require('fs');
        const path = require('path');
        const keysPath = path.join(__dirname, '../../../media-processing/license_keys.json');
        if (fs.existsSync(keysPath)) {
            const raw = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
            const keysArr = Array.isArray(raw) ? raw : [raw];
            const found = keysArr.find(k => k.KID.toLowerCase() === kidHex);
            if (!found) {
                return res.status(404).json({ error: `Not Found: Không có key cho KID "${kid}"` });
            }
            contentKeyHex = found.Key;
        } else {
            return res.status(503).json({ error: 'Service Unavailable: Không tìm thấy nguồn Key' });
        }
    }

    // 6. Mã hóa Content Key bằng RSA-OAEP với Public Key của Device (T2.5)
    let encryptedKeyB64;
    try {
        encryptedKeyB64 = encryptKey(device_public_key_pem, contentKeyHex);
    } catch (rsaErr) {
        return res.status(400).json({ error: 'RSA Error: Public Key Device không hợp lệ — ' + rsaErr.message });
    }

    // 7. Sinh Time-bound License và trả về (T2.6)
    const license = issueLicense(contentKeyHex, kidHex);

    console.log(`[License] ✅ Cấp license cho user=${decoded.userId}, content=${content_id}, KID=${kidHex}, exp=${license.expires_at}`);

    return res.status(200).json({
        kid:            kidHex,
        // Content Key đã được mã hóa RSA-OAEP — chỉ device sở hữu private key mới giải mã được
        encrypted_key:  encryptedKeyB64,
        issued_at:      license.issued_at,
        expires_at:     license.expires_at,
        license_nonce:  license.nonce,
    });
});

module.exports = { router, setDb };
