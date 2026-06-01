'use strict';
/**
 * seed_demo.js — Nạp dữ liệu demo vào MongoDB cho NT219 DRM demo.
 * Chạy SAU migrate_init.js, dùng cùng MONGO_URI.
 *
 *  Nạp:
 *    content_keys_enc  — content key mã hoá AES-256-GCM
 *    kids              — ánh xạ KID → content_id
 *    users             — demo_user (password: demo123, hash bcrypt)
 *    entitlements      — demo_user có quyền xem movie_123 (1 năm)
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
const bcrypt          = requireFromRepo('bcryptjs');
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
        // 1. Content Keys
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

            await db.collection('content_keys_enc').updateOne(
                { kid_hex: kidHex },
                {
                    $set: { kid_hex: kidHex, key_enc_b64, key_enc_iv_b64: iv_b64, auth_tag_b64, content_id: 'movie_123' },
                    $setOnInsert: { created_at: new Date() },
                },
                { upsert: true },
            );
            const periodLabel = k.period ? ` (period ${k.period})` : '';
            console.log(`[seed] content_keys_enc: KID=${kidHex.slice(0, 8)}…${periodLabel}`);

            await db.collection('kids').updateOne(
                { kid_hex: kidHex },
                { $set: { kid_hex: kidHex, content_id: 'movie_123' }, $setOnInsert: { created_at: new Date() } },
                { upsert: true },
            );
        }

        // ----------------------------------------------------------------
        // 2. Demo user — password: demo123 (bcrypt cost 12)
        // ----------------------------------------------------------------
        const DEMO_PASSWORD = 'demo123';
        const password_hash = await bcrypt.hash(DEMO_PASSWORD, 12);

        await db.collection('users').updateOne(
            { user_id: 'demo_user' },
            {
                $set: {
                    user_id:       'demo_user',
                    email:         'demo@nt219.local',
                    name:          'Demo User',
                    role:          'premium',
                    password_hash,          // bcrypt hash, cost=12
                },
                $setOnInsert: { created_at: new Date() },
            },
            { upsert: true },
        );
        console.log(`[seed] users upsert: demo_user (email=demo@nt219.local, password=${DEMO_PASSWORD})`);

        // ----------------------------------------------------------------
        // 3. Entitlement demo_user → movie_123
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
        console.log(`[seed] entitlements: demo_user → movie_123 (exp ${expiresAt.toISOString()})`);

        console.log(`\n[seed] ✅ Hoàn thành! ${keys.length} content key(s). Tài khoản demo: demo@nt219.local / ${DEMO_PASSWORD}`);
    } catch (err) {
        console.error('[seed] ❌ Lỗi:', err.message);
        process.exit(1);
    } finally {
        await client.close();
    }
}

seed();
