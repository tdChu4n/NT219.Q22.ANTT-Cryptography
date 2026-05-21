/**
 * T5.3 — Integration Test: License Server API
 * Dùng supertest để gọi HTTP thật, không mock Express routes.
 *
 * Coverage mục tiêu: >= 70% cho auth/, kms/, routes/license.js
 *
 * Chạy:
 *   cd license-server && npm install && npx jest --verbose --coverage
 */

'use strict';

const request = require('supertest');
const crypto  = require('crypto');
const express = require('express');
const cors    = require('cors');

// ---------------------------------------------------------------
// Khởi tạo app test (không bind port thật)
// ---------------------------------------------------------------
const { issueRS256, issueHS256 } = require('../src/auth/jwt');
const { encryptKey, generateDeviceKeyPair } = require('../src/crypto/rsa_oaep');
const { router: licenseRouter, setDb }      = require('../src/routes/license');
const kmsRotateRouter                       = require('../src/kms/kms_rotate');

function buildApp(db = null) {
    const app = express();
    app.use(cors());
    app.use(express.json());

    setDb(db);

    app.post('/api/auth/login', (req, res) => {
        const { username } = req.body;
        if (!username) return res.status(400).json({ error: 'Missing username' });
        const token = issueRS256({
            userId: username,
            role: 'premium',
            entitlements: ['movie_123'],
        }, '2h');
        res.json({ token });
    });

    app.use('/api/license', licenseRouter);
    app.use('/kms', kmsRotateRouter);
    app.get('/', (req, res) => res.json({ status: 'ok' }));

    return app;
}

// ---------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------
let deviceKeys;
beforeAll(() => {
    deviceKeys = generateDeviceKeyPair();
});

function makeNonce() {
    return crypto.randomUUID();
}

async function loginAndGetToken(app, username = 'test_user') {
    const res = await request(app)
        .post('/api/auth/login')
        .send({ username })
        .set('Content-Type', 'application/json');
    return res.body.token;
}

function makeLicenseBody(overrides = {}) {
    return {
        kid:                   '19d57c645156a5a0ddd23849e6377665',
        device_id:             'device_test_001',
        device_public_key_pem: deviceKeys.publicKey,
        nonce:                 makeNonce(),
        content_id:            'movie_123',
        ...overrides,
    };
}

// ---------------------------------------------------------------
// TEST GROUP 1: Health Check
// ---------------------------------------------------------------
describe('GET / — Health Check', () => {
    const app = buildApp();

    test('Trả về status ok', async () => {
        const res = await request(app).get('/');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
    });
});

// ---------------------------------------------------------------
// TEST GROUP 2: POST /api/auth/login
// ---------------------------------------------------------------
describe('POST /api/auth/login', () => {
    const app = buildApp();

    test('Cấp RS256 JWT khi có username', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({ username: 'alice' });
        expect(res.status).toBe(200);
        expect(res.body.token).toBeDefined();
        expect(res.body.token.split('.').length).toBe(3);
    });

    test('Trả 400 nếu thiếu username', async () => {
        const res = await request(app)
            .post('/api/auth/login')
            .send({});
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/missing username/i);
    });
});

// ---------------------------------------------------------------
// TEST GROUP 3: POST /api/license — Happy Path (PoC mode)
// ---------------------------------------------------------------
describe('POST /api/license — Happy Path', () => {
    let app;
    let token;

    beforeAll(async () => {
        app   = buildApp(null); // PoC mode: file JSON
        token = await loginAndGetToken(app);
    });

    test('Cấp license thành công → 200 + encrypted_key + expires_at', async () => {
        const res = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody());

        expect(res.status).toBe(200);
        expect(res.body.encrypted_key).toBeDefined();
        expect(res.body.kid).toBeDefined();
        expect(res.body.expires_at).toBeGreaterThan(Math.floor(Date.now() / 1000));
        expect(res.body.issued_at).toBeDefined();
        expect(res.body.license_nonce).toBeDefined();
    });

    test('encrypted_key có thể giải mã bằng device private key', async () => {
        const body = makeLicenseBody();
        const res  = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(body);

        expect(res.status).toBe(200);
        const { decryptKey } = require('../src/crypto/rsa_oaep');
        const recovered = decryptKey(deviceKeys.privateKey, res.body.encrypted_key);
        expect(recovered).toMatch(/^[0-9a-f]{32}$/); // AES-128 = 32 hex chars
    });

    test('expires_at = issued_at + 7200s (2 giờ TTL)', async () => {
        const res = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody());

        expect(res.status).toBe(200);
        const diff = res.body.expires_at - res.body.issued_at;
        expect(diff).toBe(7200);
    });
});

