/**
 * certPinning.ts — Shaka response filter kiểm tra cert pin (T3.4).
 *
 * Trong môi trường VM demo (HTTP), mode='off' → filter luôn trả về 'skipped'.
 * Khi nâng lên HTTPS + self-signed cert, đổi mode='warn'/'enforce' và điền
 * SHA-256 fingerprint vào CDN_CERT_PIN_CONFIG.pins.
 */

export type PinCheckOutcome = 'ok' | 'skipped' | 'missing' | 'mismatch';

export type PinCheckEvent = {
  mode: 'off' | 'warn' | 'enforce';
  outcome: PinCheckOutcome;
  receivedPin?: string;
  origin?: string;
};

type PinConfig = {
  mode: 'off' | 'warn' | 'enforce';
  pins: string[];
  pinnedOrigins?: string[];
};

type ShakaResponse = {
  uri: string;
  headers: Record<string, string>;
  data: ArrayBuffer;
  status?: number;
};

/**
 * Tạo Shaka NetworkingEngine response filter kiểm tra cert pin.
 *
 * Khi mode='off', filter gọi onCheck({outcome:'skipped'}) rồi return ngay.
 * Khi mode='warn'/'enforce', filter kiểm tra header `Public-Key-Pins` hoặc
 * custom `X-Pin-SHA256` so với danh sách pins đã cấu hình.
 */
export function createPinResponseFilter(
  config: PinConfig,
  onCheck: (ev: PinCheckEvent) => void,
) {
  return (_type: unknown, response: ShakaResponse): void => {
    if (config.mode === 'off') {
      onCheck({ mode: 'off', outcome: 'skipped' });
      return;
    }

    let origin = '';
    try {
      origin = new URL(response.uri).origin;
    } catch {
      onCheck({ mode: config.mode, outcome: 'skipped' });
      return;
    }

    // Bỏ qua các URI không thuộc pinnedOrigins (nếu có cấu hình)
    if (
      config.pinnedOrigins &&
      config.pinnedOrigins.length > 0 &&
      !config.pinnedOrigins.some((o) => origin.startsWith(o))
    ) {
      onCheck({ mode: config.mode, outcome: 'skipped', origin });
      return;
    }

    // Đọc pin từ header server trả về (custom header cho demo)
    const receivedPin =
      response.headers['x-pin-sha256'] ??
      response.headers['X-Pin-SHA256'] ??
      undefined;

    if (!receivedPin) {
      onCheck({ mode: config.mode, outcome: 'missing', origin });
      if (config.mode === 'enforce') {
        throw new Error(`[certPin] Missing pin header from ${origin}`);
      }
      return;
    }

    if (config.pins.includes(receivedPin)) {
      onCheck({ mode: config.mode, outcome: 'ok', receivedPin, origin });
    } else {
      onCheck({ mode: config.mode, outcome: 'mismatch', receivedPin, origin });
      if (config.mode === 'enforce') {
        throw new Error(`[certPin] Pin mismatch from ${origin}: ${receivedPin}`);
      }
    }
  };
}
