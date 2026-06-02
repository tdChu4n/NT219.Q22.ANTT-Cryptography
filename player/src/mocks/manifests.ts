// ---------------------------------------------------------------------------
//  Manifest list — danh sách nguồn video DASH cho player
//  Đã kiểm tra tất cả URL (2026-06-02): xem notes từng entry
// ---------------------------------------------------------------------------

export type DrmConfig = {
  keySystem?: string;
  licenseServer?: string;
};

export type MockManifest = {
  id: string;
  title: string;
  description: string;
  uri: string;
  format: 'DASH' | 'HLS';
  scheme: 'clear' | 'cenc' | 'cbcs';
  drm?: DrmConfig;
  source: 'public' | 'local';
  poster?: string;
  securityLevel?: 'L1' | 'L3' | 'CLEAR';
  keyId?: string;
  contentId?: string;
  notes?: string;
};

export const MOCK_MANIFESTS: MockManifest[] = [
  // ── Local VM (DRM thật, ClearKey) ───────────────────────────────────────
  {
    id: 'local-cdn-sim-widevine-https',
    title: 'Local VM · ClearKey 4-period (Vite proxy)',
    description: 'Manifest 4-period key rotation do shaka-packager sinh, phục vụ qua VM2 CDN nginx.',
    uri: '/video/manifest.mpd',
    format: 'DASH',
    scheme: 'cenc',
    drm: { keySystem: 'org.w3.clearkey', licenseServer: '/license' },
    contentId: 'movie_123',
    source: 'local',
    securityLevel: 'L3',
    keyId: '36ff7e0cd3961865b0f71b7ac775cf76',
  },
  {
    id: 'local-cdn-sim-widevine-http',
    title: 'Local VM · ClearKey (direct HTTP — debug)',
    description: 'Trỏ trực tiếp vào VM2 CDN qua HTTP. Dùng khi debug CORS.',
    uri: 'http://192.168.155.11/video/manifest.mpd',
    format: 'DASH',
    scheme: 'cenc',
    drm: { keySystem: 'org.w3.clearkey', licenseServer: '/license' },
    contentId: 'movie_123',
    source: 'local',
    securityLevel: 'L3',
    keyId: '36ff7e0cd3961865b0f71b7ac775cf76',
  },

  // ── Widevine DRM (cwip-shaka-proxy) — đã verify 200 ─────────────────────
  {
    id: 'shaka-sintel-widevine',
    title: 'Sintel · Widevine L3',
    description: 'Sintel với Widevine DRM. License từ cwip-shaka-proxy.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',
    format: 'DASH',
    scheme: 'cenc',
    drm: { keySystem: 'com.widevine.alpha', licenseServer: 'https://cwip-shaka-proxy.appspot.com/no_auth' },
    source: 'public',
    securityLevel: 'L3',
  },
  {
    id: 'shaka-tos-widevine',
    title: 'Tears of Steel · Widevine L3',
    description: 'Tears of Steel với Widevine DRM. (URL gốc tos-mp4-cenc đã bị Google xóa, dùng sintel-widevine thay thế)',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',
    format: 'DASH',
    scheme: 'cenc',
    drm: { keySystem: 'com.widevine.alpha', licenseServer: 'https://cwip-shaka-proxy.appspot.com/no_auth' },
    source: 'public',
    securityLevel: 'L3',
  },

  // ── Clear (không DRM) — đã verify 200 ───────────────────────────────────
  {
    id: 'shaka-angel-one',
    title: 'Angel One (Shaka clear)',
    description: 'Manifest clear nhiều rendition — test ABR pipeline.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
    securityLevel: 'CLEAR',
  },
  {
    id: 'shaka-sintel-clear',
    title: 'Sintel · Clear',
    description: 'Sintel không mã hoá — demo so sánh với bản Widevine.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/sintel/dash.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
    securityLevel: 'CLEAR',
  },
  {
    id: 'shaka-elephants-clear',
    title: 'Elephants Dream · Clear',
    description: 'Tears of Steel phiên bản clear 5.1 surround. (elephants-dream-words bị Google xóa)',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/tos-surround/dash.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
    securityLevel: 'CLEAR',
  },
  {
    id: 'shaka-bbb-dark',
    title: 'BBB · Dark Truths',
    description: 'Big Buck Bunny phiên bản tái bản màu tối, HDR-graded.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths/dash.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
    securityLevel: 'CLEAR',
  },
  {
    id: 'shaka-dig-uke',
    title: 'Dig the Uke',
    description: 'Music video ukulele ngắn — test player trên nội dung âm nhạc.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/dig-the-uke/dash.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
    securityLevel: 'CLEAR',
  },
  {
    id: 'bitmovin-art-motion',
    title: 'The Art of Motion',
    description: 'Bitmovin Art of Motion bị chặn (403) — dùng BBB Dark Truths thay thế.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/bbb-dark-truths/dash.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
    securityLevel: 'CLEAR',
  },
  {
    id: 'dash-if-bbb',
    title: 'Big Buck Bunny (DASH-IF clear)',
    description: 'BBB chuẩn DASH-IF, nhiều rendition 360p–1080p.',
    uri: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
    securityLevel: 'CLEAR',
  },
];

export const DEFAULT_MANIFEST_ID = 'local-cdn-sim-widevine-https';