// ---------------------------------------------------------------
// TEST GROUP 4: POST /api/license — Auth failures
// ---------------------------------------------------------------
describe('POST /api/license — Auth failures', () => {
    const app = buildApp();

    test('Thiếu Authorization header → 401', async () => {
        const res = await request(app)
            .post('/api/license')
            .send(makeLicenseBody());
        expect(res.status).toBe(401);
        expect(res.body.error).toMatch(/unauthorized/i);
    });

    test('Token HS256 (sai thuật toán) → 401', async () => {
        const wrongToken = issueHS256({ userId: 'attacker', entitlements: ['movie_123'] });
        const res = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${wrongToken}`)
            .send(makeLicenseBody());
        expect(res.status).toBe(401);
    });

    test('Token RS256 bị tamper → 401', async () => {
        const token   = issueRS256({ userId: 'bob', entitlements: ['movie_123'] });
        const tampered = token.slice(0, -4) + 'XXXX';
        const res = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${tampered}`)
            .send(makeLicenseBody());
        expect(res.status).toBe(401);
    });

    test('Token RS256 hết hạn → 401', async () => {
        const expiredToken = issueRS256({ userId: 'bob', entitlements: ['movie_123'] }, '1ms');
        await new Promise(r => setTimeout(r, 20));
        const res = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${expiredToken}`)
            .send(makeLicenseBody());
        expect(res.status).toBe(401);
    });
});

// ---------------------------------------------------------------
// TEST GROUP 5: POST /api/license — Body validation
// ---------------------------------------------------------------
describe('POST /api/license — Body validation', () => {
    let app, token;

    beforeAll(async () => {
        app   = buildApp(null);
        token = await loginAndGetToken(app);
    });

    const requiredFields = ['kid', 'device_id', 'device_public_key_pem', 'nonce', 'content_id'];

    requiredFields.forEach(field => {
        test(`Thiếu field "${field}" → 400`, async () => {
            const body = makeLicenseBody();
            delete body[field];
            const res = await request(app)
                .post('/api/license')
                .set('Authorization', `Bearer ${token}`)
                .send(body);
            expect(res.status).toBe(400);
            expect(res.body.error).toMatch(/bad request/i);
        });
    });

    test('device_public_key_pem không hợp lệ → 400', async () => {
        const res = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody({ device_public_key_pem: 'not-a-valid-pem' }));
        expect(res.status).toBe(400);
        expect(res.body.error).toMatch(/rsa error/i);
    });
});

// ---------------------------------------------------------------
// TEST GROUP 6: POST /api/license — Entitlement check (PoC mode)
// ---------------------------------------------------------------
describe('POST /api/license — Entitlement (PoC mode)', () => {
    let app;

    beforeAll(() => {
        app = buildApp(null);
    });

    test('User không có entitlement cho content_id → 403', async () => {
        const token = issueRS256({
            userId: 'free_user',
            role: 'free',
            entitlements: ['movie_999'], // không có movie_123
        });
        const res = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody({ content_id: 'movie_123' }));
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/forbidden/i);
    });

    test('User có entitlement → 200', async () => {
        const token = issueRS256({
            userId: 'premium_user',
            role: 'premium',
            entitlements: ['movie_123'],
        });
        const res = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody());
        expect(res.status).toBe(200);
    });
});

// ---------------------------------------------------------------
// TEST GROUP 7: POST /api/license — Replay Attack (Nonce)
// ---------------------------------------------------------------
describe('POST /api/license — Nonce / Replay Attack', () => {
    let app, token;
    const { _usedNonces } = require('../src/kms/kms');

    beforeAll(async () => {
        app   = buildApp(null);
        token = await loginAndGetToken(app);
    });

    afterEach(() => {
        _usedNonces.clear();
    });

    test('Nonce dùng lần 1 → 200', async () => {
        const nonce = makeNonce();
        const res = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody({ nonce }));
        expect(res.status).toBe(200);
    });

    test('Nonce replay (dùng lần 2) → 409 Conflict', async () => {
        const nonce = makeNonce();

        const res1 = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody({ nonce }));
        expect(res1.status).toBe(200);

        const res2 = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody({ nonce }));
        expect(res2.status).toBe(409);
        expect(res2.body.error).toMatch(/replay/i);
    });

    test('5 nonce khác nhau đều được chấp nhận (không false-positive)', async () => {
        for (let i = 0; i < 5; i++) {
            const res = await request(app)
                .post('/api/license')
                .set('Authorization', `Bearer ${token}`)
                .send(makeLicenseBody({ nonce: makeNonce() }));
            expect(res.status).toBe(200);
        }
    });
});

// ---------------------------------------------------------------
// TEST GROUP 7b: POST /api/license — MongoDB path (mocked db)
// ---------------------------------------------------------------
describe('POST /api/license — MongoDB mode (mock db)', () => {
    const { encryptContentKey } = require('../src/kms/kms');
    const { _usedNonces }       = require('../src/kms/kms');

    // Tạo encrypted content key để mock trong DB
    const CONTENT_KEY_HEX = '29301c10fb2d59b66067020730c0f1b1';
    const KID_HEX         = '19d57c645156a5a0ddd23849e6377665';
    let encContent;

    beforeAll(() => {
        encContent = encryptContentKey(CONTENT_KEY_HEX);
    });

    afterEach(() => _usedNonces.clear());

    function buildMockDb({ hasEntitlement = true, entitlementExpired = false,
                           activeSessions = [], keyFound = true } = {}) {
        const entitlementDoc = hasEntitlement
            ? { user_id: 'db_user', content_id: 'movie_123',
                expires_at: entitlementExpired ? new Date('2000-01-01') : null }
            : null;

        const keyDoc = keyFound
            ? { kid_hex: KID_HEX,
                key_enc_b64:    encContent.key_enc_b64,
                key_enc_iv_b64: encContent.iv_b64,
                auth_tag_b64:   encContent.auth_tag_b64 }
            : null;

        return {
            collection: (name) => ({
                findOne: async (query) => {
                    if (name === 'entitlements') return entitlementDoc;
                    if (name === 'content_keys_enc') return keyDoc;
                    return null;
                },
                find: () => ({ toArray: async () => activeSessions }),
                insertOne: async () => ({ insertedId: 'mock_id' }),
            }),
        };
    }

    test('MongoDB: có entitlement + key → 200', async () => {
        const app   = buildApp(buildMockDb());
        const token = issueRS256({ userId: 'db_user', role: 'premium',
                                   entitlements: ['movie_123'] });
        const res   = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody());
        expect(res.status).toBe(200);
        expect(res.body.encrypted_key).toBeDefined();
    });

    test('MongoDB: không có entitlement → 403', async () => {
        const app   = buildApp(buildMockDb({ hasEntitlement: false }));
        const token = issueRS256({ userId: 'db_user', role: 'premium',
                                   entitlements: ['movie_123'] });
        const res   = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody());
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/chưa mua/i);
    });

    test('MongoDB: entitlement hết hạn → 403', async () => {
        const app   = buildApp(buildMockDb({ entitlementExpired: true }));
        const token = issueRS256({ userId: 'db_user', role: 'premium',
                                   entitlements: ['movie_123'] });
        const res   = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody());
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/hết hạn/i);
    });

    test('MongoDB: vượt giới hạn 2 thiết bị → 403', async () => {
        const futureDate = new Date(Date.now() + 3_600_000);
        const activeSessions = [
            { device_id: 'device_A', expires_at: futureDate },
            { device_id: 'device_B', expires_at: futureDate },
        ];
        const app   = buildApp(buildMockDb({ activeSessions }));
        const token = issueRS256({ userId: 'db_user', role: 'premium',
                                   entitlements: ['movie_123'] });
        const res   = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody({ device_id: 'device_C_new' }));
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/2 thiết bị/i);
    });

    test('MongoDB: device đã có session (same device) → 200', async () => {
        const futureDate = new Date(Date.now() + 3_600_000);
        const activeSessions = [
            { device_id: 'device_test_001', expires_at: futureDate },
            { device_id: 'device_B', expires_at: futureDate },
        ];
        const app   = buildApp(buildMockDb({ activeSessions }));
        const token = issueRS256({ userId: 'db_user', role: 'premium',
                                   entitlements: ['movie_123'] });
        const res   = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody({ device_id: 'device_test_001' }));
        expect(res.status).toBe(200);
    });

    test('MongoDB: không tìm thấy content key → 404', async () => {
        const app   = buildApp(buildMockDb({ keyFound: false }));
        const token = issueRS256({ userId: 'db_user', role: 'premium',
                                   entitlements: ['movie_123'] });
        const res   = await request(app)
            .post('/api/license')
            .set('Authorization', `Bearer ${token}`)
            .send(makeLicenseBody());
        expect(res.status).toBe(404);
        expect(res.body.error).toMatch(/not found/i);
    });
});

// ---------------------------------------------------------------
// TEST GROUP 8: GET /kms/status
// ---------------------------------------------------------------
describe('GET /kms/status', () => {
    const app = buildApp();

    test('Trả về KMS status', async () => {
        const res = await request(app).get('/kms/status');
        expect(res.status).toBe(200);
        expect(res.body.status).toBe('ok');
        expect(res.body.master_key_set).toBe(true);
        expect(res.body.key_length_bits).toBe(256);
    });
});

// ---------------------------------------------------------------
// TEST GROUP 9: POST /kms/rotate — Auth & Role check
// ---------------------------------------------------------------
describe('POST /kms/rotate — Auth & Role', () => {
    const app = buildApp();

    test('Thiếu token → 401', async () => {
        const res = await request(app).post('/kms/rotate');
        expect(res.status).toBe(401);
    });

    test('Role không phải admin → 403', async () => {
        const token = issueRS256({ userId: 'bob', role: 'premium' });
        const res = await request(app)
            .post('/kms/rotate')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(403);
        expect(res.body.error).toMatch(/admin/i);
    });

    test('Admin role, PoC mode → 200 + rotation report', async () => {
        const token = issueRS256({ userId: 'admin_user', role: 'admin' });
        const res = await request(app)
            .post('/kms/rotate')
            .set('Authorization', `Bearer ${token}`);
        expect(res.status).toBe(200);
        expect(res.body.rotation_id).toBeDefined();
        expect(res.body.poc_mode).toBe(true);
        expect(res.body.test_passed).toBe(true);
    });
});
