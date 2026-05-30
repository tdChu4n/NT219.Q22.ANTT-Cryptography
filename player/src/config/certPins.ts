/**
 * T3.4: certPins.ts
 * Cert Pinning config cho Player — T3.1
 *
 * Sau khi chạy gen-selfsigned-cert.ps1, copy fingerprint vào đây.
 * Player sẽ verify fingerprint trước khi gửi License Request.
 */

// SHA-256 fingerprint của Public Key cert CDN (base64)
// Cập nhật sau khi chạy: pwsh cdn-sim/gen-selfsigned-cert.ps1
export const PINNED_CERT_FINGERPRINTS: string[] = [
    // Fingerprint cert hiện tại — cập nhật từ output gen-selfsigned-cert.ps1
    'PLACEHOLDER_UPDATE_AFTER_CERT_GENERATION',
    // Backup fingerprint (rotation) — giữ cert cũ trong 30 ngày trước khi xóa
];

export const CDN_BASE_URL    = 'http://192.168.155.11';
export const LICENSE_API_URL = 'http://192.168.155.10:3000/api';

/**
 * Cert pinning config cho Player.
 * mode='off'  — tắt pinning (VM demo dùng HTTP, không có TLS).
 * mode='warn' — log khi pin mismatch nhưng không block.
 * mode='enforce' — block request nếu pin mismatch.
 */
export const CDN_CERT_PIN_CONFIG = {
    mode: 'off' as 'off' | 'warn' | 'enforce',
    pins: [] as string[],
    pinnedOrigins: [] as string[],
};

/**
 * Kiểm tra cert fingerprint của server có khớp với pin đã lưu không.
 * Dùng trong môi trường Native App (React Native, Electron) có access
 * vào TLS certificate. Trên Web Browser, đây là placeholder giáo dục.
 */
export function verifyCertPin(serverFingerprintB64: string): boolean {
    return PINNED_CERT_FINGERPRINTS.includes(serverFingerprintB64);
}
