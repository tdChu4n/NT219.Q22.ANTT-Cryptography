/**
 * T2.6: kms.js — Key Management Service module
 *
 * Chức năng:
 *  1. Mã hóa Content Key bằng AES-256-GCM (Master Key) trước khi lưu DB
 *  2. Giải mã Content Key từ DB khi cần cấp License
 *  3. Nonce Store — chặn Token Replay Attack (mỗi nonce chỉ dùng 1 lần)
 *  4. Time-bound License — kiểm tra exp và sinh license có thời hạn
 */

'use strict';

const crypto = require('crypto');

// ------------------------------------------------------------------
// Cấu hình Master Key (AES-256-GCM)
// Trong production: lấy từ HSM hoặc biến môi trường được bảo vệ
// ------------------------------------------------------------------
const MASTER_KEY_HEX = process.env.KMS_MASTER_KEY || crypto.randomBytes(32).toString('hex');
const MASTER_KEY     = Buffer.from(MASTER_KEY_HEX, 'hex');

if (!process.env.KMS_MASTER_KEY) {
    console.warn('[KMS] WARNING: KMS_MASTER_KEY không được set — đang dùng key ngẫu nhiên (chỉ cho dev/test).');
}

// ------------------------------------------------------------------
// 1. AES-256-GCM: Mã hóa Content Key để lưu vào DB
// ------------------------------------------------------------------

/**
 * Mã hóa Content Key bằng AES-256-GCM với Master Key
 * @param {string} contentKeyHex - Content Key dạng hex (32 chars = 16 bytes)
 * @returns {{ key_enc_b64: string, iv_b64: string, auth_tag_b64: string }}
 */
function encryptContentKey(contentKeyHex) {
    const iv = crypto.randomBytes(12); // 96-bit IV chuẩn cho GCM
    const cipher = crypto.createCipheriv('aes-256-gcm', MASTER_KEY, iv);

    const keyBuffer = Buffer.from(contentKeyHex, 'hex');
    const encrypted = Buffer.concat([cipher.update(keyBuffer), cipher.final()]);
    const authTag    = cipher.getAuthTag(); // 128-bit authentication tag

    return {
        key_enc_b64:  encrypted.toString('base64'),
        iv_b64:       iv.toString('base64'),
        auth_tag_b64: authTag.toString('base64'),
    };
}

/**
 * Giải mã Content Key từ DB
 * @param {string} key_enc_b64  - Encrypted key (base64)
 * @param {string} iv_b64       - IV (base64)
 * @param {string} auth_tag_b64 - Auth tag (base64)
 * @returns {string} contentKeyHex
 */
function decryptContentKey(key_enc_b64, iv_b64, auth_tag_b64) {
    const iv       = Buffer.from(iv_b64,       'base64');
    const authTag  = Buffer.from(auth_tag_b64, 'base64');
    const encrypted = Buffer.from(key_enc_b64, 'base64');

    const decipher = crypto.createDecipheriv('aes-256-gcm', MASTER_KEY, iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('hex');
}

// ------------------------------------------------------------------
// 2. Nonce Store — chặn Token Replay Attack
// (In-memory cho PoC; production dùng Redis với TTL)
// ------------------------------------------------------------------
const usedNonces = new Map(); // Map<nonce, expireTimestamp>

/**
 * Kiểm tra và đánh dấu nonce đã dùng
 * @param {string} nonce
 * @param {number} ttlMs - Thời gian nonce có hiệu lực (milliseconds)
 * @returns {{ ok: boolean, error?: string }}
 */
function consumeNonce(nonce, ttlMs = 60 * 60 * 1000) {
    const now = Date.now();

    // Dọn nonces hết hạn (tránh memory leak)
    for (const [n, exp] of usedNonces.entries()) {
        if (exp < now) usedNonces.delete(n);
    }

    if (usedNonces.has(nonce)) {
        return { ok: false, error: 'Replay attack: Nonce đã được sử dụng trước đó!' };
    }

    usedNonces.set(nonce, now + ttlMs);
    return { ok: true };
}

/**
 * Kiểm tra nonce có hợp lệ không (không xóa, chỉ kiểm tra)
 */
function hasNonce(nonce) {
    return usedNonces.has(nonce);
}

// ------------------------------------------------------------------
// 3. Time-bound License — sinh và kiểm tra thời hạn License
// ------------------------------------------------------------------

/**
 * Sinh License object với thời hạn cụ thể
 * @param {string} contentKeyHex - Content Key dạng hex
 * @param {string} kidHex
 * @param {number} ttlSeconds - Thời hạn License (giây), mặc định 2 giờ
 * @returns {object} license object
 */
function issueLicense(contentKeyHex, kidHex, ttlSeconds = 7200) {
    const now = Math.floor(Date.now() / 1000);
    return {
        kid_hex:     kidHex,
        key_hex:     contentKeyHex, // Trước khi gửi ra ngoài, sẽ được mã hóa bằng RSA-OAEP
        issued_at:   now,
        expires_at:  now + ttlSeconds,
        nonce:       crypto.randomUUID(),
    };
}

/**
 * Kiểm tra License có còn hiệu lực không
 * @param {object} license
 * @returns {{ valid: boolean, error?: string }}
 */
function validateLicense(license) {
    const now = Math.floor(Date.now() / 1000);
    if (!license || !license.expires_at) {
        return { valid: false, error: 'License không hợp lệ' };
    }
    if (now > license.expires_at) {
        return { valid: false, error: `License đã hết hạn lúc ${new Date(license.expires_at * 1000).toISOString()}` };
    }
    return { valid: true };
}

module.exports = {
    encryptContentKey,
    decryptContentKey,
    consumeNonce,
    hasNonce,
    issueLicense,
    validateLicense,
    // Export cho test
    _usedNonces: usedNonces,
};
