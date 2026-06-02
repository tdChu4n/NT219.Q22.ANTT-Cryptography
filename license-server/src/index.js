'use strict';

const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const rateLimit  = require('express-rate-limit');
const bcrypt     = require('bcryptjs');
const app        = express();
const port       = process.env.PORT || 3000;

// ------------------------------------------------------------------
// 1. Security headers — helmet thêm 11 HTTP headers bảo vệ
// ------------------------------------------------------------------
app.use(helmet({
    crossOriginResourcePolicy: { policy: 'cross-origin' }, // cho phép CDN segment
}));

// ------------------------------------------------------------------
// 2. CORS — chỉ cho phép player và localhost (không mở wildcard)
// ------------------------------------------------------------------
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || 'http://localhost:5173,http://localhost:4173')
    .split(',').map(o => o.trim());

app.use(cors({
    origin: (origin, cb) => {
        // Cho phép requests không có origin (curl, server-to-server)
        if (!origin || ALLOWED_ORIGINS.includes(origin)) return cb(null, true);
        cb(new Error(`CORS: Origin "${origin}" không được phép`));
    },
    methods: ['GET', 'POST'],
    allowedHeaders: ['Content-Type', 'Authorization'],
    credentials: false,
}));

app.use(express.json({ limit: '64kb' })); // giới hạn body size

// ------------------------------------------------------------------
// 3. Rate Limiting
// ------------------------------------------------------------------

/** Đăng nhập: tối đa 10 lần / 15 phút / IP — chống brute-force */
const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 10,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều lần thử đăng nhập. Thử lại sau 15 phút.' },
    skipSuccessfulRequests: true, // không đếm login thành công
});

/** Đăng ký: tối đa 5 tài khoản / giờ / IP — chống spam account */
const registerLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 5,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Quá nhiều tài khoản được tạo từ IP này. Thử lại sau 1 giờ.' },
});

/** License: tối đa 60 request / giờ / IP
 *  Một phim 2h với key rotation mỗi 5 phút → tối đa 24 request/lần xem.
 *  Giới hạn 60 cho phép 2 lần xem đồng thời + buffer. */
const licenseLimiter = rateLimit({
    windowMs: 60 * 60 * 1000,
    max: 60,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Rate limit: Quá nhiều license request. Liên hệ hỗ trợ.' },
});

// ------------------------------------------------------------------
// 4. Anomaly Detection — phát hiện 1 user dùng từ nhiều IP bất thường
// ------------------------------------------------------------------
const userIpMap = new Map(); // userId → { ips: Set, windowStart: number }

function detectAnomalousLicenseRequest(userId, clientIp) {
    const now    = Date.now();
    const window = 15 * 60 * 1000; // 15 phút

    if (!userIpMap.has(userId)) {
        userIpMap.set(userId, { ips: new Set([clientIp]), windowStart: now });
        return null;
    }

    const record = userIpMap.get(userId);

    // Reset cửa sổ thời gian
    if (now - record.windowStart > window) {
        record.ips       = new Set([clientIp]);
        record.windowStart = now;
        return null;
    }

    record.ips.add(clientIp);

    // Cảnh báo nếu 1 user xem từ hơn 3 IP khác nhau trong 15 phút
    if (record.ips.size > 3) {
        return `Anomaly: user "${userId}" gửi license request từ ${record.ips.size} IP khác nhau trong 15 phút`;
    }

    return null;
}

// ------------------------------------------------------------------
// 5. Input validation helper
// ------------------------------------------------------------------
const HEX32_RE  = /^[0-9a-f]{32}$/i;
const UUID_RE   = /^[0-9a-f-]{36}$/i;
const PEM_RE    = /-----BEGIN PUBLIC KEY-----[\s\S]+-----END PUBLIC KEY-----/;

function validateLicenseBody({ kid, device_id, device_public_key_pem, nonce, content_id }) {
    if (!kid || !HEX32_RE.test(kid.replace(/-/g, '')))
        return 'kid phải là hex 32 ký tự';
    if (!device_id || device_id.length < 8 || device_id.length > 128)
        return 'device_id không hợp lệ';
    if (!device_public_key_pem || !PEM_RE.test(device_public_key_pem))
        return 'device_public_key_pem phải là PEM hợp lệ';
    if (!nonce || nonce.length < 16 || nonce.length > 128)
        return 'nonce không hợp lệ';
    if (!content_id || content_id.length > 64)
        return 'content_id không hợp lệ';
    return null;
}

// ------------------------------------------------------------------
// MongoDB
// ------------------------------------------------------------------
let db = null;
const MONGO_URI = process.env.MONGO_URI;

async function connectMongo() {
    if (!MONGO_URI) {
        console.warn('[Server] MONGO_URI chưa set — chạy ở chế độ PoC.');
        return;
    }
    try {
        const { MongoClient } = require('mongodb');
        const client = new MongoClient(MONGO_URI, {
            serverSelectionTimeoutMS: 5000,
            socketTimeoutMS: 10000,
        });
        await client.connect();
        db = client.db(process.env.DB_NAME || 'drm_platform');
        console.log('[Server] ✅ Kết nối MongoDB thành công.');
    } catch (err) {
        console.error('[Server] ❌ MongoDB thất bại:', err.message);
    }
}

// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
const { issueRS256, verifyRS256 } = require('./auth/jwt');

function requireAuth(req, res, next) {
    const header = req.headers['authorization'];
    if (!header?.startsWith('Bearer '))
        return res.status(401).json({ error: 'Unauthorized: Thiếu token' });
    const { valid, decoded, error } = verifyRS256(header.split(' ')[1]);
    if (!valid) return res.status(401).json({ error: `Unauthorized: ${error}` });
    req.user = decoded;
    next();
}

