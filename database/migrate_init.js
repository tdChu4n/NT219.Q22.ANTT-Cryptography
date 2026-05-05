/**
 * T1.4: migrate_init.js
 * Khởi tạo toàn bộ collections, indexes và constraints cho MongoDB
 * 
 * Chạy: node database/migrate_init.js
 * Yêu cầu: MONGO_URI trong biến môi trường hoặc .env
 */

require('dotenv').config({ path: __dirname + '/../.env' });
const { MongoClient } = require('mongodb');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME   = process.env.DB_NAME   || 'drm_platform';

async function migrate() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        console.log(`[✓] Kết nối MongoDB thành công: ${MONGO_URI}`);
        const db = client.db(DB_NAME);

        // --------------------------------------------------
        // 1. Collection: kids
        // --------------------------------------------------
        await db.createCollection('kids').catch(() => {});
        await db.collection('kids').createIndexes([
            { key: { kid_hex:    1 }, name: 'idx_kid_hex',    unique: true },
            { key: { content_id: 1 }, name: 'idx_content_id' },
        ]);
        console.log('[✓] Collection "kids" — indexes OK');

        // --------------------------------------------------
        // 2. Collection: content_keys_enc
        // --------------------------------------------------
        await db.createCollection('content_keys_enc').catch(() => {});
        await db.collection('content_keys_enc').createIndexes([
            { key: { kid_hex:    1 }, name: 'idx_cke_kid_hex', unique: true },
            // TTL index: tự xóa key đã hết hạn
            { key: { expires_at: 1 }, name: 'idx_cke_ttl', expireAfterSeconds: 0 },
        ]);
        console.log('[✓] Collection "content_keys_enc" — indexes OK');

        // --------------------------------------------------
        // 3. Collection: users
        // --------------------------------------------------
        await db.createCollection('users').catch(() => {});
        await db.collection('users').createIndexes([
            { key: { email:   1 }, name: 'idx_email',   unique: true },
            { key: { user_id: 1 }, name: 'idx_user_id', unique: true },
        ]);
        console.log('[✓] Collection "users" — indexes OK');

        // --------------------------------------------------
        // 4. Collection: entitlements
        // --------------------------------------------------
        await db.createCollection('entitlements').catch(() => {});
        await db.collection('entitlements').createIndexes([
            {
                key: { user_id: 1, content_id: 1 },
                name: 'idx_entitlement_unique',
                unique: true
            },
        ]);
        console.log('[✓] Collection "entitlements" — indexes OK');

        // --------------------------------------------------
        // 5. Collection: devices
        // --------------------------------------------------
        await db.createCollection('devices').catch(() => {});
        await db.collection('devices').createIndexes([
            { key: { device_id: 1 }, name: 'idx_device_id', unique: true },
            { key: { user_id:   1 }, name: 'idx_device_user' },
        ]);
        console.log('[✓] Collection "devices" — indexes OK');

        // --------------------------------------------------
        // 6. Collection: sessions
        // --------------------------------------------------
        await db.createCollection('sessions').catch(() => {});
        await db.collection('sessions').createIndexes([
            { key: { session_id: 1 }, name: 'idx_session_id', unique: true },
            // nonce phải unique để chặn Token Replay Attack
            { key: { nonce:      1 }, name: 'idx_nonce',      unique: true },
            // TTL index: tự xóa session hết hạn
            { key: { expires_at: 1 }, name: 'idx_session_ttl', expireAfterSeconds: 0 },
        ]);
        console.log('[✓] Collection "sessions" — indexes OK');

        console.log('\n[✓] Migration hoàn thành! Database sẵn sàng cho License Server.');

    } catch (err) {
        console.error('[✗] Lỗi Migration:', err.message);
        process.exit(1);
    } finally {
        await client.close();
    }
}

migrate();
