'use strict';

const express = require('express');
const cors    = require('cors');
const path    = require('path');
const app     = express();
const port    = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// ------------------------------------------------------------------
// Kết nối MongoDB (tuỳ chọn — fallback sang file JSON nếu không có)
// ------------------------------------------------------------------
let db = null;
const MONGO_URI = process.env.MONGO_URI;

async function connectMongo() {
    if (!MONGO_URI) {
        console.warn('[Server] MONGO_URI không được set — chạy ở chế độ PoC (file JSON).');
        return;
    }
    try {
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(MONGO_URI);
        await client.connect();
        db = client.db(process.env.DB_NAME || 'drm_platform');
        console.log('[Server] ✅ Kết nối MongoDB thành công.');
    } catch (err) {
        console.error('[Server] ❌ Kết nối MongoDB thất bại:', err.message);
    }
}

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------

// Auth: Cấp JWT RS256 (mô phỏng login)
const { issueRS256 } = require('./auth/jwt');
app.post('/api/auth/login', (req, res) => {
    const { username } = req.body;
    if (!username) return res.status(400).json({ error: 'Missing username' });

    // Mô phỏng: tất cả user được coi là premium và có quyền xem movie_123
    const token = issueRS256({
        userId:       username,
        role:         'premium',
        entitlements: ['movie_123'],
    }, '2h');

    res.json({ token, message: 'Đăng nhập thành công' });
});

// License: POST /api/license (T2.4 — đầy đủ)
const { router: licenseRouter, setDb } = require('./routes/license');
app.use('/api/license', licenseRouter);

// KMS: POST /kms/rotate — T3.5
const kmsRotateRouter = require('./kms/kms_rotate');
app.use('/kms', kmsRotateRouter);


// Health check
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: '🔐 License Server NT219 đang chạy.' });
});

// ------------------------------------------------------------------
// Khởi động
// ------------------------------------------------------------------
(async () => {
    await connectMongo();
    setDb(db); // inject db vào license router
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 License Server đang chạy tại http://localhost:${port}`);
        console.log(`   Mode: ${db ? 'MongoDB' : 'PoC (file JSON)'}`);
    });
})();