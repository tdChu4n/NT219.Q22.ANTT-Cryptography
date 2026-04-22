import type { MockManifest } from '../mocks/manifests';
import styles from './ContentInfo.module.css';

type Props = {
  manifest: MockManifest | null;
};

export default function ContentInfo({ manifest }: Props) {
  if (!manifest) {
    return (
      <section className={styles.wrap}>
        <p className={styles.empty}>Chưa chọn manifest.</p>
      </section>
    );
  }

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>{manifest.title}</h2>
        <div className={styles.badges}>
          <span className={`${styles.badge} ${styles.badgeFormat}`}>{manifest.format}</span>
          <span className={`${styles.badge} ${styles.badgeScheme}`}>
            {manifest.scheme === 'clear' ? 'Clear' : manifest.scheme.toUpperCase()}
          </span>
          <span
            className={`${styles.badge} ${
              manifest.source === 'local' ? styles.badgeLocal : styles.badgePublic
            }`}
          >
            {manifest.source}
          </span>
        </div>
      </div>

      <p className={styles.desc}>{manifest.description}</p>

      <dl className={styles.meta}>
        <dt>Manifest URI</dt>
        <dd>
          <code>{manifest.uri}</code>
        </dd>
        {manifest.drm?.keySystem && (
          <>
            <dt>Key System</dt>
            <dd>
              <code>{manifest.drm.keySystem}</code>
            </dd>
            <dt>License Server</dt>
            <dd>
              <code>{manifest.drm.licenseServer}</code>
            </dd>
          </>
        )}
      </dl>
    </section>
  );
}
