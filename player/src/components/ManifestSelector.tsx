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

function schemeBadge(scheme: MockManifest['scheme']) {
  if (scheme === 'clear') return null;
  return <span className={styles.badgeDrm}>🔒 DRM</span>;
}

export default function ManifestSelector({
  manifests,
  selectedId,
  onSelect,
  disabled,
}: Props) {
  const localItems = manifests.filter((m) => m.source === 'local');
  const publicItems = manifests.filter((m) => m.source === 'public');

  const renderItem = (m: MockManifest) => (
    <button
      key={m.id}
      type="button"
      className={`${styles.item} ${selectedId === m.id ? styles.itemActive : ''}`}
      onClick={() => onSelect(m.id)}
      disabled={disabled}
    >
      <div className={styles.itemTitle}>{m.title.replace(/·.*$/, '').trim()}</div>
      <div className={styles.itemDesc}>{m.description.split('.')[0]}.</div>
      <div className={styles.itemMeta}>
        {schemeBadge(m.scheme)}
        <span className={styles.badgeFormat}>{m.format}</span>
      </div>
    </button>
  );

  return (
    <section className={styles.wrap}>
      {localItems.length > 0 && (
        <>
          <h3 className={styles.heading}>Nội dung của tôi</h3>
          <div className={styles.list}>{localItems.map(renderItem)}</div>
        </>
      )}

      {publicItems.length > 0 && (
        <>
          <h3 className={`${styles.heading} ${styles.headingSecondary}`}>
            Nội dung mẫu
          </h3>
          <div className={styles.list}>{publicItems.map(renderItem)}</div>
        </>
      )}
    </section>
  );
}
