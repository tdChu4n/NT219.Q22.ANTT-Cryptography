// ---------------------------------------------------------------------------
//  Mock manifest list — Task T1.7
//
//  Mục tiêu của task: Player thực thi đầy đủ luồng EME (Encrypted Media
//  Extensions) — Player → CDM → /license → giải mã → render — và demo OK
//  trên Chrome với Widevine L3 (software CDM).
//
//  Chiến lược nguồn dữ liệu trong file này:
//   1. Public test asset (Shaka + DASH-IF) — phát ngay khi mới `npm run dev`,
//      không phụ thuộc license-server nội bộ. Dùng `cwip-shaka-proxy` để
//      lấy license Widevine test KIDs.
//   2. Local cdn-sim (Task T1.6) — manifest do shaka-packager tạo (Task
//      T2.1/T2.2/T2.3 đã có CENC + PSSH Widevine), license trỏ về
//      `/license` (Vite proxy → cdn-sim → license-server). Stub này
//      sẽ "go live" khi T2.4/T2.5 hoàn thành (RSA-OAEP + JWT).
//
//  Field `securityLevel` chỉ là metadata để hiển thị; Player thực sự ép
//  Widevine L3 trong useShakaPlayer (xem advanced.videoRobustness).
// ---------------------------------------------------------------------------

export type DrmConfig = {
  /** Ví dụ: "com.widevine.alpha", "com.apple.fps.1_0", "com.microsoft.playready". */
  keySystem?: string;
  /** License Server URL; để trống nghĩa là clear (chưa DRM). */
  licenseServer?: string;
};

export type MockManifest = {
  id: string;
  title: string;
  description: string;
  /** URL manifest (.mpd hoặc .m3u8). */
  uri: string;
  format: 'DASH' | 'HLS';
  /** Clear = chưa mã hoá; CENC = DASH + AES-CTR; CBCS = HLS + AES-CBC pattern. */
  scheme: 'clear' | 'cenc' | 'cbcs';
  drm?: DrmConfig;
  /** Nhãn hiển thị nguồn (demo public / local cdn-sim). */
  source: 'public' | 'local';
  /** Poster tuỳ chọn (ảnh public được browser cache, an toàn cho demo). */
  poster?: string;
  /** Mô tả mức bảo vệ Widevine: L1 (TEE) / L3 (software CDM). */
  securityLevel?: 'L1' | 'L3' | 'CLEAR';
  /** KID hex 32 ký tự — copy từ packager output để hiển thị trong panel. */
  keyId?: string;
  /**
   * content_id gửi kèm trong body của license request tới License Server.
   * Phải khớp với collection entitlements trong MongoDB.
   */
  contentId?: string;
  /** Ghi chú vận hành (vd: cần chạy stack docker, đang chờ T2.x …). */
  notes?: string;
};

export const MOCK_MANIFESTS: MockManifest[] = [
  {
    id: 'shaka-sintel-widevine',
    title: 'Sintel · Widevine L3 (Demo EME)',
    description:
      'Asset Widevine test của Shaka Player. License lấy từ proxy công khai cwip-shaka-proxy. Đây là asset chính để xác minh pipeline EME → /license → giải mã.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',
    format: 'DASH',
    scheme: 'cenc',
    drm: {
      keySystem: 'com.widevine.alpha',
      licenseServer: 'https://cwip-shaka-proxy.appspot.com/no_auth',
    },
    source: 'public',
    securityLevel: 'L3',
    notes:
      'Demo Chrome desktop OK với Widevine L3 (SW_SECURE_CRYPTO). Khi T2.4/T2.5 sẵn sàng, bật toggle "Override → /license" để route license qua cdn-sim.',
  },
  {
    id: 'shaka-tos-widevine',
    title: 'Tears of Steel · Widevine L3',
    description:
      'Asset thứ 2 dùng Widevine test KIDs của cwip-shaka-proxy — kiểm chéo rằng pipeline EME hoạt động ổn định trên nhiều bộ KID.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/tos-mp4-cenc/dash.mpd',
    format: 'DASH',
    scheme: 'cenc',
    drm: {
      keySystem: 'com.widevine.alpha',
      licenseServer: 'https://cwip-shaka-proxy.appspot.com/no_auth',
    },
    source: 'public',
    securityLevel: 'L3',
  },
  {
    id: 'local-cdn-sim-widevine-https',
    title: 'Local VM · ClearKey 4-period (Vite proxy)',
    description:
      'Manifest 4-period key rotation do shaka-packager sinh, phục vụ qua VM2 CDN nginx. License qua VM1 License Server với JWT RS256 + RSA-OAEP key wrap + nonce chống replay.',
    uri: '/video/manifest.mpd',
    format: 'DASH',
    scheme: 'cenc',
    drm: {
      keySystem: 'org.w3.clearkey',
      licenseServer: '/license',
    },
    contentId: 'movie_123',
    source: 'local',
    securityLevel: 'L3',
    keyId: '36ff7e0cd3961865b0f71b7ac775cf76',
    notes:
      'Cần VM1 (192.168.155.10:3000) + VM2 (192.168.155.11 nginx). Vite proxy: /video→VM2, /license→VM1, /api→VM1. Player tự động: 1) Fetch JWT /api/auth/login 2) Generate RSA-2048 device key 3) License request với RSA-OAEP wrap 4) Decrypt key → ClearKey response.',
  },
  {
    id: 'local-cdn-sim-widevine-http',
    title: 'Local VM · ClearKey (direct HTTP — debug)',
    description:
      'Trỏ trực tiếp vào VM2 CDN qua HTTP (không qua Vite proxy). Dùng khi debug CORS hoặc Vite proxy chưa cấu hình đúng.',
    uri: 'http://192.168.155.11/video/manifest.mpd',
    format: 'DASH',
    scheme: 'cenc',
    drm: {
      keySystem: 'org.w3.clearkey',
      licenseServer: '/license',
    },
    contentId: 'movie_123',
    source: 'local',
    securityLevel: 'L3',
    keyId: '36ff7e0cd3961865b0f71b7ac775cf76',
    notes:
      'VM2 nginx phải bật CORS (Access-Control-Allow-Origin: *) cho /video. License vẫn đi qua Vite proxy /license → VM1:3000.',
  },
  {
    id: 'shaka-angel-one',
    title: 'Angel One (Shaka clear)',
    description:
      'Manifest clear, không EME. Dùng để kiểm tra pipeline MSE/ABR khi nghi ngờ vấn đề ngoài DRM.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
    securityLevel: 'CLEAR',
  },
  {
    id: 'dash-if-bbb',
    title: 'Big Buck Bunny (DASH-IF clear)',
    description:
      'Manifest DASH chuẩn với nhiều rendition 360p/720p/1080p, dùng để kiểm tra ABR khi không có EME.',
    uri: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
    securityLevel: 'CLEAR',
  },
];

export const DEFAULT_MANIFEST_ID = 'local-cdn-sim-widevine-https';