function newUserId() {
    return `user_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function clientIp(req) {
    return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
        .split(',')[0].trim();
}

// ------------------------------------------------------------------
// POST /api/auth/register
// ------------------------------------------------------------------
app.post('/api/auth/register', registerLimiter, async (req, res) => {
    const { email, password, name } = req.body ?? {};
    if (!email || !password)
        return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))
        return res.status(400).json({ error: 'Định dạng email không hợp lệ' });
    if (password.length < 8)
        return res.status(400).json({ error: 'Mật khẩu phải ít nhất 8 ký tự' });
    if (!db)
        return res.status(503).json({ error: 'Đăng ký cần kết nối cơ sở dữ liệu' });

    try {
        if (await db.collection('users').findOne({ email }))
            return res.status(409).json({ error: 'Email đã được sử dụng' });

        const password_hash = await bcrypt.hash(password, 12);
        const user_id       = newUserId();
        const displayName   = name || email.split('@')[0];

        await db.collection('users').insertOne({
            user_id, email, name: displayName, role: 'user', password_hash, created_at: new Date(),
        });
        await db.collection('entitlements').insertOne({
            user_id, content_id: 'movie_123',
            expires_at: new Date(Date.now() + 365 * 24 * 3600 * 1000),
            created_at: new Date(),
        });

        const token = issueRS256(
            { userId: user_id, email, name: displayName, role: 'user', entitlements: ['movie_123'] },
            '24h'
        );
        console.log(`[Auth] ✅ Đăng ký: ${email} (${user_id}) từ ${clientIp(req)}`);
        return res.status(201).json({ token, user: { userId: user_id, email, name: displayName, role: 'user' } });
    } catch (err) {
        return res.status(500).json({ error: 'Lỗi máy chủ: ' + err.message });
    }
});

// ------------------------------------------------------------------
// POST /api/auth/login
// ------------------------------------------------------------------
app.post('/api/auth/login', loginLimiter, async (req, res) => {
    const { email, password } = req.body ?? {};
    if (!email || !password)
        return res.status(400).json({ error: 'Thiếu email hoặc mật khẩu' });

    if (db) {
        try {
            const user  = await db.collection('users').findOne({ email });
            const match = user && await bcrypt.compare(password, user.password_hash);
            if (!user || !match)
                return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });

            const now     = new Date();
            const entDocs = await db.collection('entitlements').find({
                user_id: user.user_id, expires_at: { $gt: now },
            }).toArray();
            const entitlements = entDocs.map(e => e.content_id);

            const token = issueRS256(
                { userId: user.user_id, email: user.email, name: user.name || '', role: user.role || 'user', entitlements },
                '24h'
            );
            console.log(`[Auth] ✅ Đăng nhập: ${email} từ ${clientIp(req)}`);
            return res.json({ token, user: { userId: user.user_id, email: user.email, name: user.name || '', role: user.role } });
        } catch (err) {
            return res.status(500).json({ error: 'Lỗi máy chủ: ' + err.message });
        }
    }

    // PoC fallback
    if (email === 'demo@nt219.local' && password === 'demo123') {
        const token = issueRS256(
            { userId: 'demo_user', email, name: 'Demo User', role: 'premium', entitlements: ['movie_123'] },
            '24h'
        );
        return res.json({ token, user: { userId: 'demo_user', email, name: 'Demo User', role: 'premium' } });
    }
    return res.status(401).json({ error: 'Email hoặc mật khẩu không đúng' });
});

// ------------------------------------------------------------------
// GET /api/auth/me
// ------------------------------------------------------------------
app.get('/api/auth/me', requireAuth, (req, res) => {
    const { userId, email, name, role, entitlements } = req.user;
    return res.json({ userId, email, name: name || '', role, entitlements: entitlements || [] });
});

// ------------------------------------------------------------------
// License routes (với rate limit + anomaly detection)
// ------------------------------------------------------------------
const { router: licenseRouter, setDb } = require('./routes/license');

// Inject anomaly detector vào license router
app.use((req, res, next) => {
    if (req.path === '/' && (req.baseUrl === '/api/license' || req.baseUrl === '/license')) {
        req.detectAnomaly = detectAnomalousLicenseRequest;
        req.clientIp      = clientIp(req);
    }
    next();
});

app.use('/api/license', licenseLimiter, licenseRouter);
app.use('/license',     licenseLimiter, licenseRouter);

// ------------------------------------------------------------------
// KMS
// ------------------------------------------------------------------
app.use('/kms', require('./kms/kms_rotate'));

// ------------------------------------------------------------------
// Health check
// ------------------------------------------------------------------
app.get('/', (req, res) => {
    res.json({ status: 'ok', message: '🔐 License Server NT219' });
});

// ------------------------------------------------------------------
// Global error handler — không leak stack trace ra ngoài
// ------------------------------------------------------------------
app.use((err, req, res, _next) => {
    console.error('[Server] Unhandled error:', err.message);
    res.status(500).json({ error: 'Internal server error' });
});

// ------------------------------------------------------------------
// Start
// ------------------------------------------------------------------
(async () => {
    await connectMongo();
    setDb(db);
    app.listen(port, '0.0.0.0', () => {
        console.log(`🚀 License Server tại http://0.0.0.0:${port}`);
        console.log(`   CORS origins: ${ALLOWED_ORIGINS.join(', ')}`);
        console.log(`   Mode: ${db ? 'MongoDB' : 'PoC (demo@nt219.local / demo123)'}`);
    });
})();
