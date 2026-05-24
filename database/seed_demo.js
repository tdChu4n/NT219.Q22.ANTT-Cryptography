'use strict';
/**
 * seed_demo.js — Nạp dữ liệu demo vào MongoDB cho NT219 DRM demo.
 * Chạy SAU migrate_init.js, dùng cùng MONGO_URI.
 *
 *  Nạp:
 *    content_keys_enc  — tất cả content key mã hoá AES-256-GCM (từ media-processing/license_keys.json)
 *    kids              — ánh xạ KID → content_id
 *    users             — demo_user
 *    entitlements      — demo_user có quyền xem movie_123 (1 năm)
 *
 *  Hỗ trợ license_keys.json dạng object đơn hoặc array (key rotation).
 *
 *  Chạy:
 *    MONGO_URI=mongodb://nt219_app:PASS@192.168.155.10:27017/drm_platform \
 *    KMS_MASTER_KEY=<64-hex> \
 *    node database/seed_demo.js
 */

const path = require('path');
const fs   = require('fs');

function requireFromRepo(name) {
    try { return require(name); }
    catch { return require(path.join(__dirname, '..', 'license-server', 'node_modules', name)); }
}

requireFromRepo('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const { MongoClient } = requireFromRepo('mongodb');
const { encryptContentKey } = require('../license-server/src/kms/kms');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017';
const DB_NAME   = process.env.DB_NAME   || 'drm_platform';

async function seed() {
    const client = new MongoClient(MONGO_URI);
    try {
        await client.connect();
        console.log(`[seed] Kết nối MongoDB: ${MONGO_URI}`);
        const db = client.db(DB_NAME);

        // ----------------------------------------------------------------
        // 1. Content Keys từ media-processing/license_keys.json
        //    Hỗ trợ cả single object và array (key rotation).
        // ----------------------------------------------------------------
        const keysPath = path.join(__dirname, '../media-processing/license_keys.json');
        if (!fs.existsSync(keysPath)) {
            throw new Error(`Không tìm thấy ${keysPath} — hãy chạy packaging script trước.`);
        }
        const raw  = JSON.parse(fs.readFileSync(keysPath, 'utf8'));
        const keys = Array.isArray(raw) ? raw : [raw];

        for (const k of keys) {
            const kidHex = k.KID.replace(/-/g, '').toLowerCase();
            const { key_enc_b64, iv_b64, auth_tag_b64 } = encryptContentKey(k.Key);

            // content_keys_enc — field names khớp routes/license.js dòng 122
            await db.collection('content_keys_enc').updateOne(
                { kid_hex: kidHex },
                {
                    $set: {
                        kid_hex,
                        key_enc_b64,
                        key_enc_iv_b64: iv_b64,
                        auth_tag_b64,
                        content_id: 'movie_123',
                    },
                    $setOnInsert: { created_at: new Date() },
                },
                { upsert: true },
            );
            const periodLabel = k.period ? ` (period ${k.period})` : '';
            console.log(`[seed] content_keys_enc upsert: KID=${kidHex.slice(0, 8)}…${periodLabel}`);

            // kids — ánh xạ KID → content_id
            await db.collection('kids').updateOne(
                { kid_hex: kidHex },
                {
                    $set: { kid_hex, content_id: 'movie_123' },
                    $setOnInsert: { created_at: new Date() },
                },
                { upsert: true },
            );
        }

        // ----------------------------------------------------------------
        // 2. Demo user
        // ----------------------------------------------------------------
        await db.collection('users').updateOne(
            { user_id: 'demo_user' },
            {
                $set: { user_id: 'demo_user', email: 'demo@nt219.local', role: 'premium' },
                $setOnInsert: { created_at: new Date() },
            },
            { upsert: true },
        );
        console.log('[seed] users upsert: demo_user');

        // ----------------------------------------------------------------
        // 3. Entitlement demo_user → movie_123 (hết hạn sau 1 năm)
        // ----------------------------------------------------------------
        const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000);
        await db.collection('entitlements').updateOne(
            { user_id: 'demo_user', content_id: 'movie_123' },
            {
                $set: { user_id: 'demo_user', content_id: 'movie_123', expires_at: expiresAt },
                $setOnInsert: { created_at: new Date() },
            },
            { upsert: true },
        );
        console.log(`[seed] entitlements upsert: demo_user → movie_123 (exp ${expiresAt.toISOString()})`);

        console.log(`\n[seed] ✅ Seed hoàn thành! ${keys.length} content key(s) đã nạp.`);
    } catch (err) {
        console.error('[seed] ❌ Lỗi:', err.message);
        process.exit(1);
    } finally {
        await client.close();
    }
}

seed();
