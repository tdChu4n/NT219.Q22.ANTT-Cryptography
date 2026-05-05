/**
 * Tests T2.4, T2.5, T2.6
 */

'use strict';

const { encryptKey, decryptKey, generateDeviceKeyPair } = require('../src/crypto/rsa_oaep');
const {
    encryptContentKey, decryptContentKey,
    consumeNonce, hasNonce,
    issueLicense, validateLicense,
    _usedNonces,
} = require('../src/kms/kms');

// ================================================================
// T2.5 — RSA-OAEP
// ================================================================
describe('T2.5 — RSA-OAEP: Mã hóa Content Key', () => {
    let pub, priv;

    beforeAll(() => {
        const pair = generateDeviceKeyPair();
        pub  = pair.publicKey;
        priv = pair.privateKey;
    });

    test('Sinh device key pair thành công', () => {
        expect(pub).toContain('BEGIN PUBLIC KEY');
        expect(priv).toContain('BEGIN PRIVATE KEY');
    });

    test('Mã hóa Content Key bằng RSA-OAEP', () => {
        const contentKey = 'aabbccddeeff00112233445566778899';
        const cipherB64  = encryptKey(pub, contentKey);
        expect(typeof cipherB64).toBe('string');
        expect(cipherB64.length).toBeGreaterThan(0);
    });

    test('Giải mã và khôi phục Content Key chính xác', () => {
        const contentKey = 'aabbccddeeff00112233445566778899';
        const cipherB64  = encryptKey(pub, contentKey);
        const recovered  = decryptKey(priv, cipherB64);
        expect(recovered).toBe(contentKey);
    });

    test('Ciphertext khác nhau mỗi lần (do OAEP padding ngẫu nhiên)', () => {
        const contentKey = 'aabbccddeeff00112233445566778899';
        const c1 = encryptKey(pub, contentKey);
        const c2 = encryptKey(pub, contentKey);
        expect(c1).not.toBe(c2);
    });

    test('Giải mã bằng sai Private Key → throw error', () => {
        const { privateKey: wrongPriv } = generateDeviceKeyPair();
        const contentKey = 'aabbccddeeff00112233445566778899';
        const cipherB64  = encryptKey(pub, contentKey);
        expect(() => decryptKey(wrongPriv, cipherB64)).toThrow();
    });
});

// ================================================================
// T2.6 — KMS: AES-256-GCM + Nonce + Time-bound License
// ================================================================
describe('T2.6 — KMS: AES-256-GCM Content Key encryption', () => {
    const contentKey = '29301c10fb2d59b66067020730c0f1b1';

    test('Mã hóa Content Key bằng AES-256-GCM', () => {
        const result = encryptContentKey(contentKey);
        expect(result.key_enc_b64).toBeDefined();
        expect(result.iv_b64).toBeDefined();
        expect(result.auth_tag_b64).toBeDefined();
    });

    test('Giải mã và khôi phục Content Key chính xác', () => {
        const { key_enc_b64, iv_b64, auth_tag_b64 } = encryptContentKey(contentKey);
        const recovered = decryptContentKey(key_enc_b64, iv_b64, auth_tag_b64);
        expect(recovered).toBe(contentKey);
    });

    test('Giả mạo auth tag → throw (GCM authentication fail)', () => {
        const { key_enc_b64, iv_b64 } = encryptContentKey(contentKey);
        const fakeTag = Buffer.alloc(16, 0xff).toString('base64');
        expect(() => decryptContentKey(key_enc_b64, iv_b64, fakeTag)).toThrow();
    });

    test('Mỗi lần mã hóa tạo IV khác nhau (không tái dùng IV)', () => {
        const r1 = encryptContentKey(contentKey);
        const r2 = encryptContentKey(contentKey);
        expect(r1.iv_b64).not.toBe(r2.iv_b64);
    });
});

describe('T2.6 — KMS: Nonce Store (chống Replay Attack)', () => {
    afterEach(() => _usedNonces.clear());

    test('Nonce mới → OK', () => {
        const result = consumeNonce('nonce_abc_001');
        expect(result.ok).toBe(true);
    });

    test('Cùng nonce dùng lần 2 → bị từ chối (Replay)', () => {
        consumeNonce('nonce_abc_002');
        const result2 = consumeNonce('nonce_abc_002');
        expect(result2.ok).toBe(false);
        expect(result2.error).toMatch(/replay/i);
    });

    test('hasNonce trả về true sau khi nonce đã dùng', () => {
        consumeNonce('nonce_check_001');
        expect(hasNonce('nonce_check_001')).toBe(true);
    });

    test('Nhiều nonce khác nhau đều được chấp nhận', () => {
        for (let i = 0; i < 10; i++) {
            const r = consumeNonce(`nonce_many_${i}`);
            expect(r.ok).toBe(true);
        }
    });
});

describe('T2.6 — KMS: Time-bound License', () => {
    const contentKey = '29301c10fb2d59b66067020730c0f1b1';
    const kidHex     = '19d57c645156a5a0ddd23849e6377665';

    test('Sinh license với đầy đủ field', () => {
        const lic = issueLicense(contentKey, kidHex, 7200);
        expect(lic.kid_hex).toBe(kidHex);
        expect(lic.key_hex).toBe(contentKey);
        expect(lic.issued_at).toBeDefined();
        expect(lic.expires_at).toBeGreaterThan(lic.issued_at);
        expect(lic.nonce).toBeDefined();
    });

    test('License còn hiệu lực → valid = true', () => {
        const lic = issueLicense(contentKey, kidHex, 3600);
        const { valid } = validateLicense(lic);
        expect(valid).toBe(true);
    });

    test('License đã hết hạn → valid = false', () => {
        const lic = issueLicense(contentKey, kidHex, -1); // hết hạn ngay lập tức
        const { valid, error } = validateLicense(lic);
        expect(valid).toBe(false);
        expect(error).toMatch(/hết hạn/);
    });

    test('License không có expires_at → invalid', () => {
        const { valid } = validateLicense({});
        expect(valid).toBe(false);
    });

    test('Mỗi license có nonce duy nhất', () => {
        const l1 = issueLicense(contentKey, kidHex);
        const l2 = issueLicense(contentKey, kidHex);
        expect(l1.nonce).not.toBe(l2.nonce);
    });
});
