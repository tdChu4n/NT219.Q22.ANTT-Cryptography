import { useEffect, useRef, useState, useCallback } from 'react';
// Shaka Player exports types qua `declare namespace shaka` (global) nên
// default import chỉ trả về runtime object. Ta cast sang kiểu an toàn
// cho scaffold; các sprint sau nâng cấp typing theo shaka.extern.*
// eslint-disable-next-line @typescript-eslint/no-explicit-any
import shakaImport from 'shaka-player/dist/shaka-player.compiled';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const shaka = shakaImport as any;

import type { MockManifest } from '../mocks/manifests';

// ---------------------------------------------------------------------------
//  Hook tích hợp Shaka Player với React — Task T1.7
//
//  Lifecycle:
//    mount       → install polyfills (once) → tạo shaka.Player instance.
//    load()      → cấu hình DRM, gọi player.load(uri), xử lý lỗi.
//    unmount     → destroy player để tránh rò memory / event listener.
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

export type UseShakaPlayerReturn = {
  status: ShakaStatus;
  error: string | null;
  tracks: ShakaTrack[];
  load: (manifest: MockManifest) => Promise<void>;
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
  data?: unknown[];
  message?: string;
};

export function useShakaPlayer(
  videoRef: React.RefObject<HTMLVideoElement | null>,
): UseShakaPlayerReturn {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const playerRef = useRef<any>(null);
  const [status, setStatus] = useState<ShakaStatus>('idle');
  const [error, setError] = useState<string | null>(null);
  const [tracks, setTracks] = useState<ShakaTrack[]>([]);
  const [abrEnabled, setAbrEnabled] = useState(true);

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

    const onError = (event: Event) => {
      const detail =
        (event as unknown as { detail: ShakaError }).detail ?? {};
      setError(
        `[Shaka ${detail.category ?? '?'}/${detail.code ?? '?'}] ${
          detail.data ? detail.data.join(' ') : detail.message ?? 'unknown error'
        }`,
      );
      setStatus('error');
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

    return () => {
      player.removeEventListener('error', onError);
      player.removeEventListener('trackschanged', refreshTracks);
      player.removeEventListener('adaptation', refreshTracks);
      player.destroy();
      playerRef.current = null;
    };
  }, [videoRef]);

  // ---- load --------------------------------------------------------------
  const load = useCallback(async (manifest: MockManifest) => {
    const player = playerRef.current;
    if (!player) return;

    setStatus('loading');
    setError(null);
    setTracks([]);

    // Cấu hình DRM (mock — sprint sau gắn license-server thật)
    if (manifest.drm?.keySystem && manifest.drm.licenseServer) {
      player.configure({
        drm: {
          servers: {
            [manifest.drm.keySystem]: manifest.drm.licenseServer,
          },
        },
      });
    } else {
      player.configure({ drm: { servers: {} } });
    }

    // ABR mặc định bật — tuỳ chọn disable qua selectTrack()
    player.configure({ abr: { enabled: true } });
    setAbrEnabled(true);

    try {
      await player.load(manifest.uri);
      setStatus('ready');
    } catch (err) {
      const e = err as ShakaError;
      setError(
        `Load fail [${e.category ?? '?'}/${e.code ?? '?'}]: ${
          e.data ? e.data.join(' ') : e.message ?? 'unknown error'
        }`,
      );
      setStatus('error');
    }
  }, []);

  const unload = useCallback(async () => {
    const player = playerRef.current;
    if (!player) return;
    await player.unload();
    setStatus('idle');
    setTracks([]);
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
    load,
    unload,
    selectTrack,
    enableAbr,
    abrEnabled,
  };
}
