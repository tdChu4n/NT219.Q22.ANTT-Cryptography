// ---------------------------------------------------------------------------
//  Mock manifest list — Task T1.7
//
//  Mục tiêu của task: Player load được manifest *mock* khi `npm run dev`.
//  Chúng ta gộp 2 nhóm nguồn:
//   1. Public demo (Shaka + DASH-IF) — dùng ngay khi chưa có cdn-sim.
//   2. Local cdn-sim (Task T1.6) — khi stack infra đang chạy, Player
//      dev proxy /video → http://localhost:8080/video (xem vite.config.ts).
//
//  Field `drm` để sprint sau (Lộc/Chuẩn) gắn laurent License Server thật.
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
};

export const MOCK_MANIFESTS: MockManifest[] = [
  {
    id: 'shaka-angel-one',
    title: 'Angel One (Shaka demo)',
    description:
      'Clip giới thiệu — manifest clear của Shaka Player, dùng để kiểm tra pipeline MSE/EME đã sẵn sàng.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/angel-one/dash.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
  },
  {
    id: 'dash-if-bbb',
    title: 'Big Buck Bunny (DASH-IF 30 fps)',
    description:
      'Manifest DASH chuẩn của DASH-IF. Test ABR (nhiều rendition 360p/720p/1080p).',
    uri: 'https://dash.akamaized.net/akamai/bbb_30fps/bbb_30fps.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'public',
  },
  {
    id: 'shaka-sintel-widevine',
    title: 'Sintel (Widevine, encrypted demo)',
    description:
      'Manifest đã mã hoá bằng Widevine test key — để sprint sau khi License Server sẵn sàng, thay licenseServer bằng endpoint nội bộ.',
    uri: 'https://storage.googleapis.com/shaka-demo-assets/sintel-widevine/dash.mpd',
    format: 'DASH',
    scheme: 'cenc',
    drm: {
      keySystem: 'com.widevine.alpha',
      licenseServer: 'https://cwip-shaka-proxy.appspot.com/no_auth',
    },
    source: 'public',
  },
  {
    id: 'local-cdn-sim-demo',
    title: 'Local cdn-sim (packager output)',
    description:
      'Manifest được sinh bởi Task T1.5 (packager) + phục vụ qua cdn-sim đã hardened (Task T1.6). Chạy `docker compose up cdn-sim` rồi chọn mục này.',
    uri: '/video/manifest.mpd',
    format: 'DASH',
    scheme: 'clear',
    source: 'local',
  },
];

export const DEFAULT_MANIFEST_ID = MOCK_MANIFESTS[0]!.id;
