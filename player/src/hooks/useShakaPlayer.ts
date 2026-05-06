import { useEffect, useRef, useState, useCallback } from 'react';
// Shaka Player exports types qua `declare namespace shaka` (global) nên
// default import chỉ trả về runtime object. Ta cast sang kiểu an toàn
// cho scaffold; các sprint sau nâng cấp typing theo shaka.extern.*
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import shakaImport from 'shaka-player/dist/shaka-player.compiled';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shaka = shakaImport as any;

import type { MockManifest } from '../mocks/manifests';
import {
  createPinResponseFilter,
  type PinCheckEvent,
  type PinCheckOutcome,
} from '../security/certPinning';
import { CDN_CERT_PIN_CONFIG } from '../config/certPins';

// ---------------------------------------------------------------------------
//  Hook tích hợp Shaka Player với React — Task T1.7
//
//  Mục tiêu sprint này:
//    - Player chạy đầy đủ luồng EME: CDM phát challenge → fetch /license →
//      Player nhận license → giải mã trong CDM → render frame.
//    - Demo Chrome: ép Widevine L3 (SW_SECURE_CRYPTO) để mọi máy desktop
//      không có TEE đều phát được nội dung Sintel/Widevine test.
//    - Quan sát license latency & status để chuẩn bị cho T2.4/T2.5
//      (license-server thật + JWT/RSA-OAEP).
//
//  Lifecycle:
//    mount       → install polyfills (once) → tạo shaka.Player instance.
//    load()      → cấu hình DRM (servers + advanced robustness), đăng ký
//                  request/response filter trên NetworkingEngine, gọi
//                  player.load(uri), thu thập drmInfo() của manifest.
//    unmount     → destroy player + gỡ filter để tránh rò memory.
// ---------------------------------------------------------------------------

let polyfillsInstalled = false;
function ensurePolyfills() {
  if (polyfillsInstalled) return;
  shaka.polyfill.installAll();
  if (!shaka.Player.isBrowserSupported()) {
    throw new Error(
      'Trình duyệt không hỗ trợ MSE/EME — Shaka Player không chạy được.',
    );
  }
  polyfillsInstalled = true;
}

export type ShakaStatus = 'idle' | 'loading' | 'ready' | 'error';

export type ShakaTrack = {
  id: number;
  height: number | null;
  bandwidth: number;
  active: boolean;
  label: string;
};

/**
 * Một lượt yêu cầu license đã hoàn tất (thành công hoặc thất bại) — phục vụ
 * panel theo dõi license latency và đo metric cho § 8.3 của README.
 */
export type DrmRequestStat = {
  /** epoch ms khi response được quan sát. */
  ts: number;
  /** URI thực tế đã gọi (sau khi request filter có thể chỉnh sửa). */
  uri: string;
  /** OK nếu CDM nhận license; error nếu fail. */
  status: 'ok' | 'error';
  /** Network round-trip (ms) lấy từ Shaka response.timeMs. */
  timeMs: number;
  /** Kích thước challenge (license request body) gửi đi. */
  requestBytes: number;
  /** Kích thước license response (CDM payload) nhận về. */
  responseBytes: number;
  /** Thông điệp lỗi nếu có (Shaka error string). */
  errorMessage?: string;
};

/**
 * Tóm tắt pipeline EME khi player đã load xong manifest.
 * - keySystem / licenseServer: do CDM + manifest negotiate.
 * - videoRobustness/audioRobustness: Widevine L3 = SW_SECURE_CRYPTO,
 *   L1 = HW_SECURE_*; ta ép L3 trong demo desktop.
 */
export type DrmInfo = {
  keySystem: string | null;
  licenseServer: string | null;
  videoRobustness: string | null;
  audioRobustness: string | null;
  /** KID (default_KID) đọc từ manifest CENC, hex 32 ký tự. */
  keyIds: string[];
  /** Tổng số license request đã quan sát qua NetworkingEngine. */
  licenseRequests: number;
  /** Stat của request gần nhất. */
  lastLicense: DrmRequestStat | null;
  /** Lịch sử ngắn (giới hạn 8) — phục vụ panel & debug. */
  history: DrmRequestStat[];
};

const EMPTY_DRM_INFO: DrmInfo = {
  keySystem: null,
  licenseServer: null,
  videoRobustness: null,
  audioRobustness: null,
  keyIds: [],
  licenseRequests: 0,
  lastLicense: null,
  history: [],
};

/**
 * Tóm tắt trạng thái cert pinning trên các response có origin nằm trong
 * `pinnedOrigins` (xem config/certPins.ts).
 */
