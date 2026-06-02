/**
 * PoC E3 — Widevine L3 Content Key Extraction via Frida
 * NT219 Cryptography Project — Educational / Security Research
 *
 * MỤC ĐÍCH:
 *   Chứng minh rằng Widevine L3 (software CDM) có thể bị khai thác bởi
 *   dynamic instrumentation để trích xuất Content Key ra khỏi bộ nhớ
 *   tiến trình Chrome. Kết quả dùng để phân tích lỗ hổng và đề xuất
 *   biện pháp phòng thủ (Widevine L1 trên TEE, attestation).
 *
 * YÊU CẦU:
 *   - Frida >= 16.x  (pip install frida frida-tools)
 *   - Chrome/Chromium với Widevine L3 (KHÔNG có TEE)
 *   - Hệ điều hành: Linux / Windows (không áp dụng cho Chrome OS / Android L1)
 *   - Quyền attach process (thường cần sudo trên Linux)
 *
 * CHẠY:
 *   frida --no-pause -p $(pgrep -f chrome | head -1) -l frida-widevine-l3.js
 *   # hoặc Windows:
 *   frida --no-pause -p <chrome_pid> -l frida-widevine-l3.js
 *
 * GIỚI HẠN (hạn chế bảo vệ nội dung):
 *   - Chỉ hoạt động với L3 (software CDM) — L1 (TEE/HSM) không bị ảnh hưởng
 *   - Chrome có thể có anti-debugging → cần --disable-features=RendererCodeIntegrity
 *   - Key chỉ có thời hạn theo Time-bound License (exp field trong license NT219)
 *   - Nonce 1 lần nên key không replay được — xem PoC E5 (license-replay.py)
 *
 * TÀI LIỆU THAM KHẢO:
 *   - "Frida-based Widevine L3 Downgrade" (David Buchanan, 2019)
 *   - WHITEPAPER: "Understanding Widevine" — Google DRM Security Levels
 *   - wvdumper / wks-keys projects (GitHub) — similar approach
 */

'use strict';

// -------------------------------------------------------------------------
// Cấu hình target
// -------------------------------------------------------------------------
const TARGET_LIB = {
    linux:   'libwidevinecdm.so',
    windows: 'widevinecdm.dll',
};

const PLATFORM = Process.platform;
const CDM_LIB  = TARGET_LIB[PLATFORM] || TARGET_LIB.linux;

console.log(`[E3] NT219 Widevine L3 Key Extractor`);
console.log(`[E3] Platform: ${PLATFORM}, CDM target: ${CDM_LIB}`);
console.log(`[E3] Scanning process modules...`);

// -------------------------------------------------------------------------
// Bước 1: Tìm module widevinecdm trong process memory
// -------------------------------------------------------------------------
let cdmModule = null;

Process.enumerateModules().forEach(mod => {
    if (mod.name.toLowerCase().includes('widevine') ||
        mod.name.toLowerCase().includes('widevinecdm')) {
        cdmModule = mod;
        console.log(`[E3] Found CDM module: ${mod.name}`);
        console.log(`     Base: ${mod.base}  Size: ${mod.size} bytes`);
    }
});

if (!cdmModule) {
    console.error('[E3] FATAL: Không tìm thấy Widevine CDM module.');
    console.error('           Đảm bảo Chrome đang phát DRM content.');
    Process.terminate();
}

// -------------------------------------------------------------------------
// Bước 2: Hook hàm AES decrypt trong CDM
// Widevine L3 dùng AES-128-CTR để giải mã segment. Key được truyền vào
// hàm decrypt nội bộ của CDM trước khi render.
// Pattern: tìm hàm có signature phù hợp qua symbol export hoặc pattern scan.
// -------------------------------------------------------------------------

// Thử export symbols trước (debug build hoặc stripped symbols)
let decryptFuncAddr = null;

const exports = Module.enumerateExports(cdmModule.name);
const decryptSymbols = exports.filter(e =>
    e.name.toLowerCase().includes('decrypt') ||
    e.name.toLowerCase().includes('cdm') ||
    e.name.toLowerCase().includes('session')
);

if (decryptSymbols.length > 0) {
    console.log(`[E3] Export symbols found (${decryptSymbols.length}):`);
    decryptSymbols.slice(0, 10).forEach(s => {
        console.log(`     ${s.name} @ ${s.address}`);
    });
    // Widevine L3 thường export OEMCrypto_DecryptCENC hoặc oemcrypto_decrypt
    const target = decryptSymbols.find(s =>
        s.name.includes('Decrypt') || s.name.includes('decrypt')
    );
    if (target) decryptFuncAddr = target.address;
} else {
    console.log('[E3] No export symbols — CDM stripped. Using pattern scan...');
}

