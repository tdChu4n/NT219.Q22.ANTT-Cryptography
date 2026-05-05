const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken'); // Cần chạy: npm install jsonwebtoken cors
const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Load License Keys từ quá trình Media Processing
const keysFilePath = path.join(__dirname, '../../media-processing/license_keys.json');
let licenseDb = [];
if (fs.existsSync(keysFilePath)) {
    const rawData = JSON.parse(fs.readFileSync(keysFilePath, 'utf8'));
    // Nếu là dạng mảng (Key Rotation)
    if (Array.isArray(rawData)) {
        licenseDb = rawData;
    } else {
        licenseDb = [rawData]; // Nếu là 1 object đơn
    }
    console.log(`[Info] Đã load ${licenseDb.length} keys từ config.`);
} else {
    console.warn('[Warning] Không tìm thấy license_keys.json!');
}

// -------------------------------------------------------------
// TASK T1.4: MÔ PHỎNG LICENSE SERVER VỚI JWT & ENTITLEMENT
// -------------------------------------------------------------

// Secret key dùng để ký JWT
const JWT_SECRET = "super_secret_key_nt219_mật_mã_học";

// 1. API: Cấp JWT cho End-User (Mô phỏng đăng nhập thành công)
app.post('/api/auth/login', (req, res) => {
    // Mô phỏng User đã trả tiền
    const userPayload = {
        userId: "user_vip_001",
        role: "premium",
        entitlements: ["movie_123"] // Danh sách phim được xem
    };
    
    const token = jwt.sign(userPayload, JWT_SECRET, { expiresIn: '2h' });
    res.json({ token: token, message: "Đăng nhập thành công" });
});

// 2. API: Cấp License Key (Widevine / ClearKey dạng mô phỏng)
app.post('/api/license', (req, res) => {
    // Yêu cầu Client phải gửi JWT Token trong Header Authorization
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        return res.status(401).json({ error: "Unauthorized: Missing Token" });
    }

    const token = authHeader.split(' ')[1];
    try {
        // Xác thực JWT
        const decoded = jwt.verify(token, JWT_SECRET);
        
        // Kiểm tra quyền lợi (Entitlement)
        if (!decoded.entitlements.includes("movie_123")) {
            return res.status(403).json({ error: "Forbidden: Bạn chưa mua phim này!" });
        }

        // Lấy KID từ Request Body (Thường DRM Player sẽ gửi mảng các KIDs)
        const requestedKID = req.body.kid || (req.body.kids && req.body.kids[0]);
        
        if (!requestedKID) {
            return res.status(400).json({ error: "Bad Request: Missing KID" });
        }

        // TODO (Nâng cao): Giải mã Public Key của Device và mã hóa Key bằng RSA-OAEP
        // Ở mức PoC này, chúng ta trả về Key dạng ClearKey (mô phỏng) hoặc dạng thô để kiểm chứng
        
        const matchedKeyObj = licenseDb.find(k => k.KID.toLowerCase() === requestedKID.replace(/-/g, '').toLowerCase());

        if (matchedKeyObj) {
            console.log(`[Success] Cấp quyền giải mã cho user ${decoded.userId} với KID ${matchedKeyObj.KID}`);
            
            // Trả về định dạng ClearKey JSON (để tương thích Shaka Player)
            const kid_b64 = Buffer.from(matchedKeyObj.KID, 'hex').toString('base64url');
            const key_b64 = Buffer.from(matchedKeyObj.Key, 'hex').toString('base64url');

            return res.status(200).json({
                keys: [{
                    kty: "oct",
                    k: key_b64,
                    kid: kid_b64
                }],
                type: "temporary"
            });
        } else {
            return res.status(404).json({ error: "Not Found: Key for this KID doesn't exist" });
        }

    } catch (err) {
        return res.status(401).json({ error: "Unauthorized: Invalid Token", details: err.message });
    }
});

// Test cơ bản
app.get('/', (req, res) => {
    res.send('License Server Đồ án Mật Mã Học đang chạy.');
});

app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 License Server đang chạy tại http://localhost:${port}`);
});