export type PinStatus = {
  mode: 'off' | 'warn' | 'enforce';
  /** Outcome gần nhất của một pin check (sau khi đã skip relative URI). */
  lastOutcome: PinCheckOutcome | null;
  /** Pin SHA-256 base64 quan sát thấy lần gần nhất. */
  lastReceivedPin: string | null;
  /** Origin của response gần nhất bị pin check. */
  lastOrigin: string | null;
  /** Bộ đếm theo outcome (ok/missing/mismatch/skipped). */
  counts: Record<PinCheckOutcome, number>;
  /** Lịch sử ngắn (8 sự kiện). */
  history: PinCheckEvent[];
};

const EMPTY_PIN_STATUS: PinStatus = {
  mode: CDN_CERT_PIN_CONFIG.mode,
  lastOutcome: null,
  lastReceivedPin: null,
  lastOrigin: null,
  counts: { ok: 0, skipped: 0, missing: 0, mismatch: 0 },
  history: [],
};

export type LoadOptions = {
  /**
   * Khi bật, override toàn bộ license server của manifest về `/license`
   * (Vite proxy → cdn-sim → license-server). Hữu ích để xác minh wiring
   * trước khi T2.4/T2.5 hoàn thành.
   */
  overrideToInternalLicense?: boolean;
};

export type UseShakaPlayerReturn = {
  status: ShakaStatus;
  error: string | null;
  tracks: ShakaTrack[];
  drmInfo: DrmInfo;
  pinStatus: PinStatus;
  load: (manifest: MockManifest, opts?: LoadOptions) => Promise<void>;
  unload: () => Promise<void>;
  selectTrack: (trackId: number) => void;
  enableAbr: (enabled: boolean) => void;
  abrEnabled: boolean;
};

type ShakaVariantTrack = {
  id: number;
  height?: number | null;
  bandwidth: number;
  active: boolean;
};

type ShakaError = {
  category?: number;
  code?: number;
  severity?: number;
  data?: unknown[];
  message?: string;
};

/**
 * Đường dẫn nội bộ tới license-server (qua cdn-sim). Vite dev đã proxy
 * `/license` → http://localhost:8080 (xem vite.config.ts), production
 * sẽ phục vụ cùng origin với CDN nên giữ relative path.
 */
const INTERNAL_LICENSE_URL = '/license';

