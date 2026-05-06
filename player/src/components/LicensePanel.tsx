import type { DrmInfo, PinStatus } from '../hooks/useShakaPlayer';
import styles from './LicensePanel.module.css';

type Props = {
  drmInfo: DrmInfo;
  pinStatus: PinStatus;
  /** Khi bật → Player override licenseServer về /license (cdn-sim → license-server). */
  overrideToInternal: boolean;
  onToggleOverride: (next: boolean) => void;
  /** Disable toggle khi không có DRM (manifest clear) hoặc đang loading. */
  disabled?: boolean;
};

function formatKeySystem(ks: string | null): string {
  if (!ks) return '—';
  switch (ks) {
    case 'com.widevine.alpha':
      return 'Widevine (com.widevine.alpha)';
    case 'com.microsoft.playready':
      return 'PlayReady (com.microsoft.playready)';
    case 'com.apple.fps.1_0':
    case 'com.apple.fps':
      return 'FairPlay (Apple)';
    default:
      return ks;
  }
}

function formatBytes(n: number): string {
  if (!n) return '0 B';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KiB`;
  return `${(n / 1024 / 1024).toFixed(2)} MiB`;
}

function formatTime(ms: number): string {
  if (ms == null || Number.isNaN(ms)) return '—';
  if (ms < 1000) return `${Math.round(ms)} ms`;
  return `${(ms / 1000).toFixed(2)} s`;
}

function shortenUri(uri: string): string {
  if (uri.length <= 64) return uri;
  return `${uri.slice(0, 28)}…${uri.slice(-30)}`;
}

function formatRobustness(level: string | null): string {
  if (!level) return '—';
  switch (level) {
    case 'SW_SECURE_CRYPTO':
      return 'SW_SECURE_CRYPTO · Widevine L3';
    case 'SW_SECURE_DECODE':
      return 'SW_SECURE_DECODE · Widevine L3';
    case 'HW_SECURE_CRYPTO':
      return 'HW_SECURE_CRYPTO · Widevine L1';
    case 'HW_SECURE_DECODE':
      return 'HW_SECURE_DECODE · Widevine L1';
    case 'HW_SECURE_ALL':
      return 'HW_SECURE_ALL · Widevine L1';
    default:
      return level;
  }
}

function pinBadgeLabel(s: PinStatus): {
  label: string;
  tone: 'ok' | 'warn' | 'err' | 'idle';
} {
  if (s.lastOutcome == null) return { label: 'Pin · idle', tone: 'idle' };
  switch (s.lastOutcome) {
    case 'ok':
      return { label: 'Pin OK', tone: 'ok' };
    case 'mismatch':
      return { label: 'Pin MISMATCH', tone: 'err' };
    case 'missing':
      return { label: 'Pin missing', tone: 'warn' };
    case 'skipped':
    default:
      return { label: 'Pin · n/a', tone: 'idle' };
  }
}

function shortPin(pin: string | null): string {
  if (!pin) return '—';
  if (pin.length <= 32) return pin;
  return `${pin.slice(0, 16)}…${pin.slice(-12)}`;
}

export default function LicensePanel({
  drmInfo,
  pinStatus,
  overrideToInternal,
  onToggleOverride,
  disabled,
}: Props) {
  const hasDrm = !!drmInfo.keySystem;
  const pinBadge = pinBadgeLabel(pinStatus);

  return (
    <section className={styles.wrap}>
      <div className={styles.headerRow}>
        <h3 className={styles.heading}>EME · License Flow</h3>
        <div className={styles.headerBadges}>
          <span
            className={`${styles.pill} ${
              hasDrm ? styles.pillActive : styles.pillIdle
            }`}
          >
            {hasDrm ? 'CENC · Widevine' : 'Clear (no DRM)'}
          </span>
          <span
            className={`${styles.pill} ${styles[`pinPill_${pinBadge.tone}`]}`}
            title={`Pin mode: ${pinStatus.mode}`}
          >
            {pinBadge.label}
          </span>
        </div>
      </div>

      <dl className={styles.kv}>
        <dt>Key System</dt>
        <dd>
          <code>{formatKeySystem(drmInfo.keySystem)}</code>
        </dd>

        <dt>License Server</dt>
        <dd>
          <code title={drmInfo.licenseServer ?? ''}>
            {drmInfo.licenseServer
              ? shortenUri(drmInfo.licenseServer)
              : '—'}
          </code>
        </dd>

        <dt>Robustness</dt>
        <dd>
          <code>{formatRobustness(drmInfo.videoRobustness)}</code>
        </dd>

        <dt>KID(s)</dt>
        <dd>
          {drmInfo.keyIds.length === 0 ? (
            <code>—</code>
          ) : (
            <ul className={styles.kidList}>
              {drmInfo.keyIds.map((kid) => (
                <li key={kid}>
                  <code>{kid}</code>
                </li>
              ))}
            </ul>
          )}
        </dd>
      </dl>

      <div className={styles.pinBox}>
        <div className={styles.pinHead}>
          <strong>Cert Pinning</strong>
          <span className={styles.pinMode}>mode: {pinStatus.mode}</span>
        </div>
        <dl className={styles.pinKv}>
          <dt>Last origin</dt>
          <dd>
            <code>{pinStatus.lastOrigin ?? '—'}</code>
          </dd>
          <dt>Received pin</dt>
          <dd>
            <code title={pinStatus.lastReceivedPin ?? ''}>
              {shortPin(pinStatus.lastReceivedPin)}
            </code>
          </dd>
        </dl>
        <div className={styles.pinCounts}>
          <span className={styles.pinCountOk}>
            ok {pinStatus.counts.ok}
          </span>
          <span className={styles.pinCountWarn}>
            missing {pinStatus.counts.missing}
          </span>
          <span className={styles.pinCountErr}>
            mismatch {pinStatus.counts.mismatch}
          </span>
          <span className={styles.pinCountIdle}>
            skipped {pinStatus.counts.skipped}
          </span>
        </div>
      </div>

      <label
        className={`${styles.toggleRow} ${
          disabled ? styles.toggleDisabled : ''
        }`}
      >
        <input
          type="checkbox"
          checked={overrideToInternal}
          onChange={(e) => onToggleOverride(e.target.checked)}
          disabled={disabled}
        />
        <span>
          Override license → <code>/license</code> (cdn-sim → license-server)
          <small className={styles.toggleHint}>
            T2.4/T2.5 sẽ wire JWT + RSA-OAEP. Hiện stub trả 200 plain text →
            CDM sẽ báo lỗi DRM cho tới khi key wrap thật được phát hành.
          </small>
        </span>
      </label>

      <div className={styles.statRow}>
        <div className={styles.stat}>
          <div className={styles.statLabel}>License requests</div>
          <div className={styles.statValue}>{drmInfo.licenseRequests}</div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Last latency</div>
          <div className={styles.statValue}>
            {drmInfo.lastLicense
              ? formatTime(drmInfo.lastLicense.timeMs)
              : '—'}
          </div>
        </div>
        <div className={styles.stat}>
          <div className={styles.statLabel}>Last status</div>
          <div
            className={`${styles.statValue} ${
              drmInfo.lastLicense?.status === 'error'
                ? styles.statErr
                : drmInfo.lastLicense
                  ? styles.statOk
                  : ''
            }`}
          >
            {drmInfo.lastLicense?.status === 'error'
              ? 'ERROR'
              : drmInfo.lastLicense
                ? 'OK'
                : '—'}
          </div>
        </div>
      </div>

      {drmInfo.history.length > 0 && (
        <details className={styles.history}>
          <summary>
            Lịch sử {drmInfo.history.length} request gần nhất
          </summary>
          <table className={styles.histTable}>
            <thead>
              <tr>
                <th>#</th>
                <th>Time</th>
                <th>Status</th>
                <th>Req</th>
                <th>Resp</th>
                <th>Latency</th>
              </tr>
            </thead>
            <tbody>
              {drmInfo.history.map((h, idx) => (
                <tr
                  key={`${h.ts}-${idx}`}
                  className={h.status === 'error' ? styles.rowErr : ''}
                >
                  <td>{drmInfo.history.length - idx}</td>
                  <td>
                    {new Date(h.ts).toLocaleTimeString(undefined, {
                      hour12: false,
                    })}
                  </td>
                  <td>
                    {h.status === 'ok' ? '✓ ok' : '× err'}
                  </td>
                  <td>{formatBytes(h.requestBytes)}</td>
                  <td>{formatBytes(h.responseBytes)}</td>
                  <td>{formatTime(h.timeMs)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {drmInfo.lastLicense?.errorMessage && (
            <p className={styles.errMsg}>
              <strong>Last error:</strong>{' '}
              <code>{drmInfo.lastLicense.errorMessage}</code>
            </p>
          )}
        </details>
      )}
    </section>
  );
}
