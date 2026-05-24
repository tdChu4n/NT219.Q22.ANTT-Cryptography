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
 * Snapshot trạng thái phát hiện tại — phục vụ custom controls (T1.7 polish).
 * Cập nhật theo `timeupdate / volumechange / ratechange / seeking / seeked`
 * và một interval 1 s đọc `player.getStats()`.
 */
export type PlaybackState = {
  paused: boolean;
  ended: boolean;
  seeking: boolean;
  buffering: boolean;
  currentTime: number;
  duration: number;
  /** Số giây đã buffer ahead so với currentTime (buffer health). */
  bufferAhead: number;
  /** Vùng đã play hoặc buffer (mảng [start, end]) — dùng vẽ seek bar nâng cao. */
  bufferedRanges: Array<{ start: number; end: number }>;
  volume: number;
  muted: boolean;
  playbackRate: number;
  /** Bandwidth ABR estimate (bytes/giây) từ player.getStats(). */
  estimatedBandwidth: number;
  /** Bitrate variant đang phát (bps). */
  activeBitrate: number;
  decodedFrames: number;
  droppedFrames: number;
};

const EMPTY_PLAYBACK: PlaybackState = {
  paused: true,
  ended: false,
  seeking: false,
  buffering: false,
  currentTime: 0,
  duration: 0,
  bufferAhead: 0,
  bufferedRanges: [],
  volume: 1,
  muted: false,
  playbackRate: 1,
  estimatedBandwidth: 0,
  activeBitrate: 0,
  decodedFrames: 0,
  droppedFrames: 0,
};

export type LogLevel = 'info' | 'warn' | 'error';

/**
 * Sự kiện ghi nhận trong log panel — categorized để filter & màu hoá.
 */