export function useShakaPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
): UseShakaPlayerReturn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const [status, setStatus] = useState<ShakaStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<ShakaTrack[]>([]);
  const [abrEnabled, setAbrEnabled] = useState(true);
  const [drmInfo, setDrmInfo] = useState<DrmInfo>(EMPTY_DRM_INFO);
  const [pinStatus, setPinStatus] = useState<PinStatus>(EMPTY_PIN_STATUS);

  // Bộ đếm bytes của request gần nhất (đo trong request filter, đọc lại
  // trong response filter). Dùng Map<uri, bytes> để hỗ trợ song song
  // (audio + video license trong cùng một phim).
  const pendingRequestBytesRef = useRef<Map<string, number>>(new Map());

  // ---- mount / unmount ---------------------------------------------------
  useEffect(() => {
    if (!videoRef.current) return;
    try {
      ensurePolyfills();
    } catch (e) {
      setError((e as Error).message);
      setStatus('error');
      return;
    }

    const player = new shaka.Player();
    playerRef.current = player;

    player.attach(videoRef.current).catch((err: Error) => {
      setError(`Attach failed: ${err.message}`);
      setStatus('error');
    });

    const onPlaying = () => {
      setError(null);
      setStatus('ready');
    };
    videoRef.current.addEventListener('playing', onPlaying);

    const onError = (event: Event) => {
      const detail =
        (event as unknown as { detail: ShakaError }).detail ?? {};
      const message = `[Shaka ${detail.category ?? '?'}/${detail.code ?? '?'}] ${
        detail.data ? detail.data.join(' ') : detail.message ?? 'unknown error'
      }`;

      const criticalSeverity = shaka?.util?.Error?.Severity?.CRITICAL ?? 2;
      const isCritical =
        detail.severity == null ? true : detail.severity === criticalSeverity;

      if (isCritical) {
        setError(message);
        setStatus('error');
        return;
      }

      console.warn(`Recoverable playback warning: ${message}`);
    };
    player.addEventListener('error', onError);

    const refreshTracks = () => {
      const variants: ShakaVariantTrack[] = player.getVariantTracks();
      setTracks(
        variants.map((v) => ({
          id: v.id,
          height: v.height ?? null,
          bandwidth: v.bandwidth,
          active: v.active,
          label:
            v.height != null
              ? `${v.height}p · ${(v.bandwidth / 1000).toFixed(0)} kbps`
              : `${(v.bandwidth / 1000).toFixed(0)} kbps`,
        })),
      );
    };
    player.addEventListener('trackschanged', refreshTracks);
    player.addEventListener('adaptation', refreshTracks);

    // ---- License request / response filters ------------------------------
    // Đăng ký một lần khi mount; lifecycle gắn với player instance.
    // RequestType.LICENSE = 2 trong Shaka v4. Đọc enum để code rõ ý đồ.
    const RequestType = shaka.net.NetworkingEngine.RequestType;
    const networkingEngine = player.getNetworkingEngine();

    const onLicenseRequest = (
      type: number,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      request: any,
    ) => {
      if (type !== RequestType.LICENSE) return;

      // Headers phục vụ debug + chuẩn bị wire JWT khi T2.4/T2.5 sẵn sàng.
      // Lưu ý: license-server ở task T2.4 sẽ verify Authorization Bearer.
      request.headers = request.headers ?? {};
      request.headers['X-Player-Build'] = 'NT219-T1.7';

      // TODO[T2.4]: gắn JWT entitlement
      //   request.headers['Authorization'] = `Bearer ${getEntitlementToken()}`;
      // TODO[T2.5]: gửi device public key cho RSA-OAEP key wrap
      //   request.headers['X-Device-Pubkey'] = base64(devicePubKey);

      const uri = request.uris?.[0] ?? '<unknown>';
      const bodyBytes =
        request.body instanceof ArrayBuffer
          ? request.body.byteLength
          : request.body?.byteLength ?? 0;
      pendingRequestBytesRef.current.set(uri, bodyBytes);
    };

    const onLicenseResponse = (
      type: number,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      response: any,
    ) => {
      if (type !== RequestType.LICENSE) return;
      const uri = response.uri ?? response.originalUri ?? '<unknown>';
      const requestBytes = pendingRequestBytesRef.current.get(uri) ?? 0;
      pendingRequestBytesRef.current.delete(uri);

      const stat: DrmRequestStat = {
        ts: Date.now(),
        uri,
        status: 'ok',
        timeMs: response.timeMs ?? 0,
        requestBytes,
        responseBytes: response.data?.byteLength ?? 0,
      };
      setDrmInfo((prev) => ({
        ...prev,
        licenseRequests: prev.licenseRequests + 1,
        lastLicense: stat,
        history: [stat, ...prev.history].slice(0, 8),
      }));
    };

    networkingEngine.registerRequestFilter(onLicenseRequest);
    networkingEngine.registerResponseFilter(onLicenseResponse);

    // ---- Cert pinning response filter ----
    // Chạy cho MỌI loại request (manifest, segment, license) — bao quát
    // toàn bộ traffic tới cdn-sim. Khi mode=enforce + pin mismatch,
    // filter throw → Shaka coi là network error → manifest/segment fail.
    const pinFilter = createPinResponseFilter(
      CDN_CERT_PIN_CONFIG,
      (ev) => {
        setPinStatus((prev) => ({
          ...prev,
          mode: ev.mode,
          lastOutcome: ev.outcome,
          lastReceivedPin: ev.receivedPin ?? prev.lastReceivedPin,
          lastOrigin: ev.origin || prev.lastOrigin,
          counts: {
            ...prev.counts,
            [ev.outcome]: prev.counts[ev.outcome] + 1,
          },
          // Chỉ giữ history các sự kiện không phải skipped (giảm noise)
          // — skipped vẫn cộng vào counts để dev biết tỉ lệ origin
          // KHÔNG nằm trong pin list.
          history:
            ev.outcome === 'skipped'
              ? prev.history
              : [ev, ...prev.history].slice(0, 8),
        }));
      },
    );
    networkingEngine.registerResponseFilter(pinFilter);

    return () => {
      try {
        networkingEngine.unregisterRequestFilter(onLicenseRequest);
        networkingEngine.unregisterResponseFilter(onLicenseResponse);
        networkingEngine.unregisterResponseFilter(pinFilter);
      } catch {
        // NetworkingEngine có thể đã bị destroy cùng player — bỏ qua.
      }
      player.removeEventListener('error', onError);
      player.removeEventListener('trackschanged', refreshTracks);
      player.removeEventListener('adaptation', refreshTracks);
      videoRef.current?.removeEventListener('playing', onPlaying);
      player.destroy();
      playerRef.current = null;
    };
  }, [videoRef]);

  // ---- load --------------------------------------------------------------
  const load = useCallback(
    async (manifest: MockManifest, opts: LoadOptions = {}) => {
      const player = playerRef.current;
      if (!player) return;

      setStatus('loading');
      setError(null);
      setTracks([]);
      setDrmInfo({
        ...EMPTY_DRM_INFO,
        keyIds: manifest.keyId ? [manifest.keyId] : [],
      });
      setPinStatus({ ...EMPTY_PIN_STATUS });

      // ---- DRM config -----------------------------------------------------
      // - servers[keySystem]: license endpoint chính.
      // - advanced[keySystem]: ép Widevine L3 (SW_SECURE_CRYPTO) cho demo
      //   Chrome desktop. Khi máy có TEE, có thể nâng lên HW_SECURE_*.
      // - preferredKeySystems: ưu tiên Widevine trên Chrome/Edge, FairPlay
      //   sẽ được handle ở task riêng (E8).
      const targetLicenseServer = opts.overrideToInternalLicense
        ? INTERNAL_LICENSE_URL
        : manifest.drm?.licenseServer ?? '';
      const keySystem = manifest.drm?.keySystem ?? '';

      if (keySystem && targetLicenseServer) {
        player.configure({
          drm: {
            servers: { [keySystem]: targetLicenseServer },
            advanced: {
              'com.widevine.alpha': {
                // Widevine L3 = phần mềm. Ép giá trị này để CDM không leo
                // lên L1 trên thiết bị có TEE (giữ kết quả demo nhất quán
                // và tương thích với cwip-shaka-proxy test KIDs).
                videoRobustness: 'SW_SECURE_CRYPTO',
                audioRobustness: 'SW_SECURE_CRYPTO',
                persistentStateRequired: false,
                distinctiveIdentifierRequired: false,
                sessionType: 'temporary',
              },
              'com.microsoft.playready': {
                videoRobustness: 'SW_SECURE_DECODE',
                audioRobustness: 'SW_SECURE_DECODE',
              },
            },
            preferredKeySystems: [
              'com.widevine.alpha',
              'com.microsoft.playready',
            ],
            // Bắt buộc license server response không được cache (defense
            // in depth — Nginx đã set no-store, đây là layer thứ 2).
            retryParameters: {
              maxAttempts: 3,
              baseDelay: 500,
              backoffFactor: 2,
              fuzzFactor: 0.3,
              timeout: 10_000,
            },
          },
        });
      } else {
        player.configure({ drm: { servers: {}, advanced: {} } });
      }

      player.configure({ abr: { enabled: true } });
      setAbrEnabled(true);

      try {
        await player.load(manifest.uri);
        setStatus('ready');

        // Sau khi load xong: đọc drmInfo() do Shaka tự suy luận từ
        // ContentProtection trong manifest + CDM đã chọn.
        const info = player.drmInfo?.();
        if (info) {
          setDrmInfo((prev) => ({
            ...prev,
            keySystem: info.keySystem ?? keySystem ?? null,
            licenseServer:
              info.licenseServerUri ?? targetLicenseServer ?? null,
            videoRobustness: info.videoRobustness ?? null,
            audioRobustness: info.audioRobustness ?? null,
            keyIds:
              Array.isArray(info.keyIds) && info.keyIds.length > 0
                ? info.keyIds
                : prev.keyIds,
          }));
        } else if (keySystem) {
          setDrmInfo((prev) => ({
            ...prev,
            keySystem,
            licenseServer: targetLicenseServer || null,
          }));
        }
      } catch (err) {
        const e = err as ShakaError;
        const msg = `Load fail [${e.category ?? '?'}/${e.code ?? '?'}]: ${
          e.data ? e.data.join(' ') : e.message ?? 'unknown error'
        }`;
        setError(msg);
        setStatus('error');

        // Ghi nhận license error (nếu Shaka phân loại là DRM category=6).
        if (e.category === 6) {
          const stat: DrmRequestStat = {
            ts: Date.now(),
            uri: targetLicenseServer || '<unknown>',
            status: 'error',
            timeMs: 0,
            requestBytes: 0,
            responseBytes: 0,
            errorMessage: msg,
          };
          setDrmInfo((prev) => ({
            ...prev,
            lastLicense: stat,
            history: [stat, ...prev.history].slice(0, 8),
          }));
        }
      }
    },
    [],
  );

  const unload = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.unload();
    setStatus('idle');
    setTracks([]);
    setDrmInfo(EMPTY_DRM_INFO);
    setPinStatus(EMPTY_PIN_STATUS);
  }, []);

  const selectTrack = useCallback((trackId: number) => {
    const player = playerRef.current;
    if (!player) return;
    const track = player
      .getVariantTracks()
      .find((t: ShakaVariantTrack) => t.id === trackId);
    if (!track) return;
    player.configure({ abr: { enabled: false } });
    setAbrEnabled(false);
    player.selectVariantTrack(track, /* clearBuffer */ true);
  }, []);

  const enableAbr = useCallback((enabled: boolean) => {
    const player = playerRef.current;
    if (!player) return;
    player.configure({ abr: { enabled } });
    setAbrEnabled(enabled);
  }, []);

  return {
    status,
    error,
    tracks,
    drmInfo,
    pinStatus,
    load,
    unload,
    selectTrack,
    enableAbr,
    abrEnabled,
  };
}
