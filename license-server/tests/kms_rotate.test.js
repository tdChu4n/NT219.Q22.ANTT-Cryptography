/**
 * Tests T3.5 — Master Key Rotation
 */

'use strict';

const crypto = require('crypto');

// Tách helper ra để test độc lập không cần server
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

// ================================================================
// T3.5 — Master Key Rotation Logic Tests
// ================================================================
describe('T3.5 — Master Key Rotation', () => {
    const CONTENT_KEY  = '29301c10fb2d59b66067020730c0f1b1'; // 16 bytes
    let OLD_KEY, NEW_KEY;

    beforeEach(() => {
        OLD_KEY = crypto.randomBytes(32);
        NEW_KEY = crypto.randomBytes(32);
    });

    test('Mã hóa Content Key bằng Old Master Key', () => {
        const enc = aesEncrypt(OLD_KEY, CONTENT_KEY);
        expect(enc.key_enc_b64).toBeDefined();
        expect(enc.iv_b64).toBeDefined();
        expect(enc.auth_tag_b64).toBeDefined();
    });

    test('Giải mã bằng Old Master Key → Content Key gốc', () => {
        const enc = aesEncrypt(OLD_KEY, CONTENT_KEY);
        const dec = aesDecrypt(OLD_KEY, enc.key_enc_b64, enc.iv_b64, enc.auth_tag_b64);
        expect(dec).toBe(CONTENT_KEY);
    });

    test('Rotation: giải mã Old → mã hóa lại New → giải mã New ra đúng key', () => {
        // Bước 1: Mã hóa bằng OLD_KEY (như đang lưu trong DB)
        const oldEnc = aesEncrypt(OLD_KEY, CONTENT_KEY);

        // Bước 2: Rotation — giải mã bằng OLD, mã hóa lại bằng NEW
        const decrypted = aesDecrypt(OLD_KEY, oldEnc.key_enc_b64, oldEnc.iv_b64, oldEnc.auth_tag_b64);
        const newEnc    = aesEncrypt(NEW_KEY, decrypted);

        // Bước 3: Verify — dùng NEW_KEY giải mã → phải ra CONTENT_KEY
        const recovered = aesDecrypt(NEW_KEY, newEnc.key_enc_b64, newEnc.iv_b64, newEnc.auth_tag_b64);
        expect(recovered).toBe(CONTENT_KEY);
    });

    test('Sau rotation, Old Master Key không còn giải mã được', () => {
        const oldEnc = aesEncrypt(OLD_KEY, CONTENT_KEY);
        const newEnc = aesEncrypt(NEW_KEY,
            aesDecrypt(OLD_KEY, oldEnc.key_enc_b64, oldEnc.iv_b64, oldEnc.auth_tag_b64)
        );
        // Dùng OLD_KEY để giải mã dữ liệu đã encrypt bằng NEW_KEY → phải fail
        expect(() => aesDecrypt(OLD_KEY, newEnc.key_enc_b64, newEnc.iv_b64, newEnc.auth_tag_b64)).toThrow();
    });

    test('Rotation nhiều Content Keys độc lập, mỗi key có IV khác nhau', () => {
        const keys = [
            'aabbccddeeff00112233445566778899',
            '00112233445566778899aabbccddeeff',
            'ffeeddccbbaa99887766554433221100',
        ];

        const encrypted = keys.map(k => ({ key: k, enc: aesEncrypt(OLD_KEY, k) }));
        const reEncrypted = encrypted.map(({ key, enc }) => ({
            key,
            newEnc: aesEncrypt(NEW_KEY, aesDecrypt(OLD_KEY, enc.key_enc_b64, enc.iv_b64, enc.auth_tag_b64)),
        }));

        // Kiểm tra tất cả keys được recover đúng
        reEncrypted.forEach(({ key, newEnc }) => {
            const recovered = aesDecrypt(NEW_KEY, newEnc.key_enc_b64, newEnc.iv_b64, newEnc.auth_tag_b64);
            expect(recovered).toBe(key);
        });

        // Kiểm tra IV của mỗi key trong new encryption là khác nhau (tránh IV reuse)
        const ivs = reEncrypted.map(({ newEnc }) => newEnc.iv_b64);
        const uniqueIvs = new Set(ivs);
        expect(uniqueIvs.size).toBe(keys.length);
    });

    test('Giả mạo auth tag sau rotation → bị từ chối', () => {
        const oldEnc    = aesEncrypt(OLD_KEY, CONTENT_KEY);
        const decrypted = aesDecrypt(OLD_KEY, oldEnc.key_enc_b64, oldEnc.iv_b64, oldEnc.auth_tag_b64);
        const newEnc    = aesEncrypt(NEW_KEY, decrypted);
        const fakeTag   = Buffer.alloc(16, 0xff).toString('base64');

        expect(() => aesDecrypt(NEW_KEY, newEnc.key_enc_b64, newEnc.iv_b64, fakeTag)).toThrow();
    });
});
