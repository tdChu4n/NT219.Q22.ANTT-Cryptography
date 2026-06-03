/**
 * T1.5: jwt.js
 * Module JWT issue / verify cho License Server
 * Hỗ trợ 2 thuật toán:
 *   - HS256 (HMAC-SHA256):  Dùng shared secret, phù hợp cho internal service
 *   - ES256 (ECDSA P-256):  Chữ ký số đường cong elliptic, hiện đại, dùng cho
 *                           external/client-facing. Thay cho RS256 (RSA PKCS#1
 *                           v1.5) vốn là padding scheme legacy.
 *
 * Sử dụng:
 *   const { issueHS256, issueES256, verifyHS256, verifyES256 } = require('./auth/jwt');
 */

'use strict';

const jwt  = require('jsonwebtoken');
const fs   = require('fs');
const path = require('path');
const crypto = require('crypto');

// ------------------------------------------------------------------
// Cấu hình
// ------------------------------------------------------------------
const HS256_SECRET = process.env.JWT_HS256_SECRET || 'nt219_hs256_secret_change_in_prod';

// Đường dẫn ECDSA P-256 key pair (tự sinh nếu chưa có)
const KEYS_DIR        = path.join(__dirname, '../../../database/keys');
const ES256_PRIV_PATH = path.join(KEYS_DIR, 'es256_private.pem');
const ES256_PUB_PATH  = path.join(KEYS_DIR, 'es256_public.pem');

/**
 * Đảm bảo thư mục keys/ và cặp ECDSA key đã tồn tại.
 * Nếu chưa có, tự động sinh key pair ECDSA P-256 (prime256v1).
 */
function ensureECKeys() {
    if (!fs.existsSync(KEYS_DIR)) {
        fs.mkdirSync(KEYS_DIR, { recursive: true });
    }
    if (!fs.existsSync(ES256_PRIV_PATH) || !fs.existsSync(ES256_PUB_PATH)) {
        console.log('[jwt] ECDSA keys chưa tồn tại — đang sinh P-256 key pair...');
        const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
            namedCurve: 'prime256v1', // P-256
            publicKeyEncoding:  { type: 'spki',  format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        fs.writeFileSync(ES256_PRIV_PATH, privateKey,  { mode: 0o600 });
        fs.writeFileSync(ES256_PUB_PATH,  publicKey);
        console.log('[jwt] Đã sinh ECDSA P-256 key pair:');
        console.log('     Private:', ES256_PRIV_PATH);
        console.log('     Public: ', ES256_PUB_PATH);
    }
}

ensureECKeys();

let ES256_PRIVATE_KEY, ES256_PUBLIC_KEY;
try {
    ES256_PRIVATE_KEY = fs.readFileSync(ES256_PRIV_PATH, 'utf8');
    ES256_PUBLIC_KEY  = fs.readFileSync(ES256_PUB_PATH,  'utf8');
} catch (err) {
    console.error('[jwt] FATAL: Không đọc được ECDSA key files:', err.message);
    process.exit(1);
}

// ------------------------------------------------------------------
// HS256 — HMAC-SHA256 (Shared Secret)
// ------------------------------------------------------------------

/**
 * Cấp JWT HS256
 * @param {object} payload - Dữ liệu cần mã hóa (userId, role, entitlements...)
 * @param {string} [expiresIn='2h'] - Thời hạn token
 * @returns {string} JWT token
 */
function issueHS256(payload, expiresIn = '2h') {
    const jti = crypto.randomUUID(); // nonce chống Replay
    return jwt.sign(
        { ...payload, jti },
        HS256_SECRET,
        { algorithm: 'HS256', expiresIn }
    );
}

/**
 * Xác thực JWT HS256
 * @param {string} token
 * @returns {{ valid: boolean, decoded?: object, error?: string }}
 */
function verifyHS256(token) {
    try {
        const decoded = jwt.verify(token, HS256_SECRET, { algorithms: ['HS256'] });
        return { valid: true, decoded };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

// ------------------------------------------------------------------
// ES256 — ECDSA P-256 + SHA-256 (Asymmetric, đường cong elliptic)
// Thay cho RS256: không dùng padding PKCS#1 v1.5, chữ ký gọn (64 byte),
// hiệu năng cao, chuẩn hiện đại cho chữ ký số.
// ------------------------------------------------------------------

/**
 * Cấp JWT ES256 (ký bằng EC Private Key)
 * @param {object} payload
 * @param {string} [expiresIn='1h']
 * @returns {string} JWT token
 */
function issueES256(payload, expiresIn = '1h') {
    const jti = crypto.randomUUID();
    return jwt.sign(
        { ...payload, jti },
        ES256_PRIVATE_KEY,
        { algorithm: 'ES256', expiresIn }
    );
}

/**
 * Xác thực JWT ES256 (verify bằng EC Public Key)
 * @param {string} token
 * @returns {{ valid: boolean, decoded?: object, error?: string }}
 */
function verifyES256(token) {
    try {
        const decoded = jwt.verify(token, ES256_PUBLIC_KEY, { algorithms: ['ES256'] });
        return { valid: true, decoded };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

// ------------------------------------------------------------------
// Xuất Public Key (dùng để Client verify token nếu cần)
// ------------------------------------------------------------------
function getPublicKey() {
    return ES256_PUBLIC_KEY;
}

module.exports = {
    issueHS256,
    verifyHS256,
    issueES256,
    verifyES256,
    getPublicKey,
};
