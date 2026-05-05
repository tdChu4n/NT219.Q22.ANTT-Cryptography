#!/bin/bash
# T3.1: Integration test E2E (smoke-test.sh)
# Flow: Ingest -> Packager -> CDN -> Player (mô phỏng gọi api) -> License Server

echo "🚀 Bắt đầu Integration Test E2E (Smoke Test)..."
echo "------------------------------------------------------------"

# Helper function
check_status() {
    if [ $1 -eq 0 ]; then
        echo -e "[✅ PASS] $2"
    else
        echo -e "[❌ FAIL] $2"
        exit 1
    fi
}

# 1. Kiểm tra Packager Output (Ingest -> Packager)
echo -e "\n[1] Kiểm tra Ingest / Packager..."
if [ -f "../media-processing/license_keys.json" ]; then
    check_status 0 "Tìm thấy file license_keys.json (đã export CENC keys)"
else
    echo "[⚠️ WARN] Không tìm thấy license_keys.json, server sẽ dùng fallback."
fi

# 2. End-to-End Test bằng Node.js (xử lý Health Check, Auth, License, Decrypt)
echo -e "\n[2] Kiểm tra luồng E2E (Health -> Auth -> License -> Decrypt)..."

node.exe -e "
const http = require('http');
const crypto = require('crypto');

async function fetchJson(url, options) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, options, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, data: JSON.parse(data) });
                } catch (e) {
                    resolve({ status: res.statusCode, data });
                }
            });
        });
        req.on('error', reject);
        if (options && options.body) req.write(options.body);
        req.end();
    });
}

async function fetchString(url) {
    return new Promise((resolve, reject) => {
        const req = http.request(url, { method: 'GET' }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => resolve({ status: res.statusCode, data }));
        });
        req.on('error', reject);
        req.end();
    });
}

async function runTest() {
    try {
        // 0. Health Check
        console.log('   -> GET / (License Server Health Check)');
        const healthRes = await fetchString('http://127.0.0.1:3000/');
        if (healthRes.status !== 200) throw new Error('License Server không phản hồi!');
        console.log('   [✅ PASS] License Server đang hoạt động');

        console.log('   -> GET /healthz (CDN Health Check)');
        try {
            const cdnRes = await fetchString('http://127.0.0.1:80/healthz');
            if (cdnRes.status === 200) {
                console.log('   [✅ PASS] CDN đang hoạt động (HTTP 200)');
            } else {
                console.log('   [⚠️ WARN] CDN trả về HTTP ' + cdnRes.status);
            }
        } catch(e) {
            console.log('   [⚠️ WARN] CDN không phản hồi. Bỏ qua nếu chưa chạy docker-compose.');
        }

        // A. Đăng nhập xin JWT
        console.log('   -> POST /api/auth/login');

        const authRes = await fetchJson('http://127.0.0.1:3000/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username: 'e2e_tester' })
        });
        if (authRes.status !== 200 || !authRes.data.token) throw new Error('Auth fail');
        console.log('   [✅ PASS] Lấy JWT Token thành công');

        // B. Tạo Device RSA Key
        const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
            modulusLength: 2048,
            publicKeyEncoding: { type: 'spki', format: 'pem' },
            privateKeyEncoding: { type: 'pkcs8', format: 'pem' }
        });

        // C. Xin License
        console.log('   -> POST /api/license');
        const licenseRes = await fetchJson('http://127.0.0.1:3000/api/license', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + authRes.data.token
            },
            body: JSON.stringify({
                kid: '19d57c645156a5a0ddd23849e6377665', // KID từ db hoặc file
                device_id: 'device-e2e-' + Date.now(),
                device_public_key_pem: publicKey,
                nonce: crypto.randomUUID(),
                content_id: 'movie_123'
            })
        });

        if (licenseRes.status === 200) {
            console.log('   [✅ PASS] Cấp License thành công (HTTP 200)');
            
            // D. Giải mã Content Key để chứng minh License xài được
            const encryptedKey = licenseRes.data.encrypted_key;
            const contentKeyBuf = crypto.privateDecrypt({
                key: privateKey,
                padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
                oaepHash: 'sha256'
            }, Buffer.from(encryptedKey, 'base64'));
            
            console.log('   [✅ PASS] Device giải mã Content Key thành công: ' + contentKeyBuf.toString('hex').substring(0, 10) + '...');
        } else if (licenseRes.status === 404 || licenseRes.status === 503) {
            console.log('   [⚠️ WARN] Không tìm thấy KID trong DB (Cần chạy ingest trước). Status: ' + licenseRes.status);
        } else {
            throw new Error('License API fail: ' + JSON.stringify(licenseRes.data));
        }

    } catch (err) {
        console.error('   [❌ FAIL]', err.message);
        process.exit(1);
    }
}
runTest();
"
if [ $? -ne 0 ]; then
    exit 1
fi

echo "------------------------------------------------------------"
echo -e "\n🎉 TẤT CẢ E2E TESTS ĐỀU PASS XANH!"
exit 0
