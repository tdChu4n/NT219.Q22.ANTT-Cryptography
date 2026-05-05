/**
 * T3.5: kms_rotate.js
 * Master Key Rotation API — POST /kms/rotate
 *
 * Luồng hoạt động:
 *  1. Sinh Master Key mới (NEW_KEY)
 *  2. Lấy toàn bộ content_keys_enc từ DB
 *  3. Giải mã từng key bằng OLD_KEY (AES-256-GCM)
 *  4. Mã hóa lại bằng NEW_KEY
 *  5. Cập nhật DB + ghi audit log vào licenses_audit
 *  6. Trả về report kết quả
 *
 * Endpoint: POST /kms/rotate
 * Header: Authorization: Bearer <JWT RS256> (role admin)
 */

'use strict';

const express = require('express');
const crypto  = require('crypto');
const router  = express.Router();
const { verifyRS256 } = require('../auth/jwt');

// Lưu Master Key hiện tại trong bộ nhớ (production: dùng HSM/Vault)
// Khởi tạo từ biến môi trường hoặc tạo ngẫu nhiên (chỉ cho dev)
let CURRENT_MASTER_KEY = process.env.KMS_MASTER_KEY
    ? Buffer.from(process.env.KMS_MASTER_KEY, 'hex')
    : crypto.randomBytes(32);

// ------------------------------------------------------------------
// Helpers AES-256-GCM (giống kms.js nhưng dùng key truyền vào)
// ------------------------------------------------------------------
function aesEncrypt(masterKey, plainHex) {
    const iv     = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
    const enc    = Buffer.concat([cipher.update(Buffer.from(plainHex, 'hex')), cipher.final()]);
    return {
        key_enc_b64:  enc.toString('base64'),
        iv_b64:       iv.toString('base64'),
        auth_tag_b64: cipher.getAuthTag().toString('base64'),
    };
}

function aesDecrypt(masterKey, key_enc_b64, iv_b64, auth_tag_b64) {
    const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        masterKey,
        Buffer.from(iv_b64, 'base64')
    );
    decipher.setAuthTag(Buffer.from(auth_tag_b64, 'base64'));
    const dec = Buffer.concat([
        decipher.update(Buffer.from(key_enc_b64, 'base64')),
        decipher.final(),
    ]);
    return dec.toString('hex');
}

// ------------------------------------------------------------------
// POST /kms/rotate — chỉ admin mới gọi được
// ------------------------------------------------------------------
router.post('/rotate', async (req, res) => {
    // 1. Xác thực JWT (RS256), kiểm tra role admin
    const authHeader = req.headers['authorization'];
    if (!authHeader?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Missing token' });
    }

    const { valid, decoded, error: jwtErr } = verifyRS256(authHeader.split(' ')[1]);
    if (!valid) return res.status(401).json({ error: `Unauthorized: ${jwtErr}` });
    if (decoded.role !== 'admin') {
        return res.status(403).json({ error: 'Forbidden: Chỉ admin mới được rotate Master Key' });
    }

    // 2. Lấy db instance (inject từ index.js)
    const db = req.app.locals.db;

    // 3. Sinh Master Key mới
    const NEW_MASTER_KEY    = crypto.randomBytes(32);
    const newMasterKeyHex   = NEW_MASTER_KEY.toString('hex');
    const rotationId        = crypto.randomUUID();
    const rotatedAt         = new Date();

    const report = {
        rotation_id:    rotationId,
        rotated_at:     rotatedAt.toISOString(),
        keys_processed: 0,
        keys_failed:    0,
        errors:         [],
    };

    if (db) {
        // 4. Lấy toàn bộ content keys từ DB và re-encrypt
        const keys = await db.collection('content_keys_enc').find({}).toArray();
        report.keys_processed = keys.length;

        for (const keyDoc of keys) {
            try {
                // Giải mã bằng Old Master Key
                const plainHex = aesDecrypt(
                    CURRENT_MASTER_KEY,
                    keyDoc.key_enc_b64,
                    keyDoc.key_enc_iv_b64,
                    keyDoc.auth_tag_b64
                );

                // Mã hóa lại bằng New Master Key
                const reEncrypted = aesEncrypt(NEW_MASTER_KEY, plainHex);

                // Cập nhật DB
                await db.collection('content_keys_enc').updateOne(
                    { _id: keyDoc._id },
                    {
                        $set: {
                            key_enc_b64:    reEncrypted.key_enc_b64,
                            key_enc_iv_b64: reEncrypted.iv_b64,
                            auth_tag_b64:   reEncrypted.auth_tag_b64,
                            key_version:    (keyDoc.key_version || 1) + 1,
                        }
                    }
                );
            } catch (err) {
                report.keys_failed++;
                report.errors.push({ kid_hex: keyDoc.kid_hex, error: err.message });
            }
        }

        // 5. Ghi audit log vào collection licenses_audit
        await db.collection('licenses_audit').insertOne({
            event:           'MASTER_KEY_ROTATION',
            rotation_id:     rotationId,
            performed_by:    decoded.userId,
            keys_processed:  report.keys_processed,
            keys_failed:     report.keys_failed,
            created_at:      rotatedAt,
        });
    } else {
        // PoC mode: chỉ thực hiện re-encrypt in-memory test
        const testKeyHex = crypto.randomBytes(16).toString('hex');
        const enc        = aesEncrypt(CURRENT_MASTER_KEY, testKeyHex);
        const reEnc      = aesEncrypt(NEW_MASTER_KEY,     testKeyHex);
        const verify     = aesDecrypt(NEW_MASTER_KEY, reEnc.key_enc_b64, reEnc.iv_b64, reEnc.auth_tag_b64);

        report.poc_mode   = true;
        report.test_passed = (verify === testKeyHex);
        report.keys_processed = 1;
    }

    // 6. Kích hoạt Master Key mới
    CURRENT_MASTER_KEY = NEW_MASTER_KEY;

    console.log(`[KMS] ✅ Master Key Rotation #${rotationId} — ${report.keys_processed} keys re-encrypted`);

    return res.status(200).json({
        message: 'Master Key Rotation hoàn thành',
        new_master_key_hex: newMasterKeyHex, // In production: KHÔNG trả về — lưu vào HSM
        ...report,
    });
});

// GET /kms/status — kiểm tra KMS còn sống
router.get('/status', (req, res) => {
    res.json({
        status:          'ok',
        master_key_set:  !!CURRENT_MASTER_KEY,
        key_length_bits: CURRENT_MASTER_KEY.length * 8,
    });
});

module.exports = router;
