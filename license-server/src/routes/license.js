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

// ---------------------------------------------------------------
// In-memory anomaly detection: phát hiện 1 user gửi từ nhiều IP
// ---------------------------------------------------------------
const _userIpMap = new Map(); // userId → { ips: Set, windowStart }

function checkAnomaly(userId, clientIp) {
    const now    = Date.now();
    const window = 15 * 60 * 1000; // 15 phút

    if (!_userIpMap.has(userId)) {
        _userIpMap.set(userId, { ips: new Set([clientIp]), windowStart: now });
        return null;
    }
    const rec = _userIpMap.get(userId);
    if (now - rec.windowStart > window) {
        rec.ips = new Set([clientIp]);
        rec.windowStart = now;
        return null;
    }
    rec.ips.add(clientIp);
    if (rec.ips.size > 3)
        return `Anomaly: user "${userId}" gửi license request từ ${rec.ips.size} IP trong 15 phút`;
    return null;
}

// ---------------------------------------------------------------
let _db = null;
function setDb(db) { _db = db; }

function getClientIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown')
        .split(',')[0].trim();
}

// ---------------------------------------------------------------
// POST /license
// ---------------------------------------------------------------
router.post('/', async (req, res) => {
    // 1. Xác thực JWT
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing or malformed token' });
    }

    const token = authHeader.split(' ')[1];
    const { valid, decoded, error: jwtError } = verifyRS256(token);
    if (!valid) {
        return res.status(401).json({ error: `Unauthorized: ${jwtError}` });
    }

    // 2. Anomaly detection — ghi log nếu phát hiện bất thường
    const clientIp = getClientIp(req);
    const anomaly  = checkAnomaly(decoded.userId, clientIp);
    if (anomaly) {
        console.warn(`[Security] ⚠️  ${anomaly} — IP hiện tại: ${clientIp}`);
        // Ghi audit nếu có DB (không reject, chỉ cảnh báo)
        if (_db) {
            _db.collection('licenses_audit').insertOne({
                event:     'ANOMALY_MULTI_IP',
                user_id:   decoded.userId,
                client_ip: clientIp,
                detail:    anomaly,
                created_at: new Date(),
            }).catch(() => {});
        }
    }

    // 3. Validate request body (strict)
    const { kid, device_id, device_public_key_pem, nonce, content_id } = req.body;
    if (!kid || !device_id || !device_public_key_pem || !nonce || !content_id) {
        return res.status(400).json({ error: 'Bad Request: Thiếu trường bắt buộc' });
    }
    if (typeof kid !== 'string' || kid.replace(/-/g, '').length !== 32) {
        return res.status(400).json({ error: 'Bad Request: kid không hợp lệ' });
    }
    if (typeof nonce !== 'string' || nonce.length < 8 || nonce.length > 256) {
        return res.status(400).json({ error: 'Bad Request: nonce không hợp lệ' });
    }
    if (!device_public_key_pem.includes('BEGIN PUBLIC KEY')) {
        return res.status(400).json({ error: 'Bad Request: device_public_key_pem phải là PEM' });
    }

    // 4. Chống Replay Attack — kiểm tra nonce
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

            // T3.4: Kiểm tra Session Control (Max 2 devices đồng thời, bỏ qua session đã revoke)
            const activeSessions = await _db.collection('sessions').find({
                user_id:    decoded.userId,
                expires_at: { $gt: new Date() },
                is_revoked: { $ne: true },
            }).toArray();

            const uniqueDevices = new Set(activeSessions.map(s => s.device_id));
            if (!uniqueDevices.has(device_id) && uniqueDevices.size >= 2) {
                // Đã đạt giới hạn 2 thiết bị khác nhau -> Từ chối và ghi Audit
                await _db.collection('licenses_audit').insertOne({
                    event: 'LICENSE_DENIED_MAX_DEVICES',
                    user_id: decoded.userId,
                    device_id: device_id,
                    content_id: content_id,
                    reason: 'Vượt quá giới hạn 2 thiết bị xem đồng thời',
                    created_at: new Date()
                });
                return res.status(403).json({ 
                    error: 'Forbidden: Đã đạt giới hạn 2 thiết bị xem đồng thời. Vui lòng đăng xuất ở thiết bị khác.' 
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
    
    // T3.4: Lưu Session và Audit Log nếu có DB
    if (_db) {
        const session_id = require('crypto').randomUUID();
        const issued_at_date = new Date(license.issued_at * 1000);
        const expires_at_date = new Date(license.expires_at * 1000);

        await _db.collection('sessions').insertOne({
            session_id: session_id,
            user_id: decoded.userId,
            device_id: device_id,
            content_id: content_id,
            issued_at: issued_at_date,
            expires_at: expires_at_date,
            nonce: license.nonce,
            is_revoked: false
        });

        await _db.collection('licenses_audit').insertOne({
            event: 'LICENSE_GRANTED',
            session_id: session_id,
            user_id: decoded.userId,
            device_id: device_id,
            content_id: content_id,
            kid_hex: kidHex,
            created_at: new Date()
        });
    }

    console.log(`[License] ✅ Cấp license cho user=${decoded.userId}, device=${device_id}, content=${content_id}, exp=${license.expires_at}`);

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
