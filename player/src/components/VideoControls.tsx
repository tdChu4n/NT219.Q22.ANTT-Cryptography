import { useMemo, useRef } from 'react';
import type { PlaybackState, ShakaTrack } from '../hooks/useShakaPlayer';
import styles from './VideoControls.module.css';

type Props = {
  playback: PlaybackState;
  tracks: ShakaTrack[];
  abrEnabled: boolean;
  onTogglePlay: () => void;
  onSeekTo: (timeSec: number) => void;
  onSeekBy: (deltaSec: number) => void;
  onSetVolume: (vol: number) => void;
  onToggleMute: () => void;
  onSetRate: (rate: number) => void;
  onSelectTrack: (id: number) => void;
  onToggleAbr: (enabled: boolean) => void;
  onFullscreen: () => void;
  disabled?: boolean;
};

const RATES = [0.5, 0.75, 1, 1.25, 1.5, 2];

function formatTime(sec: number): string {
  if (!Number.isFinite(sec) || sec < 0) return '0:00';
  const total = Math.floor(sec);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

function formatBitrate(bps: number): string {
  if (!bps) return '—';
  if (bps < 1_000_000) return `${(bps / 1000).toFixed(0)} kbps`;
  return `${(bps / 1_000_000).toFixed(2)} Mbps`;
}

export default function VideoControls({
  playback,
  tracks,
  abrEnabled,
  onTogglePlay,
  onSeekTo,
  onSeekBy,
  onSetVolume,
  onToggleMute,
  onSetRate,
  onSelectTrack,
  onToggleAbr,
  onFullscreen,
  disabled,
}: Props) {
  const seekRef = useRef<HTMLDivElement>(null);

  const duration = playback.duration > 0 ? playback.duration : 1;
  const progressPct = Math.min(100, (playback.currentTime / duration) * 100);

  // Vẽ buffered ranges thành các thanh nhạt phía sau progress bar.
  const bufferedSegments = useMemo(
    () =>
      playback.bufferedRanges.map((r, i) => ({
        key: i,
        leftPct: (r.start / duration) * 100,
        widthPct: ((r.end - r.start) / duration) * 100,
      })),
    [playback.bufferedRanges, duration],
  );

  const activeTrack = tracks.find((t) => t.active) ?? null;

  const handleSeekClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (disabled) return;
    const el = seekRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const ratio = Math.max(
      0,
      Math.min(1, (e.clientX - rect.left) / rect.width),
    );
    onSeekTo(ratio * playback.duration);
  };

  return (
    <div
      className={`${styles.wrap} ${disabled ? styles.disabled : ''}`}
      data-buffering={playback.buffering ? '1' : '0'}
    >
      {/* ----- Seek bar ----- */}
      <div className={styles.seekRow}>
        <span className={styles.timeLeft}>
          {formatTime(playback.currentTime)}
        </span>

        <div
          ref={seekRef}
          className={styles.seekBar}
          role="slider"
          aria-label="Seek"
          aria-valuemin={0}
          aria-valuemax={Math.max(0, playback.duration)}
          aria-valuenow={playback.currentTime}
          tabIndex={disabled ? -1 : 0}
          onClick={handleSeekClick}
          onKeyDown={(e) => {
            if (disabled) return;
            if (e.key === 'ArrowLeft') onSeekBy(-5);
            else if (e.key === 'ArrowRight') onSeekBy(5);
            else if (e.key === 'Home') onSeekTo(0);
            else if (e.key === 'End') onSeekTo(playback.duration);
          }}
        >
          {/* Buffered ranges */}
          {bufferedSegments.map((b) => (
            <div
              key={b.key}
              className={styles.bufferedSeg}
              style={{ left: `${b.leftPct}%`, width: `${b.widthPct}%` }}
            />
          ))}
          {/* Played progress */}
          <div
            className={styles.progress}
            style={{ width: `${progressPct}%` }}
          />
          {/* Thumb */}
          <div
            className={styles.thumb}
            style={{ left: `${progressPct}%` }}
            aria-hidden
          />
        </div>

        <span className={styles.timeRight}>
          {formatTime(playback.duration)}
        </span>
      </div>

      <small className={styles.ctrHint} aria-hidden>
        AES-128-CTR · seek bất kỳ → giải mã segment độc lập (không cần
        decrypt từ đầu).
      </small>

      {/* ----- Bottom toolbar ----- */}
      <div className={styles.toolbar}>
        <div className={styles.left}>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => onSeekBy(-10)}
            disabled={disabled}
            title="Lùi 10s"
          >
            ⏪ 10
          </button>
          <button
            type="button"
            className={`${styles.iconBtn} ${styles.playBtn}`}
            onClick={onTogglePlay}
            disabled={disabled}
            title={playback.paused ? 'Play' : 'Pause'}
          >
            {playback.paused ? '▶' : '❚❚'}
          </button>
          <button
            type="button"
            className={styles.iconBtn}
            onClick={() => onSeekBy(10)}
            disabled={disabled}
            title="Tiến 10s"
          >
            10 ⏩
          </button>

          <div className={styles.volWrap}>
            <button
              type="button"
              className={styles.iconBtn}
              onClick={onToggleMute}
              disabled={disabled}
              title={playback.muted ? 'Unmute' : 'Mute'}
            >
              {playback.muted || playback.volume === 0
                ? '🔇'
                : playback.volume < 0.5
                  ? '🔉'
                  : '🔊'}
            </button>
            <input
              type="range"
              className={styles.volSlider}
              min={0}
              max={1}
              step={0.01}
              value={playback.muted ? 0 : playback.volume}
              onChange={(e) => onSetVolume(Number(e.target.value))}
              disabled={disabled}
              aria-label="Volume"
            />
          </div>
        </div>

        <div className={styles.center}>
          <span className={styles.bandwidth}>
            <span className={styles.bandLabel}>Bandwidth</span>
            <span className={styles.bandValue}>
              {formatBitrate(playback.estimatedBandwidth)}
            </span>
          </span>
          <span className={styles.bandwidth}>
            <span className={styles.bandLabel}>Buffer</span>
            <span className={styles.bandValue}>
              {playback.bufferAhead.toFixed(1)}s
            </span>
          </span>
          {activeTrack && (
            <span className={styles.bandwidth}>
              <span className={styles.bandLabel}>Active</span>
              <span className={styles.bandValue}>
                {activeTrack.height ?? '?'}p ·{' '}
                {(activeTrack.bandwidth / 1000).toFixed(0)} kbps
              </span>
            </span>
          )}
        </div>

        <div className={styles.right}>
          <label className={styles.selectWrap} title="Tốc độ phát">
            <select
              className={styles.select}
              value={playback.playbackRate}
              onChange={(e) => onSetRate(Number(e.target.value))}
              disabled={disabled}
              aria-label="Playback speed"
            >
              {RATES.map((r) => (
                <option key={r} value={r}>
                  {r === 1 ? '1×' : `${r}×`}
                </option>
              ))}
            </select>
          </label>

          <label
            className={styles.selectWrap}
            title="Quality (ABR auto khi chọn 'Auto')"
          >
            <select
              className={styles.select}
              value={abrEnabled ? 'auto' : (activeTrack?.id ?? 'auto')}
              onChange={(e) => {
                const v = e.target.value;
                if (v === 'auto') {
                  onToggleAbr(true);
                } else {
                  onSelectTrack(Number(v));
                }
              }}
              disabled={disabled || tracks.length === 0}
              aria-label="Quality"
            >
              <option value="auto">Auto (ABR)</option>
              {tracks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.height != null ? `${t.height}p` : 'audio'} ·{' '}
                  {(t.bandwidth / 1000).toFixed(0)} kbps
                </option>
              ))}
            </select>
          </label>

          <button
            type="button"
            className={styles.iconBtn}
            onClick={onFullscreen}
            disabled={disabled}
            title="Fullscreen"
          >
            ⛶
          </button>
        </div>
      </div>
    </div>
  );
}
