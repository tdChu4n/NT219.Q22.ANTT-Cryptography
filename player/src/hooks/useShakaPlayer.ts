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
  playback: PlaybackState;
  logs: LogEntry[];
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

  // Bộ đếm bytes của request gần nhất (đo trong request filter, đọc lại
  // trong response filter). Dùng Map<uri, bytes> để hỗ trợ song song
  // (audio + video license trong cùng một phim).
  const pendingRequestBytesRef = useRef<Map<string, number>>(new Map());

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

      const uri = request.uris?.[0] ?? '';
      // Chỉ gắn custom header cho license endpoint NỘI BỘ. Header tuỳ
      // chỉnh sẽ trigger CORS preflight OPTIONS — license proxy công cộng
      // (vd: cwip-shaka-proxy) không allow `X-Player-Build` trong
      // Access-Control-Allow-Headers → preflight fail → 6001 LICENSE
      // _REQUEST_FAILED. Pattern check: URI relative hoặc same-origin
      // hoặc trỏ tới cdn-sim/license-server local.
      const isInternal =
        uri.startsWith('/') ||
        uri.startsWith(window.location.origin) ||
        /\b(localhost|cdn\.local|cdn-sim|license-server)\b/.test(uri);

      if (isInternal) {
        request.headers = request.headers ?? {};
        request.headers['X-Player-Build'] = 'NT219-T1.7';
        // TODO[T2.4]: gắn JWT entitlement
        //   request.headers['Authorization'] = `Bearer ${getEntitlementToken()}`;
        // TODO[T2.5]: gửi device public key cho RSA-OAEP key wrap
        //   request.headers['X-Device-Pubkey'] = base64(devicePubKey);
      }

      const bodyBytes =
        request.body instanceof ArrayBuffer
          ? request.body.byteLength
          : request.body?.byteLength ?? 0;
      pendingRequestBytesRef.current.set(uri || '<unknown>', bodyBytes);
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
      pushLog(
        'info',
        'license',
        `License OK · ${stat.timeMs.toFixed(0)}ms · ${stat.responseBytes}B`,
      );
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
