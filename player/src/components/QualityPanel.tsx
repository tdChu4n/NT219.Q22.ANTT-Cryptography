import type { ShakaTrack } from '../hooks/useShakaPlayer';
import styles from './QualityPanel.module.css';

type Props = {
  tracks: ShakaTrack[];
  abrEnabled: boolean;
  onSelect: (id: number) => void;
  onToggleAbr: (enabled: boolean) => void;
  disabled?: boolean;
};

export default function QualityPanel({
  tracks,
  abrEnabled,
  onSelect,
  onToggleAbr,
  disabled,
}: Props) {
  if (tracks.length === 0) {
    return (
      <section className={styles.wrap}>
        <h3 className={styles.heading}>Chất lượng (ABR)</h3>
        <p className={styles.empty}>Chưa có track — hãy load manifest.</p>
      </section>
    );
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.headerRow}>
        <h3 className={styles.heading}>Chất lượng (ABR)</h3>
        <label className={styles.toggle}>
          <input
            type="checkbox"
            checked={abrEnabled}
            onChange={(e) => onToggleAbr(e.target.checked)}
            disabled={disabled}
          />
          <span>Tự động (ABR)</span>
        </label>
      </div>

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
    </section>
  );
}
