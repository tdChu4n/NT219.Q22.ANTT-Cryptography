import type { MockManifest } from '../mocks/manifests';
import styles from './ContentInfo.module.css';

type Props = {
  manifest: MockManifest | null;
};

function schemeLabel(scheme: MockManifest['scheme']): string {
  switch (scheme) {
    case 'clear':
      return 'Clear';
    case 'cenc':
      return 'CENC · AES-128-CTR';
    case 'cbcs':
      return 'CBCS · AES-128-CBC';
    default:
      return scheme;
  }
}

function levelLabel(level: MockManifest['securityLevel']): string | null {
  if (!level) return null;
  switch (level) {
    case 'L1':
      return 'Widevine L1 · TEE/HW';
    case 'L3':
      return 'Widevine L3 · Software CDM';
    case 'CLEAR':
      return 'No DRM';
    default:
      return level;
  }
}

export default function ContentInfo({ manifest }: Props) {
  if (!manifest) {
    return (
      <section className={styles.wrap}>
        <p className={styles.empty}>Chưa chọn manifest.</p>
      </section>
    );
  }

  const level = levelLabel(manifest.securityLevel);

  return (
    <section className={styles.wrap}>
      <div className={styles.header}>
        <h2 className={styles.title}>{manifest.title}</h2>
        <div className={styles.badges}>
          <span className={`${styles.badge} ${styles.badgeFormat}`}>
            {manifest.format}
          </span>
          <span className={`${styles.badge} ${styles.badgeScheme}`}>
            {schemeLabel(manifest.scheme)}
          </span>
          {level && (
            <span className={`${styles.badge} ${styles.badgeLevel}`}>
              {level}
            </span>
          )}
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
        {manifest.keyId && (
          <>
            <dt>Default KID</dt>
            <dd>
              <code>{manifest.keyId}</code>
            </dd>
          </>
        )}
        {manifest.notes && (
          <>
            <dt>Ghi chú</dt>
            <dd className={styles.notes}>{manifest.notes}</dd>
          </>
        )}
      </dl>
    </section>
  );
}
