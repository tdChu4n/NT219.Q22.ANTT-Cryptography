/**
 * T2.5: rsa_oaep.js
 * Module mã hóa / giải mã Content Key bằng RSA-OAEP (SHA-256)
 *
 * - encryptKey(publicKeyPem, contentKeyHex) → base64 ciphertext
 * - decryptKey(privateKeyPem, ciphertextB64)  → contentKeyHex
 *
 * Dùng để License Server gói Content Key trước khi trả về cho Device,
 * đảm bảo chỉ thiết bị sở hữu Private Key mới giải mã được.
 */

'use strict';

const crypto = require('crypto');

/**
 * Mã hóa Content Key bằng RSA-OAEP (SHA-256)
 * @param {string} publicKeyPem  - Public Key PEM của Device (từ DB devices.public_key_pem)
 * @param {string} contentKeyHex - Content Key dạng hex (16 bytes = 32 ký tự)
 * @returns {string} ciphertext dạng base64
 */
function encryptKey(publicKeyPem, contentKeyHex) {
    const keyBuffer = Buffer.from(contentKeyHex, 'hex');
    const encrypted = crypto.publicEncrypt(
        {
            key: publicKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        keyBuffer
    );
    return encrypted.toString('base64');
}

/**
 * Giải mã Content Key bằng RSA-OAEP (dùng để viết test hoặc cho device tự giải)
 * @param {string} privateKeyPem  - Private Key PEM của Device
 * @param {string} ciphertextB64  - Ciphertext dạng base64
 * @returns {string} contentKeyHex
 */
function decryptKey(privateKeyPem, ciphertextB64) {
    const cipherBuffer = Buffer.from(ciphertextB64, 'base64');
    const decrypted = crypto.privateDecrypt(
        {
            key: privateKeyPem,
            padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
            oaepHash: 'sha256',
        },
        cipherBuffer
    );
    return decrypted.toString('hex');
}

/**
 * Sinh cặp RSA-2048 key pair dùng cho test / mô phỏng Device
 * @returns {{ publicKey: string, privateKey: string }}
 */
function generateDeviceKeyPair() {
    return crypto.generateKeyPairSync('rsa', {
        modulusLength: 2048,
        publicKeyEncoding:  { type: 'spki',  format: 'pem' },
        privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    });
}

module.exports = { encryptKey, decryptKey, generateDeviceKeyPair };