// -------------------------------------------------------------------------
// Bước 3: Pattern scan nếu không có symbols
// AES-128-CTR setup trong CDM thường có pattern cụ thể trước lệnh AESNI.
// Pattern dưới đây là ví dụ generic — thực tế cần IDA Pro / Ghidra để xác định.
// -------------------------------------------------------------------------
if (!decryptFuncAddr) {
    // Byte pattern ví dụ cho AES key expansion (movdqu + aeskeygenassist)
    // Trong thực tế: pattern cụ thể theo version CDM và platform
    const AES_PATTERN = '66 0F 6F ?? ?? 66 0F 3A DF';

    console.log(`[E3] Scanning for AES key schedule pattern: ${AES_PATTERN}`);

    const scanResult = Memory.scanSync(cdmModule.base, cdmModule.size, AES_PATTERN);
    if (scanResult.length > 0) {
        console.log(`[E3] Pattern found at ${scanResult.length} location(s):`);
        scanResult.forEach((r, i) => console.log(`     [${i}] ${r.address}`));
        // Backtrack để tìm đầu hàm (thường cách 0x10-0x50 bytes)
        decryptFuncAddr = scanResult[0].address.sub(0x20);
    } else {
        console.warn('[E3] Pattern not found — CDM version có thể khác.');
    }
}

// -------------------------------------------------------------------------
// Bước 4: Hook hàm DecryptCENC / Decrypt để capture key khi gọi
// -------------------------------------------------------------------------
if (decryptFuncAddr) {
    console.log(`[E3] Hooking decrypt function @ ${decryptFuncAddr}`);

    Interceptor.attach(decryptFuncAddr, {
        onEnter(args) {
            // Convention phổ biến: arg[0] = context/session, arg[1] = key ptr, arg[2] = key_len
            // Thực tế cần điều chỉnh theo ABI và calling convention của CDM version cụ thể
            try {
                const keyPtr = args[1]; // Con trỏ tới AES key buffer (16 bytes)
                const keyLen = args[2].toInt32();

                if (keyLen === 16 || keyLen === 32) {
                    const keyBytes = keyPtr.readByteArray(keyLen);
                    const keyHex   = Array.from(new Uint8Array(keyBytes))
                        .map(b => b.toString(16).padStart(2, '0'))
                        .join('');

                    console.log(`\n[E3] *** CONTENT KEY CAPTURED ***`);
                    console.log(`     Key length : ${keyLen * 8} bits`);
                    console.log(`     Key (hex)  : ${keyHex}`);
                    console.log(`     Timestamp  : ${new Date().toISOString()}`);
                    console.log(`     Context    : ${args[0]}`);

                    // Gửi về Frida client (frida -l ... --runtime=v8)
                    send({ event: 'key_captured', key_hex: keyHex, key_len: keyLen });
                }
            } catch (e) {
                // Bỏ qua nếu pointer không hợp lệ
            }
        }
    });

    console.log(`[E3] Hook installed. Phát DRM content để bắt key...`);
} else {
    console.error('[E3] Không tìm được địa chỉ hàm decrypt — cần manual analysis.');
    console.error('     Gợi ý: Dùng Ghidra/IDA Pro phân tích CDM rồi nhập địa chỉ thủ công.');
}

// -------------------------------------------------------------------------
// Bước 5: Hook MessageBase::CreateSessionMessage để bắt PSSH / license request
// -------------------------------------------------------------------------
console.log('\n[E3] Hooking CDM session message handler for PSSH...');

const sessionExports = exports.filter(e =>
    e.name.includes('Session') || e.name.includes('Message')
);

if (sessionExports.length > 0) {
    Interceptor.attach(sessionExports[0].address, {
        onEnter(args) {
            try {
                const msgType = args[1].toInt32();
                // msgType 1 = license_request, 2 = license_renewal, 3 = license_release
                if (msgType === 1) {
                    const msgPtr = args[2];
                    const msgLen = args[3].toInt32();
                    if (msgLen > 0 && msgLen < 65536) {
                        const msgBytes = msgPtr.readByteArray(msgLen);
                        const msgB64   = btoa(String.fromCharCode(...new Uint8Array(msgBytes)));
                        console.log(`[E3] License Request (PSSH): ${msgB64.substring(0, 80)}...`);
                        send({ event: 'license_request', pssh_b64: msgB64 });
                    }
                }
            } catch (e) {}
        }
    });
}

console.log('[E3] Frida hooks active. Waiting for DRM events...\n');