export type LogEntry = {
  id: number;
  ts: number;
  level: LogLevel;
  /** Phân loại: manifest | adaptation | license | pin | playback | seek | error | system */
  kind: string;
  message: string;
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

export type TtffSample = {
  ts: number;
  manifestId: string;
  manifestTitle: string;
  scheme: MockManifest['scheme'];
  drm: boolean;
  timeMs: number;
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
   * (Vite proxy → License Server). Hữu ích để xác minh wiring.
   */
  overrideToInternalLicense?: boolean;
  /**
   * content_id gửi kèm trong license request body. Nếu không truyền,
   * dùng manifest.contentId, fallback về 'movie_123'.
   */
  contentId?: string;
};

export type UseShakaPlayerReturn = {
  status: ShakaStatus;
  error: string | null;
  tracks: ShakaTrack[];
  drmInfo: DrmInfo;
  pinStatus: PinStatus;
  playback: PlaybackState;
  logs: LogEntry[];
  lastTtff: TtffSample | null;
  ttffHistory: TtffSample[];
  load: (manifest: MockManifest, opts?: LoadOptions) => Promise<void>;
  unload: () => Promise<void>;
  selectTrack: (trackId: number) => void;
  enableAbr: (enabled: boolean) => void;
  abrEnabled: boolean;
  // Playback controls
  play: () => void;
  pause: () => void;
  togglePlay: () => void;
  seekTo: (timeSec: number) => void;
  seekBy: (deltaSec: number) => void;
  setVolume: (vol: number) => void;
  toggleMute: () => void;
  setPlaybackRate: (rate: number) => void;
  requestFullscreen: () => void;
  clearLogs: () => void;
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
  // Khởi đầu = 'loading' (đang attach video element). Chỉ chuyển sang 'idle'
  // SAU khi `player.attach()` resolve — nếu set 'idle' từ render đầu, App.tsx
  // sẽ chạy auto-load TRƯỚC khi player attach xong → Shaka throw 7/7002
  // (NO_VIDEO_ELEMENT) → cascade 6/6001 (FAILED_TO_ATTACH_TO_VIDEO).
  const [status, setStatus] = useState<ShakaStatus>('loading');
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<ShakaTrack[]>([]);
  const [abrEnabled, setAbrEnabled] = useState(true);
  const [drmInfo, setDrmInfo] = useState<DrmInfo>(EMPTY_DRM_INFO);
  const [pinStatus, setPinStatus] = useState<PinStatus>(EMPTY_PIN_STATUS);
  const [playback, setPlayback] = useState<PlaybackState>(EMPTY_PLAYBACK);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [lastTtff, setLastTtff] = useState<TtffSample | null>(null);
  const [ttffHistory, setTtffHistory] = useState<TtffSample[]>([]);

  // Bộ đếm bytes của request gần nhất (đo trong request filter, đọc lại
  // trong response filter). Dùng Map<uri, bytes> để hỗ trợ song song
  // (audio + video license trong cùng một phim).
  const pendingRequestBytesRef = useRef<Map<string, number>>(new Map());
  const pendingTtffRef = useRef<{
    startedAt: number;
    sample: Omit<TtffSample, 'timeMs' | 'ts'>;
  } | null>(null);

  // ---- Auth / device key state (persists across loads) -------------------
  // JWT cache — tránh fetch /api/auth/login lại khi token còn hiệu lực.
  const jwtCacheRef = useRef<{ token: string; expiresAt: number } | null>(null);
  // Device RSA-2048 OAEP key pair — lưu localStorage, load lại giữa sessions.
  const deviceKeyRef = useRef<{
    publicKeyPem: string;
    privateKey: CryptoKey;
    deviceId: string;
  } | null>(null);
  // Ánh xạ license-uri → device private key đang chờ decrypt response.
  const pendingDecryptKeyRef = useRef<Map<string, CryptoKey>>(new Map());
  // content_id hiện tại (set khi load(), dùng trong license request filter).
  const currentContentIdRef = useRef<string>('movie_123');

  // Counter monotonic cho LogEntry.id (tránh trùng key React khi spam log).
  const logIdRef = useRef(0);
  /**
   * Push một log entry mới (giữ tối đa 200 entry, latest-first).
   * Dùng ref-stable callback để các event handler bên ngoài hook (vd: pin
   * filter) gọi được mà không cần re-create.
   */
  const pushLog = useCallback(
    (level: LogLevel, kind: string, message: string) => {
      logIdRef.current += 1;
      const entry: LogEntry = {
        id: logIdRef.current,
        ts: Date.now(),
        level,
        kind,
        message,
      };
      setLogs((prev) => [entry, ...prev].slice(0, 200));
    },
    [],
  );

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

    // Probe key-system support trước (async, song song với attach). Nếu
    // browser không có Widevine CDM (vd: Chromium build mở, Firefox, hoặc
    // Chrome bị tắt Protected Content) → log để demo biết mà bật, tránh
    // hiểu nhầm là code lỗi. Shaka.Player.probeSupport() trả về object
    // dạng { drm: { 'com.widevine.alpha': {...} }, manifest: {...} }.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    shaka.Player.probeSupport?.().then?.((support: any) => {
      const drmSupport = support?.drm ?? {};
      const widevine = drmSupport['com.widevine.alpha'];
      const playready = drmSupport['com.microsoft.playready'];
      pushLog(
        widevine ? 'info' : 'warn',
        'player',
        widevine
          ? `CDM khả dụng: Widevine ✓ (persistentState=${
              widevine.persistentState ?? 'unknown'
            })`
          : 'Widevine CDM KHÔNG khả dụng — bật trong Chrome: Settings → Privacy → Site Settings → Additional content settings → Protected content. Firefox/Chromium open-source không kèm Widevine.',
      );
      if (playready) {
        pushLog('info', 'player', 'CDM khả dụng: PlayReady ✓');
      }
    });

    // Attach là async. Chỉ chuyển status='idle' (=ready để load) sau khi
    // attach xong, đảm bảo App.tsx auto-load không race với việc gắn video.
    player
      .attach(videoRef.current)
      .then(() => {
        setStatus('idle');
        pushLog('info', 'player', 'Player attached to <video> — sẵn sàng load.');
      })
      .catch((err: Error) => {
        setError(`Attach failed: ${err.message}`);
        setStatus('error');
        pushLog('error', 'player', `Attach failed: ${err.message}`);
      });

    const onPlaying = () => {
      setError(null);
      setStatus('ready');
    };
    const finalizeTtff = () => {
      if (!pendingTtffRef.current) return;
      const { startedAt, sample } = pendingTtffRef.current;
      const row: TtffSample = {
        ...sample,
        timeMs: Math.max(0, Math.round(performance.now() - startedAt)),
        ts: Date.now(),
      };
      pendingTtffRef.current = null;
      setLastTtff(row);
      setTtffHistory((prev) => [row, ...prev].slice(0, 40));
      pushLog(
        'info',
        'playback',
        `TTFF ${row.drm ? 'DRM' : 'CLEAR'} · ${row.timeMs}ms · ${row.manifestTitle}`,
      );
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
        pushLog('error', 'error', message);
        return;
      }

      console.warn(`Recoverable playback warning: ${message}`);
      pushLog('warn', 'error', message);
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
    // Shaka v4 awaits filters nếu chúng trả về Promise — dùng async để
    // thực hiện WebCrypto + fetch JWT mà không block UI thread.
    const RequestType = shaka.net.NetworkingEngine.RequestType;
    const networkingEngine = player.getNetworkingEngine();

    // Helper: kiểm tra URI có phải endpoint nội bộ (License Server VM).
    function isInternalUri(uri: string): boolean {
      return (
        uri.startsWith('/') ||
        uri.startsWith(window.location.origin) ||
        /\b(localhost|cdn\.local|cdn-sim|license-server|192\.168\.155)\b/.test(uri)
      );
    }

    // Helper: Lấy JWT từ cache hoặc fetch mới từ /api/auth/login.
    async function getOrFetchJWT(): Promise<string> {
      const now = Date.now() / 1000;
      if (jwtCacheRef.current && jwtCacheRef.current.expiresAt > now + 60) {
        return jwtCacheRef.current.token;
      }
      const resp = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'demo_user' }),
      });
      if (!resp.ok) throw new Error(`Login failed: HTTP ${resp.status}`);
      const data = (await resp.json()) as { token: string };
      const [, payloadB64] = data.token.split('.');
      const payload = JSON.parse(
        atob(payloadB64.replace(/-/g, '+').replace(/_/g, '/')),
      ) as { exp: number };
      jwtCacheRef.current = { token: data.token, expiresAt: payload.exp };
      pushLog(
        'info',
        'license',
        `[Auth] JWT acquired · exp ${new Date(payload.exp * 1000).toLocaleTimeString()}`,
      );
      return data.token;
    }

    // Helper: Lấy hoặc sinh RSA-2048 OAEP device key pair (persist localStorage).
    async function getOrGenerateDeviceKey(): Promise<{
      publicKeyPem: string;
      privateKey: CryptoKey;
      deviceId: string;
    }> {
      if (deviceKeyRef.current) return deviceKeyRef.current;

      const stored = localStorage.getItem('nt219_device_key');
      if (stored) {
        try {
          const { publicKeyPem, privateKeyJwk, deviceId } = JSON.parse(stored) as {
            publicKeyPem: string;
            privateKeyJwk: JsonWebKey;
            deviceId: string;
          };
          const privateKey = await crypto.subtle.importKey(
            'jwk',
            privateKeyJwk,
            { name: 'RSA-OAEP', hash: 'SHA-256' },
            false,
            ['decrypt'],
          );
          deviceKeyRef.current = { publicKeyPem, privateKey, deviceId };
          pushLog(
            'info',
            'license',
            `[Device] RSA key loaded · device=${deviceId.slice(0, 8)}…`,
          );
          return deviceKeyRef.current;
        } catch {
          /* key bị hỏng — generate lại */
        }
      }

      pushLog('info', 'license', '[Device] Generating RSA-2048 OAEP key pair…');
      const kp = await crypto.subtle.generateKey(
        {
          name: 'RSA-OAEP',
          modulusLength: 2048,
          publicExponent: new Uint8Array([1, 0, 1]),
          hash: 'SHA-256',
        },
        true,
        ['encrypt', 'decrypt'],
      );
      const pubDer = await crypto.subtle.exportKey('spki', kp.publicKey);
      const pubB64 = btoa(String.fromCharCode(...new Uint8Array(pubDer)));
      const publicKeyPem = `-----BEGIN PUBLIC KEY-----\n${pubB64.match(/.{1,64}/g)!.join('\n')}\n-----END PUBLIC KEY-----`;
      const privateKeyJwk = await crypto.subtle.exportKey('jwk', kp.privateKey);
      const deviceId = crypto.randomUUID();
      localStorage.setItem(
        'nt219_device_key',
        JSON.stringify({ publicKeyPem, privateKeyJwk, deviceId }),
      );
      deviceKeyRef.current = { publicKeyPem, privateKey: kp.privateKey, deviceId };
      pushLog(
        'info',
        'license',
        `[Device] RSA-2048 generated · device=${deviceId.slice(0, 8)}…`,
      );
      return deviceKeyRef.current;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLicenseRequest = async (type: number, request: any): Promise<void> => {
      if (type !== RequestType.LICENSE) return;

      const uri = request.uris?.[0] ?? '';
      const bodyBytes =
        request.body instanceof ArrayBuffer
          ? request.body.byteLength
          : (request.body as Uint8Array | null)?.byteLength ?? 0;

      if (!isInternalUri(uri)) {
        // Public proxy (vd: cwip-shaka-proxy) — không thêm custom header
        // tránh CORS preflight fail.
        pendingRequestBytesRef.current.set(uri || '<unknown>', bodyBytes);
        return;
      }

      // Kiểm tra body có phải ClearKey JSON {"kids": [...]} không.
      let isClearKey = false;
      let clearKeyKids: string[] = [];
      if (request.body) {
        try {
          const txt = new TextDecoder().decode(request.body as ArrayBuffer);
          const parsed = JSON.parse(txt) as { kids?: string[] };
          if (Array.isArray(parsed.kids)) {
            isClearKey = true;
            clearKeyKids = parsed.kids;
          }
        } catch {
          /* Widevine binary challenge — không phải JSON */
        }
      }

      if (isClearKey) {
        // ClearKey flow: JWT + device RSA-OAEP → custom JSON body.
        try {
          const [device, jwt] = await Promise.all([
            getOrGenerateDeviceKey(),
            getOrFetchJWT(),
          ]);

          // base64url KID → hex (16 bytes = 32 hex chars)
          let kidHex = '36ff7e0cd396186 5b0f71b7ac775cf76'.replace(/\s/g, '');
          if (clearKeyKids.length > 0) {
            const b64url = clearKeyKids[0];
            const pad = b64url.length % 4 === 0 ? '' : '='.repeat(4 - (b64url.length % 4));
            const b64 = (b64url + pad).replace(/-/g, '+').replace(/_/g, '/');
            const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
            kidHex = Array.from(bytes)
              .map((b) => b.toString(16).padStart(2, '0'))
              .join('');
          }

          const nonce = crypto.randomUUID();
          const customBody = JSON.stringify({
            kid: kidHex,
            device_id: device.deviceId,
            device_public_key_pem: device.publicKeyPem,
            nonce,
            content_id: currentContentIdRef.current,
          });
          const encoded = new TextEncoder().encode(customBody);

          request.headers = {
            ...(request.headers ?? {}),
            Authorization: `Bearer ${jwt}`,
            'Content-Type': 'application/json',
            'X-Player-Build': 'NT219-T1.7',
          };
          request.body = encoded.buffer;

          pendingDecryptKeyRef.current.set(uri || '<unknown>', device.privateKey);
          pendingRequestBytesRef.current.set(uri || '<unknown>', encoded.byteLength);
          pushLog(
            'info',
            'license',
            `[ClearKey→Custom] KID ${kidHex.slice(0, 8)}… · content=${currentContentIdRef.current}`,
          );
        } catch (err) {
          pushLog('error', 'license', `[DRM] Request filter: ${(err as Error).message}`);
          throw err;
        }
      } else {
        // Non-ClearKey (Widevine binary) — gắn JWT header nếu có.
        request.headers = {
          ...(request.headers ?? {}),
          'X-Player-Build': 'NT219-T1.7',
          ...(jwtCacheRef.current
            ? { Authorization: `Bearer ${jwtCacheRef.current.token}` }
            : {}),
        };
        pendingRequestBytesRef.current.set(uri || '<unknown>', bodyBytes);
      }
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const onLicenseResponse = async (type: number, response: any): Promise<void> => {
      if (type !== RequestType.LICENSE) return;
      const uri = response.uri ?? response.originalUri ?? '<unknown>';
      const privateKey = pendingDecryptKeyRef.current.get(uri);
      const requestBytes = pendingRequestBytesRef.current.get(uri) ?? 0;
      pendingRequestBytesRef.current.delete(uri);

      if (!privateKey) {
        // Public proxy hoặc Widevine binary — ghi stat bình thường.
        const stat: DrmRequestStat = {
          ts: Date.now(),
          uri,
          status: 'ok',
          timeMs: response.timeMs ?? 0,
          requestBytes,
          responseBytes: (response.data as ArrayBuffer | null)?.byteLength ?? 0,
        };
        setDrmInfo((prev) => ({
          ...prev,
          licenseRequests: prev.licenseRequests + 1,
          lastLicense: stat,
          history: [stat, ...prev.history].slice(0, 8),
        }));
        pushLog(
          'info',
          'license',
          `License OK · ${stat.timeMs.toFixed(0)}ms · ${stat.responseBytes}B`,
        );
        return;
      }

      // Custom license server response: RSA-OAEP decrypt → ClearKey response.
      pendingDecryptKeyRef.current.delete(uri);
      try {
        const jsonText = new TextDecoder().decode(response.data as ArrayBuffer);
        const lic = JSON.parse(jsonText) as {
          kid: string;
          encrypted_key: string;
          issued_at: number;
          expires_at: number;
          error?: string;
        };
        if (lic.error) throw new Error(lic.error);

        const encBytes = Uint8Array.from(atob(lic.encrypted_key), (c) =>
          c.charCodeAt(0),
        );
        const contentKeyBuf = await crypto.subtle.decrypt(
          { name: 'RSA-OAEP' },
          privateKey,
          encBytes.buffer,
        );

        // kidHex → base64url (no padding)
        const kidBytes = new Uint8Array(
          lic.kid.match(/.{2}/g)!.map((b) => parseInt(b, 16)),
        );
        const kidB64url = btoa(String.fromCharCode(...kidBytes))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');

        // content key → base64url (no padding)
        const keyB64url = btoa(String.fromCharCode(...new Uint8Array(contentKeyBuf)))
          .replace(/\+/g, '-')
          .replace(/\//g, '_')
          .replace(/=/g, '');

        const clearKeyResp = JSON.stringify({
          keys: [{ kty: 'oct', k: keyB64url, kid: kidB64url }],
          type: 'temporary',
        });
        const newData = new TextEncoder().encode(clearKeyResp);
        response.data = newData.buffer;

        const stat: DrmRequestStat = {
          ts: Date.now(),
          uri,
          status: 'ok',
          timeMs: response.timeMs ?? 0,
          requestBytes,
          responseBytes: newData.byteLength,
        };
        setDrmInfo((prev) => ({
          ...prev,
          licenseRequests: prev.licenseRequests + 1,
          lastLicense: stat,
          history: [stat, ...prev.history].slice(0, 8),
        }));
        pushLog(
          'info',
          'license',
          `[ClearKey] RSA-OAEP→key OK · ${stat.timeMs}ms · exp ${new Date(lic.expires_at * 1000).toLocaleTimeString()}`,
        );
      } catch (err) {
        pushLog('error', 'license', `[ClearKey] Response: ${(err as Error).message}`);
        throw err;
      }
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
          history:
            ev.outcome === 'skipped'
              ? prev.history
              : [ev, ...prev.history].slice(0, 8),
        }));
        if (ev.outcome === 'mismatch') {
          pushLog(
            'error',
            'pin',
            `Cert pin MISMATCH @ ${ev.origin} · received ${ev.receivedPin?.slice(0, 24) ?? '?'}…`,
          );
        } else if (ev.outcome === 'missing') {
          pushLog('warn', 'pin', `Cert pin missing @ ${ev.origin}`);
        }
        // outcome 'ok' & 'skipped' không log để tránh spam — đã hiển thị
        // trên LicensePanel counter.
      },
    );
    networkingEngine.registerResponseFilter(pinFilter);

    // ---- Video element events → playback state + log ---------------------
    const video = videoRef.current;
    /** Đồng bộ state phát từ HTMLVideoElement vào React state. */
    const syncFromVideo = (overrides?: Partial<PlaybackState>) => {
      if (!video) return;
      const ranges: Array<{ start: number; end: number }> = [];
      for (let i = 0; i < video.buffered.length; i += 1) {
        ranges.push({
          start: video.buffered.start(i),
          end: video.buffered.end(i),
        });
      }
      // Buffer ahead = max(end) - currentTime trong vùng chứa currentTime.
      let bufferAhead = 0;
      for (const r of ranges) {
        if (video.currentTime >= r.start && video.currentTime <= r.end) {
          bufferAhead = Math.max(0, r.end - video.currentTime);
          break;
        }
      }
      setPlayback((prev) => ({
        ...prev,
        paused: video.paused,
        ended: video.ended,
        currentTime: video.currentTime,
        duration: Number.isFinite(video.duration) ? video.duration : 0,
        bufferAhead,
        bufferedRanges: ranges,
        volume: video.volume,
        muted: video.muted,
        playbackRate: video.playbackRate,
        ...overrides,
      }));
    };

    const onTimeUpdate = () => syncFromVideo();
    const onVolumeChange = () => syncFromVideo();
    const onRateChange = () => {
      syncFromVideo();
      if (video) {
        pushLog(
          'info',
          'playback',
          `Playback rate → ${video.playbackRate.toFixed(2)}x`,
        );
      }
    };
    const onLoadedMetadata = () => {
      syncFromVideo();
      if (video) {
        pushLog(
          'info',
          'playback',
          `Loaded metadata · duration ${video.duration.toFixed(1)}s`,
        );
      }
    };
    const onLoadedData = () => {
      syncFromVideo();
      finalizeTtff();
    };
    const onPlay = () => {
      syncFromVideo({ paused: false });
      pushLog('info', 'playback', 'Play');
    };
    const onPauseEvt = () => {
      syncFromVideo({ paused: true });
      pushLog('info', 'playback', 'Pause');
    };
    const onSeeking = () => {
      syncFromVideo({ seeking: true });
      pushLog(
        'info',
        'seek',
        // Highlight tính chất AES-CTR random-access cho thuyết trình.
        `Seeking → ${video?.currentTime.toFixed(2)}s · AES-CTR random-access (không cần giải mã từ đầu)`,
      );
    };
    const onSeeked = () => {
      syncFromVideo({ seeking: false });
      pushLog(
        'info',
        'seek',
        `Seeked @ ${video?.currentTime.toFixed(2)}s — segment đã giải mã & decode tức thì`,
      );
    };
    const onWaiting = () => {
      syncFromVideo({ buffering: true });
      pushLog('warn', 'playback', 'Buffer underrun (waiting)');
    };
    const onCanPlay = () => syncFromVideo({ buffering: false });
    const onEnded = () => {
      syncFromVideo({ ended: true, paused: true });
      pushLog('info', 'playback', 'Ended');
    };

    video?.addEventListener('timeupdate', onTimeUpdate);
    video?.addEventListener('volumechange', onVolumeChange);
    video?.addEventListener('ratechange', onRateChange);
    video?.addEventListener('loadedmetadata', onLoadedMetadata);
    video?.addEventListener('loadeddata', onLoadedData);
    video?.addEventListener('play', onPlay);
    video?.addEventListener('pause', onPauseEvt);
    video?.addEventListener('seeking', onSeeking);
    video?.addEventListener('seeked', onSeeked);
    video?.addEventListener('waiting', onWaiting);
    video?.addEventListener('canplay', onCanPlay);
    video?.addEventListener('ended', onEnded);

    // ---- Shaka events → log ----------------------------------------------
    const onAdaptation = () => {
      const variants: ShakaVariantTrack[] = player.getVariantTracks();
      const active = variants.find((v) => v.active);
      if (active) {
        pushLog(
          'info',
          'adaptation',
          `ABR → ${active.height ?? '?'}p · ${(active.bandwidth / 1000).toFixed(0)} kbps`,
        );
      }
    };
    player.addEventListener('adaptation', onAdaptation);

    const onLoaded = () => pushLog('info', 'manifest', 'Manifest loaded');
    player.addEventListener('loaded', onLoaded);

    const onBufferingChanged = (ev: Event) => {
      const buffering = !!(ev as unknown as { buffering?: boolean }).buffering;
      syncFromVideo({ buffering });
      pushLog(
        buffering ? 'warn' : 'info',
        'playback',
        buffering ? 'Buffering started' : 'Buffering ended',
      );
    };
    player.addEventListener('buffering', onBufferingChanged);

    // ---- Stats poll (1 Hz) — bandwidth, decoded/dropped frames -----------
    const statsTimer = window.setInterval(() => {
      try {
        const s = player.getStats?.();
        if (!s) return;
        setPlayback((prev) => ({
          ...prev,
          estimatedBandwidth: s.estimatedBandwidth ?? prev.estimatedBandwidth,
          activeBitrate:
            s.streamBandwidth ?? s.video?.bandwidth ?? prev.activeBitrate,
          decodedFrames: s.decodedFrames ?? prev.decodedFrames,
          droppedFrames: s.droppedFrames ?? prev.droppedFrames,
        }));
      } catch {
        /* ignore — getStats có thể chưa sẵn lúc idle */
      }
    }, 1000);

    return () => {
      pendingDecryptKeyRef.current.clear();
      try {
        networkingEngine.unregisterRequestFilter(onLicenseRequest);
        networkingEngine.unregisterResponseFilter(onLicenseResponse);
        networkingEngine.unregisterResponseFilter(pinFilter);
      } catch {
        // NetworkingEngine có thể đã bị destroy cùng player — bỏ qua.
      }
      window.clearInterval(statsTimer);
      player.removeEventListener('error', onError);
      player.removeEventListener('trackschanged', refreshTracks);
      player.removeEventListener('adaptation', refreshTracks);
      player.removeEventListener('adaptation', onAdaptation);
      player.removeEventListener('loaded', onLoaded);
      player.removeEventListener('buffering', onBufferingChanged);
      video?.removeEventListener('timeupdate', onTimeUpdate);
      video?.removeEventListener('volumechange', onVolumeChange);
      video?.removeEventListener('ratechange', onRateChange);
      video?.removeEventListener('loadedmetadata', onLoadedMetadata);
      video?.removeEventListener('loadeddata', onLoadedData);
      video?.removeEventListener('play', onPlay);
      video?.removeEventListener('pause', onPauseEvt);
      video?.removeEventListener('seeking', onSeeking);
      video?.removeEventListener('seeked', onSeeked);
      video?.removeEventListener('waiting', onWaiting);
      video?.removeEventListener('canplay', onCanPlay);
      video?.removeEventListener('ended', onEnded);
      videoRef.current?.removeEventListener('playing', onPlaying);
      player.destroy();
      playerRef.current = null;
    };
  }, [videoRef, pushLog]);

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
      // Set content_id cho license request filter (dùng opts > manifest > default).
      currentContentIdRef.current =
        opts.contentId ?? manifest.contentId ?? 'movie_123';
      pendingDecryptKeyRef.current.clear();
      pendingTtffRef.current = {
        startedAt: performance.now(),
        sample: {
          manifestId: manifest.id,
          manifestTitle: manifest.title,
          scheme: manifest.scheme,
          drm: !!manifest.drm?.keySystem,
        },
      };
      pushLog(
        'info',
        'manifest',
        `Loading "${manifest.title}" (${manifest.scheme})…`,
      );

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
        // Để Shaka tự chọn robustness mặc định cho Widevine/PlayReady —
        // trên Chrome desktop CDM sẽ tự pick SW_SECURE_CRYPTO (L3) khi
        // không có TEE. Tránh override `advanced` vì Shaka v4.16 đã thay
        // API từ string sang array, dễ gây lỗi tương thích với public
        // test license proxy (cwip-shaka-proxy).
        player.configure({
          drm: {
            servers: { [keySystem]: targetLicenseServer },
            preferredKeySystems: [
              'com.widevine.alpha',
              'com.microsoft.playready',
            ],
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
        player.configure({ drm: { servers: {} } });
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
        pendingTtffRef.current = null;
        const e = err as ShakaError;
        const msg = `Load fail [${e.category ?? '?'}/${e.code ?? '?'}]: ${
          e.data ? e.data.join(' ') : e.message ?? 'unknown error'
        }`;
        setError(msg);
        setStatus('error');
        pushLog('error', 'manifest', msg);

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
          pushLog('error', 'license', msg);
        }
      }
    },
    [pushLog],
  );

  const unload = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.unload();
    setStatus('idle');
    setTracks([]);
    setDrmInfo(EMPTY_DRM_INFO);
    setPinStatus(EMPTY_PIN_STATUS);
    setPlayback(EMPTY_PLAYBACK);
    pendingTtffRef.current = null;
  }, []);

  const selectTrack = useCallback(
    (trackId: number) => {
      const player = playerRef.current;
      if (!player) return;
      const track = player
        .getVariantTracks()
        .find((t: ShakaVariantTrack) => t.id === trackId);
      if (!track) return;
      player.configure({ abr: { enabled: false } });
      setAbrEnabled(false);
      player.selectVariantTrack(track, /* clearBuffer */ true);
      pushLog(
        'info',
        'adaptation',
        `Manual select → ${track.height ?? '?'}p · ${(track.bandwidth / 1000).toFixed(0)} kbps (ABR off)`,
      );
    },
    [pushLog],
  );

  const enableAbr = useCallback(
    (enabled: boolean) => {
      const player = playerRef.current;
      if (!player) return;
      player.configure({ abr: { enabled } });
      setAbrEnabled(enabled);
      pushLog(
        'info',
        'adaptation',
        enabled ? 'ABR enabled (auto)' : 'ABR disabled (manual)',
      );
    },
    [pushLog],
  );

  // ---- Playback controls -------------------------------------------------
  const play = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    void v.play().catch((err: Error) => {
      pushLog('warn', 'playback', `Play rejected: ${err.message}`);
    });
  }, [videoRef, pushLog]);

  const pause = useCallback(() => {
    videoRef.current?.pause();
  }, [videoRef]);

  const togglePlay = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused || v.ended) play();
    else pause();
  }, [videoRef, play, pause]);

  /**
   * Seek tới mốc thời gian (giây). Chứng minh AES-CTR random-access:
   * Player chỉ cần segment chứa mốc đó, decrypt độc lập với các segment
   * khác (vì IV mỗi segment unique).
   */
  const seekTo = useCallback(
    (timeSec: number) => {
      const v = videoRef.current;
      if (!v) return;
      const target = Math.max(
        0,
        Math.min(timeSec, Number.isFinite(v.duration) ? v.duration : timeSec),
      );
      v.currentTime = target;
    },
    [videoRef],
  );

  const seekBy = useCallback(
    (deltaSec: number) => {
      const v = videoRef.current;
      if (!v) return;
      seekTo(v.currentTime + deltaSec);
    },
    [videoRef, seekTo],
  );

  const setVolume = useCallback(
    (vol: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.volume = Math.max(0, Math.min(1, vol));
      if (v.muted && vol > 0) v.muted = false;
    },
    [videoRef],
  );

  const toggleMute = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    v.muted = !v.muted;
  }, [videoRef]);

  const setPlaybackRate = useCallback(
    (rate: number) => {
      const v = videoRef.current;
      if (!v) return;
      v.playbackRate = rate;
    },
    [videoRef],
  );

  const requestFullscreen = useCallback(() => {
    const v = videoRef.current;
    if (!v) return;
    // Ưu tiên fullscreen ở video element; fallback container của controls
    // có thể được caller xử lý bằng cách wrap requestFullscreen riêng.
    const el = v as HTMLVideoElement & {
      webkitRequestFullscreen?: () => void;
    };
    if (document.fullscreenElement) {
      void document.exitFullscreen?.();
    } else if (el.requestFullscreen) {
      void el.requestFullscreen();
    } else if (el.webkitRequestFullscreen) {
      el.webkitRequestFullscreen();
    }
  }, [videoRef]);

  const clearLogs = useCallback(() => setLogs([]), []);

  return {
    status,
    error,
    tracks,
    drmInfo,
    pinStatus,
    playback,
    logs,
    lastTtff,
    ttffHistory,
    load,
    unload,
    selectTrack,
    enableAbr,
    abrEnabled,
    play,
    pause,
    togglePlay,
    seekTo,
    seekBy,
    setVolume,
    toggleMute,
    setPlaybackRate,
    requestFullscreen,
    clearLogs,
  };
}
