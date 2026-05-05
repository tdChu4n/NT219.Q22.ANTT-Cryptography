/**
 * T1.5: jwt.js
 * Module JWT issue / verify cho License Server
 * Hỗ trợ 2 thuật toán:
 *   - HS256 (HMAC-SHA256): Dùng shared secret, phù hợp cho internal service
 *   - RS256 (RSA-SHA256):  Dùng RSA key pair, phù hợp cho external/client-facing
 *
 * Sử dụng:
 *   const { issueHS256, issueRS256, verifyHS256, verifyRS256 } = require('./auth/jwt');
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

// Đường dẫn RSA key pair (tự sinh nếu chưa có)
const KEYS_DIR        = path.join(__dirname, '../../../database/keys');
const RS256_PRIV_PATH = path.join(KEYS_DIR, 'rs256_private.pem');
const RS256_PUB_PATH  = path.join(KEYS_DIR, 'rs256_public.pem');

/**
 * Đảm bảo thư mục keys/ và cặp RSA key đã tồn tại.
 * Nếu chưa có, tự động sinh key pair RSA-2048.
 */
function ensureRSAKeys() {
    if (!fs.existsSync(KEYS_DIR)) {
        fs.mkdirSync(KEYS_DIR, { recursive: true });
    }
    if (!fs.existsSync(RS256_PRIV_PATH) || !fs.existsSync(RS256_PUB_PATH)) {
        console.log('[jwt] RSA keys chưa tồn tại — đang sinh RSA-2048 key pair...');
        const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding:  { type: 'spki',  format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
        });
        fs.writeFileSync(RS256_PRIV_PATH, privateKey,  { mode: 0o600 });
        fs.writeFileSync(RS256_PUB_PATH,  publicKey);
        console.log('[jwt] Đã sinh RSA key pair:');
        console.log('     Private:', RS256_PRIV_PATH);
        console.log('     Public: ', RS256_PUB_PATH);
    }
}

ensureRSAKeys();

const RS256_PRIVATE_KEY = fs.readFileSync(RS256_PRIV_PATH, 'utf8');
const RS256_PUBLIC_KEY  = fs.readFileSync(RS256_PUB_PATH,  'utf8');

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
// RS256 — RSA-SHA256 (Asymmetric Key Pair)
// ------------------------------------------------------------------

/**
 * Cấp JWT RS256 (ký bằng Private Key)
 * @param {object} payload
 * @param {string} [expiresIn='1h'] - Token ngắn hơn HS256 vì bảo mật cao hơn
 * @returns {string} JWT token
 */
function issueRS256(payload, expiresIn = '1h') {
    const jti = crypto.randomUUID();
    return jwt.sign(
        { ...payload, jti },
        RS256_PRIVATE_KEY,
        { algorithm: 'RS256', expiresIn }
    );
}

/**
 * Xác thực JWT RS256 (verify bằng Public Key)
 * @param {string} token
 * @returns {{ valid: boolean, decoded?: object, error?: string }}
 */
function verifyRS256(token) {
    try {
        const decoded = jwt.verify(token, RS256_PUBLIC_KEY, { algorithms: ['RS256'] });
        return { valid: true, decoded };
    } catch (err) {
        return { valid: false, error: err.message };
    }
}

// ------------------------------------------------------------------
// Xuất Public Key (dùng để Client verify token nếu cần)
// ------------------------------------------------------------------
function getPublicKey() {
    return RS256_PUBLIC_KEY;
}

module.exports = {
    issueHS256,
    verifyHS256,
    issueRS256,
    verifyRS256,
    getPublicKey,
};
