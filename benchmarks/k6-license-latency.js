/**
 * T4.4 — k6 Load Test: License Server Latency Benchmark
 * NT219 Cryptography Project
 *
 * Đo latency p50/p95/p99 của POST /api/license dưới tải thực tế.
 *
 * Cài đặt k6: https://k6.io/docs/getting-started/installation/
 *   Windows: winget install k6 --source winget
 *   Linux:   sudo apt install k6
 *
 * Chạy:
 *   k6 run k6-license-latency.js
 *   k6 run --out json=raw_results.json k6-license-latency.js
 *
 * Cấu hình target:
 *   Sửa BASE_URL nếu license server chạy ở cổng khác
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Counter, Rate } from 'k6/metrics';
import crypto from 'k6/crypto';

// ----------------------------------------------------------------
// Cấu hình test
// ----------------------------------------------------------------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Custom metrics
const licenseLatency   = new Trend('license_latency_ms',   true);
const loginLatency     = new Trend('login_latency_ms',     true);
const licenseErrors    = new Counter('license_errors');
const licenseSuccesses = new Counter('license_successes');
const errorRate        = new Rate('error_rate');

// ----------------------------------------------------------------
// Scenarios: 3 giai đoạn — warmup, ramp-up, steady-state
// ----------------------------------------------------------------
export const options = {
    scenarios: {
        license_load: {
            executor:          'ramping-vus',
            startVUs:          1,
            stages: [
                { duration: '30s', target: 5   },  // Warm-up
                { duration: '60s', target: 20  },  // Ramp-up
                { duration: '60s', target: 20  },  // Steady-state
                { duration: '15s', target: 0   },  // Cool-down
            ],
            gracefulRampDown: '10s',
        },
    },
    thresholds: {
        // SLA: p95 < 50ms, error rate < 1%
        'license_latency_ms{scenario:license_load}': [
            'p(50)<20',
            'p(95)<50',
            'p(99)<100',
        ],
        'error_rate': ['rate<0.01'],
        'http_req_failed': ['rate<0.01'],
    },
};

// ----------------------------------------------------------------
// Data tĩnh cho PoC (không cần tạo RSA key thật trong k6)
// ----------------------------------------------------------------
const CONTENT_ID = 'movie_123';
const KID        = '19d57c645156a5a0ddd23849e6377665';

// RSA-2048 public key của device (test only — PEM format)
const DEVICE_PUBLIC_KEY_PEM = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA2a2rwplBQLzHPZe5TNJF
dAGEtEXMGDFPBFBmXDeRJ9GYxCPSHMm7cpVvJMhEWVDnqUXGVnbmGUxHKCHJAFmK
qb7bFV4KzDFqBmNP2kG5nCsKqLqN6fVL+PZeKZs5fXmVWnDMk2KqGaqhEzZ6N3
9bGjRNjAcKuhlH5Mq9e1L2b4d2fMeT/MX+t5T+OGBfmLv3Hxi5xw9o3G3ZOMHN
GZZwC3G8yWzM1J7R9K1kNcO/MJxb5p8Cc+i4T8Z3bpNNe2NUrKzBhFVDIWQ6+rG
tblAJN/T5VPnbM+T8bR4n9uiKh0OIRYnWgGvb2eK3K9O4mKfzXqSHiVaExlFoQ
OQIDAQAB
-----END PUBLIC KEY-----`;

// ----------------------------------------------------------------
// Setup: đăng nhập 1 lần, dùng token cho toàn bộ test
// ----------------------------------------------------------------
export function setup() {
    const loginRes = http.post(
        `${BASE_URL}/api/auth/login`,
        JSON.stringify({ username: 'k6_bench_user' }),
        { headers: { 'Content-Type': 'application/json' } }
    );

    if (loginRes.status !== 200) {
        console.error(`[setup] Login failed: ${loginRes.status} — ${loginRes.body}`);
        return { token: null };
    }

    const body = JSON.parse(loginRes.body);
    console.log(`[setup] Login OK, token: ${body.token.substring(0, 30)}...`);
    return { token: body.token };
}

// ----------------------------------------------------------------
// Main VU function
// ----------------------------------------------------------------
export default function (data) {
    const token = data.token;
    if (!token) {
        console.error('No token — skipping iteration');
        errorRate.add(1);
        return;
    }

    // Sinh nonce duy nhất mỗi request (chống replay)
    const nonce = generateNonce();

    const payload = JSON.stringify({
        kid:                    KID,
        device_id:              `device_k6_vu${__VU}_iter${__ITER}`,
        device_public_key_pem:  DEVICE_PUBLIC_KEY_PEM,
        nonce:                  nonce,
        content_id:             CONTENT_ID,
    });

    const params = {
        headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${token}`,
        },
        tags: { endpoint: 'license' },
    };

    // Đo latency POST /api/license
    const t0  = Date.now();
    const res = http.post(`${BASE_URL}/api/license`, payload, params);
    const ms  = Date.now() - t0;

    licenseLatency.add(ms);

    const ok = check(res, {
        'status 200':          (r) => r.status === 200,
        'has encrypted_key':   (r) => {
            try { return JSON.parse(r.body).encrypted_key !== undefined; }
            catch { return false; }
        },
        'has expires_at':      (r) => {
            try { return JSON.parse(r.body).expires_at > 0; }
            catch { return false; }
        },
    });

    if (!ok || res.status !== 200) {
        licenseErrors.add(1);
        errorRate.add(1);
        if (res.status !== 409) {
            // 409 là Nonce conflict bình thường trong test — không log
            console.warn(`[VU${__VU}] License failed ${res.status}: ${res.body.substring(0, 100)}`);
        }
    } else {
        licenseSuccesses.add(1);
        errorRate.add(0);
    }

    // Khoảng cách giữa các request (mô phỏng user think time)
    sleep(Math.random() * 0.5 + 0.1);
}

// ----------------------------------------------------------------
// Teardown: in summary
// ----------------------------------------------------------------
export function teardown(data) {
    console.log('\n[teardown] Benchmark hoàn thành.');
    console.log('Xem chi tiết latency trong k6 output bên trên.');
}

// ----------------------------------------------------------------
// Helper: sinh UUID v4 dùng k6 crypto module
// ----------------------------------------------------------------
function generateNonce() {
    const bytes = crypto.randomBytes(16);
    const arr   = new Uint8Array(bytes);
    arr[6]  = (arr[6]  & 0x0f) | 0x40;
    arr[8]  = (arr[8]  & 0x3f) | 0x80;
    const hex = Array.from(arr).map(b => b.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0,8)}-${hex.slice(8,12)}-${hex.slice(12,16)}-${hex.slice(16,20)}-${hex.slice(20)}`;
}
