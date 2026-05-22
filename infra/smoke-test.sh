#!/usr/bin/env bash
# T3.1: Integration smoke test for Docker-free VM deployment.
# Override targets:
#   LICENSE_BASE_URL=http://10.0.0.12:3000
#   CDN_BASE_URL=https://cdn.example.local
#   SEGMENT_PATH=/video/v_1.m4s
#   ALLOW_INSECURE_TLS=1   # self-signed VM certs

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export LICENSE_BASE_URL="${LICENSE_BASE_URL:-http://127.0.0.1:3000}"
export CDN_BASE_URL="${CDN_BASE_URL:-http://127.0.0.1}"
export SEGMENT_PATH="${SEGMENT_PATH:-/video/seg_001.m4s}"
export TEST_KID="${TEST_KID:-19d57c645156a5a0ddd23849e6377665}"
export CONTENT_ID="${CONTENT_ID:-movie_123}"
export ALLOW_INSECURE_TLS="${ALLOW_INSECURE_TLS:-0}"

echo "Bat dau Integration Smoke Test..."
echo "License: ${LICENSE_BASE_URL}"
echo "CDN:     ${CDN_BASE_URL}"
echo "Segment: ${SEGMENT_PATH}"
echo "------------------------------------------------------------"

if [ -f "${REPO_ROOT}/media-processing/license_keys.json" ]; then
    echo "[PASS] Tim thay media-processing/license_keys.json"
else
    echo "[WARN] Khong thay media-processing/license_keys.json; license API co the tra 404 neu DB chua import key."
fi

node <<'NODE'
const crypto = require('crypto');
const http = require('http');
const https = require('https');

const licenseBase = process.env.LICENSE_BASE_URL.replace(/\/$/, '');
const cdnBase = process.env.CDN_BASE_URL.replace(/\/$/, '');
const segmentPath = process.env.SEGMENT_PATH || '/video/seg_001.m4s';
const allowInsecureTls = process.env.ALLOW_INSECURE_TLS === '1';

function request(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const client = parsed.protocol === 'https:' ? https : http;
    const req = client.request(parsed, {
      method: options.method || 'GET',
      headers: options.headers || {},
      rejectUnauthorized: !allowInsecureTls,
    }, (res) => {
      const chunks = [];
      res.on('data', (chunk) => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks).toString('utf8');
        resolve({ status: res.statusCode, headers: res.headers, body });
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function parseJson(res) {
  try {
    return JSON.parse(res.body);
  } catch {
    return null;
  }
}

async function main() {
  console.log('\n[1] Health checks');
  const licenseHealth = await request(`${licenseBase}/`);
  if (licenseHealth.status !== 200) {
    throw new Error(`License health failed: HTTP ${licenseHealth.status}`);
  }
  console.log('  [PASS] License server health');

  const cdnHealth = await request(`${cdnBase}/healthz`);
  if (cdnHealth.status !== 200) {
    throw new Error(`CDN health failed: HTTP ${cdnHealth.status}`);
  }
  console.log('  [PASS] CDN health');

  console.log('\n[2] Auth + license API');
  const authRes = await request(`${licenseBase}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: 'e2e_tester' }),
  });
  const authJson = parseJson(authRes);
  if (authRes.status !== 200 || !authJson?.token) {
    throw new Error(`Auth failed: HTTP ${authRes.status} ${authRes.body}`);
  }
  console.log('  [PASS] JWT issued');

  const { publicKey, privateKey } = crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  const licenseRes = await request(`${licenseBase}/api/license`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${authJson.token}`,
    },
    body: JSON.stringify({
      kid: process.env.TEST_KID,
      device_id: `device-e2e-${Date.now()}`,
      device_public_key_pem: publicKey,
      nonce: crypto.randomUUID(),
      content_id: process.env.CONTENT_ID,
    }),
  });

  const licenseJson = parseJson(licenseRes);
  if (licenseRes.status === 200 && licenseJson?.encrypted_key) {
    const contentKeyBuf = crypto.privateDecrypt({
      key: privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    }, Buffer.from(licenseJson.encrypted_key, 'base64'));
    console.log(`  [PASS] License issued and decrypted (${contentKeyBuf.length} bytes)`);
  } else if (licenseRes.status === 404 || licenseRes.status === 503) {
    console.log(`  [WARN] License API reachable but key is not ready: HTTP ${licenseRes.status}`);
  } else {
    throw new Error(`License API failed: HTTP ${licenseRes.status} ${licenseRes.body}`);
  }

  console.log('\n[3] CDN Range request');
  const rangeRes = await request(`${cdnBase}${segmentPath}`, {
    method: 'GET',
    headers: { Range: 'bytes=0-1023' },
  });

  if (rangeRes.status === 206) {
    console.log('  [PASS] CDN returns 206 Partial Content for video Range');
  } else if (rangeRes.status === 404) {
    console.log(`  [WARN] Segment not found at ${segmentPath}; publish media before final VM demo.`);
  } else {
    throw new Error(`Range request failed: HTTP ${rangeRes.status}`);
  }
}

main().catch((err) => {
  console.error(`\n[FAIL] ${err.message}`);
  process.exit(1);
});
NODE

echo "------------------------------------------------------------"
echo "Smoke test finished."
