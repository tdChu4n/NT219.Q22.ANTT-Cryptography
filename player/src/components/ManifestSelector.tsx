import { type ChangeEvent } from 'react';
import type { MockManifest } from '../mocks/manifests';
import styles from './ManifestSelector.module.css';

type Props = {
  manifests: MockManifest[];
  selectedId: string;
  onSelect: (id: string) => void;
  onReload: () => void;
  customUri: string;
  onCustomUriChange: (uri: string) => void;
  onLoadCustom: () => void;
  disabled?: boolean;
};

export default function ManifestSelector({
  manifests,
  selectedId,
  onSelect,
  onReload,
  customUri,
  onCustomUriChange,
  onLoadCustom,
  disabled,
}: Props) {
  const handleChange = (e: ChangeEvent<HTMLSelectElement>) => onSelect(e.target.value);

  return (
    <section className={styles.wrap}>
      <h3 className={styles.heading}>Manifest (mock)</h3>

      <div className={styles.row}>
        <label htmlFor="manifest-select" className={styles.label}>
          Chọn nguồn:
        </label>
        <select
          id="manifest-select"
          value={selectedId}
          onChange={handleChange}
          disabled={disabled}
        >
          {manifests.map((m) => (
            <option value={m.id} key={m.id}>
              [{m.source}] {m.title} — {m.scheme}
            </option>
          ))}
        </select>
        <button type="button" onClick={onReload} disabled={disabled}>
          Reload
        </button>
      </div>

      <div className={styles.row}>
        <label htmlFor="manifest-custom" className={styles.label}>
          Hoặc URL tuỳ ý:
        </label>
        <input
          id="manifest-custom"
          type="url"
          placeholder="https://.../manifest.mpd"
          value={customUri}
          onChange={(e) => onCustomUriChange(e.target.value)}
          disabled={disabled}
        />
        <button
          type="button"
          className="primary"
          onClick={onLoadCustom}
          disabled={disabled || !customUri.trim()}
        >
          Load
        </button>
      </div>
    </section>
  );
}
