import type { PlaybackState, ShakaTrack } from '../hooks/useShakaPlayer';
import styles from './QualityPanel.module.css';

type Props = {
  tracks: ShakaTrack[];
  abrEnabled: boolean;
  playback: PlaybackState;
  onSelect: (id: number) => void;
  onToggleAbr: (enabled: boolean) => void;
  disabled?: boolean;
};

function formatBitrate(bps: number): string {
  if (!bps) return '—';
  if (bps < 1_000_000) return `${(bps / 1000).toFixed(0)} kbps`;
  return `${(bps / 1_000_000).toFixed(2)} Mbps`;
}

export default function QualityPanel({
  tracks,
  abrEnabled,
  playback,
  onSelect,
  onToggleAbr,
  disabled,
}: Props) {
  const active = tracks.find((t) => t.active) ?? null;

  return (
    <section className={styles.wrap}>
      <div className={styles.headerRow}>
        <h3 className={styles.heading}>Chất lượng (ABR)</h3>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={abrEnabled}
            onChange={(e) => onToggleAbr(e.target.checked)}
            disabled={disabled || tracks.length === 0}
          />
          <span>Tự động (ABR)</span>
        </label>
      </div>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Active</div>
          <div className={styles.statValue}>
            {active
              ? `${active.height ?? '?'}p · ${formatBitrate(active.bandwidth)}`
              : '—'}
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Bandwidth</div>
          <div className={styles.statValue}>
            {formatBitrate(playback.estimatedBandwidth)}
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Buffer</div>
          <div
            className={`${styles.statValue} ${
              playback.bufferAhead < 2
                ? styles.statErr
                : playback.bufferAhead < 5
                  ? styles.statWarn
                  : styles.statOk
            }`}
          >
            {playback.bufferAhead.toFixed(1)}s
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Frames</div>
          <div className={styles.statValue}>
            {playback.decodedFrames.toLocaleString()}
            {playback.droppedFrames > 0 && (
              <span className={styles.statErr}>
                {' '}
                · {playback.droppedFrames} drop
              </span>
            )}
          </div>
        </div>
      </div>

      {tracks.length === 0 ? (
        <p className={styles.empty}>Chưa có track — hãy load manifest.</p>
      ) : (
        <ul className={styles.list}>
          {tracks.map((t) => (
            <li key={t.id}>
              <button
                type="button"
                className={`${styles.item} ${t.active ? styles.active : ''}`}
                onClick={() => onSelect(t.id)}
                disabled={disabled}
              >
                <span>{t.label}</span>
                {t.active && <span className={styles.dot} aria-hidden />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
