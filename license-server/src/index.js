'use strict';

const express  = require('express');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const app      = express();
const port     = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());

// ------------------------------------------------------------------
// MongoDB
// ------------------------------------------------------------------
let db = null;
const MONGO_URI = process.env.MONGO_URI;

async function connectMongo() {
    if (!MONGO_URI) {
        console.warn('[Server] MONGO_URI chưa set — chạy ở chế độ PoC (demo account cứng).');
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
// Helpers
// ------------------------------------------------------------------
const { issueRS256, verifyRS256 } = require('./auth/jwt');

/** Middleware xác thực JWT — gắn req.user nếu hợp lệ */
function requireAuth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized: Thiếu token' });
    }
    const { valid, decoded, error } = verifyRS256(header.split(' ')[1]);
    if (!valid) return res.status(401).json({ error: `Unauthorized: ${error}` });
    req.user = decoded;
    next();
}

/** Tạo user_id duy nhất từ timestamp + random */
function newUserId() {
    return `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

// ------------------------------------------------------------------
// POST /api/auth/register
// Body: { email, password, name? }
// ------------------------------------------------------------------
app.post('/api/auth/register', async (req, res) => {
    const { email, password, name } = req.body ?? {};

    if (!email || !password)
        return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });

    // Kiểm tra định dạng email cơ bản
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Định dạng email không hợp lệ' });

    if (password.length < 8)
        return res.status(400).json({ error: 'Mật khẩu phải ít nhất 8 ký tự' });

    if (!db)
        return res.status(503).json({ error: 'Đăng ký cần kết nối cơ sở dữ liệu' });

    try {
        // Kiểm tra email đã tồn tại chưa
        const existing = await db.collection('users').findOne({ email });
        if (existing)
            return res.status(409).json({ error: 'Email đã được sử dụng' });

        const password_hash = await bcrypt.hash(password, 12);
        const user_id = newUserId();
        const displayName = name || email.split('@')[0];

        await db.collection('users').insertOne({
            user_id,
            email,
            name: displayName,
            role: 'user',
            password_hash,
            created_at: new Date(),
        });

        // Tự động cấp entitlement movie_123 (1 năm) cho user mới
        await db.collection('entitlements').insertOne({
            user_id,
            content_id: 'movie_123',
            expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000),
            created_at: new Date(),
        });

        const token = issueRS256(
            { userId: user_id, email, name: displayName, role: 'user', entitlements: ['movie_123'] },
            '24h'
        );

        console.log(`[Auth] ✅ Đăng ký thành công: ${email} (${user_id})`);
        return res.status(201).json({
            token,
            user: { userId: user_id, email, name: displayName, role: 'user' },
        });
    } catch (err) {
        console.error('[Auth] Lỗi đăng ký:', err.message);
        return res.status(500).json({ error: 'Lỗi máy chủ: ' + err.message });
    }
});

// ------------------------------------------------------------------
// POST /api/auth/login
// Body: { email, password }
// ------------------------------------------------------------------
app.post('/api/auth/login', async (req, res) => {
    const { email, password } = req.body ?? {};

    if (!email || !password)
        return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });

    // --- MongoDB path ---
    if (db) {
        try {
            const user = await db.collection('users').findOne({ email });
            if (!user)
                return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

            const match = await bcrypt.compare(password, user.password_hash);
            if (!match)
                return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

            // Lấy danh sách entitlement còn hạn
            const now = new Date();
            const entDocs = await db.collection('entitlements').find({
                user_id:    user.user_id,
                expires_at: { $gt: now },
            }).toArray();
            const entitlements = entDocs.map(e => e.content_id);

            const token = issueRS256(
                { userId: user.user_id, email: user.email, name: user.name || '', role: user.role || 'user', entitlements },
                '24h'
            );

            console.log(`[Auth] ✅ Đăng nhập: ${email} (${user.user_id})`);
            return res.json({
                token,
                user: { userId: user.user_id, email: user.email, name: user.name || '', role: user.role || 'user' },
            });
        } catch (err) {
            console.error('[Auth] Lỗi đăng nhập:', err.message);
            return res.status(500).json({ error: 'Lỗi máy chủ: ' + err.message });
        }
    }

    // --- PoC fallback: tài khoản demo cứng ---
    if (email === 'demo@nt219.local' && password === 'demo123') {
        const token = issueRS256(
            { userId: 'demo_user', email, name: 'Demo User', role: 'premium', entitlements: ['movie_123'] },
            '24h'
        );
        console.log(`[Auth] ✅ Đăng nhập PoC: ${email}`);
        return res.json({
            token,
            user: { userId: 'demo_user', email, name: 'Demo User', role: 'premium' },
        });
    }

    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
});

// ------------------------------------------------------------------
// GET /api/auth/me  — xác minh token, trả thông tin user
// ------------------------------------------------------------------
app.get('/api/auth/me', requireAuth, (req, res) => {
    const { userId, email, name, role, entitlements } = req.user;
    return res.json({ userId, email, name: name || '', role, entitlements: entitlements || [] });
});

// ------------------------------------------------------------------
// License routes
// ------------------------------------------------------------------
const { router: licenseRouter, setDb } = require('./routes/license');
app.use('/api/license', licenseRouter);
app.use('/license', licenseRouter); // alias cho nginx proxy

// ------------------------------------------------------------------
// KMS
// ------------------------------------------------------------------
const kmsRotateRouter = require('./kms/kms_rotate');
app.use('/kms', kmsRotateRouter);

// ------------------------------------------------------------------
// Health check
// ------------------------------------------------------------------
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: '🔐 License Server NT219 đang chạy.' });
});

// ------------------------------------------------------------------
// Start
// ------------------------------------------------------------------
(async () => {
    await connectMongo();
    setDb(db);
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 License Server tại http://localhost:${port}`);
        console.log(`   Mode: ${db ? 'MongoDB' : 'PoC (demo@nt219.local / demo123)'}`);
    });
})();
