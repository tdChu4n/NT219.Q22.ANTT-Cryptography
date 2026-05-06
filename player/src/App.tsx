import { useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header';
import VideoPlayer from './components/VideoPlayer';
import ManifestSelector from './components/ManifestSelector';
import QualityPanel from './components/QualityPanel';
import ContentInfo from './components/ContentInfo';
import LicensePanel from './components/LicensePanel';
import {
  DEFAULT_MANIFEST_ID,
  MOCK_MANIFESTS,
  type MockManifest,
} from './mocks/manifests';
import { useShakaPlayer } from './hooks/useShakaPlayer';
import styles from './App.module.css';

export default function App() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [selectedId, setSelectedId] = useState(DEFAULT_MANIFEST_ID);
  const [customUri, setCustomUri] = useState('');
  const [activeManifest, setActiveManifest] = useState<MockManifest | null>(
    null,
  );
  // Override license URL về /license (Vite proxy → cdn-sim → license-server).
  // Mặc định OFF — khi T2.4/T2.5 wire xong sẽ bật để chạy luồng nội bộ.
  const [overrideToInternal, setOverrideToInternal] = useState(false);

  const shaka = useShakaPlayer(videoRef);

  const selectedManifest = useMemo(
    () => MOCK_MANIFESTS.find((m) => m.id === selectedId) ?? null,
    [selectedId],
  );

  const loadManifest = (m: MockManifest) =>
    shaka
      .load(m, { overrideToInternalLicense: overrideToInternal })
      .then(() => setActiveManifest(m));

  // Tự load manifest mặc định 1 lần khi player attach xong (status === 'idle').
  useEffect(() => {
    if (!selectedManifest || activeManifest || shaka.status !== 'idle') return;
    void loadManifest(selectedManifest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedManifest, activeManifest, shaka.status]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const next = MOCK_MANIFESTS.find((m) => m.id === id);
    if (next) void loadManifest(next);
  };

  const handleReload = () => {
    if (!selectedManifest) return;
    void loadManifest(selectedManifest);
  };

  const handleLoadCustom = () => {
    const uri = customUri.trim();
    if (!uri) return;
    const custom: MockManifest = {
      id: 'custom',
      title: 'Custom URL',
      description: 'Manifest do người dùng nhập trực tiếp.',
      uri,
      format: uri.endsWith('.m3u8') ? 'HLS' : 'DASH',
      scheme: 'clear',
      source: 'public',
      securityLevel: 'CLEAR',
    };
    void loadManifest(custom);
  };

  const handleToggleOverride = (next: boolean) => {
    setOverrideToInternal(next);
    if (selectedManifest) {
      // Reload ngay với override mới để CDM đẩy challenge sang endpoint kế tiếp.
      void shaka
        .load(selectedManifest, { overrideToInternalLicense: next })
        .then(() => setActiveManifest(selectedManifest));
    }
  };

  const isCurrentDrm = !!selectedManifest?.drm?.keySystem;

  const statusLabel =
    shaka.status === 'ready'
      ? 'Sẵn sàng phát'
      : shaka.status === 'loading'
        ? 'Đang tải…'
        : shaka.status === 'error'
          ? 'Lỗi'
          : 'Chờ chọn manifest';

  return (
    <div className={styles.app}>
      <Header />

      <main className={styles.main}>
        <section className={styles.playerCol}>
          <VideoPlayer
            ref={videoRef}
            status={shaka.status}
            error={shaka.error}
            poster={activeManifest?.poster}
          />

          <div className={styles.statusBar} data-status={shaka.status}>
            <span className={styles.statusDot} />
            <span>{statusLabel}</span>
            {activeManifest && (
              <span className={styles.statusUri}>· {activeManifest.title}</span>
            )}
          </div>

          <ContentInfo manifest={activeManifest} />

          <LicensePanel
            drmInfo={shaka.drmInfo}
            pinStatus={shaka.pinStatus}
            overrideToInternal={overrideToInternal}
            onToggleOverride={handleToggleOverride}
            disabled={!isCurrentDrm || shaka.status === 'loading'}
          />
        </section>

        <aside className={styles.sideCol}>
          <ManifestSelector
            manifests={MOCK_MANIFESTS}
            selectedId={selectedId}
            onSelect={handleSelect}
            onReload={handleReload}
            customUri={customUri}
            onCustomUriChange={setCustomUri}
            onLoadCustom={handleLoadCustom}
            disabled={shaka.status === 'loading'}
          />

          <QualityPanel
            tracks={shaka.tracks}
            abrEnabled={shaka.abrEnabled}
            onSelect={shaka.selectTrack}
            onToggleAbr={shaka.enableAbr}
            disabled={shaka.status !== 'ready'}
          />

          <section className={styles.roadmap}>
            <h3>Roadmap · Sprint kế tiếp</h3>
            <ul>
              <li>
                <strong>T1.7 ✓</strong> Player EME → /license (demo Widevine
                L3)
              </li>
              <li>
                <strong>T2.4</strong> License Server: JWT entitlement +
                RSA-OAEP key wrap
              </li>
              <li>
                <strong>T2.5</strong> Device attestation + nonce chống replay
              </li>
              <li>T3 · Watermark overlay (user-id forensic)</li>
              <li>T4 · Telemetry + QoE metrics (license latency, TTFF)</li>
            </ul>
          </section>
        </aside>
      </main>

      <footer className={styles.footer}>
        <span>
          NT219 · Capstone — Player T1.7 (EME → /license → Widevine L3) ·{' '}
          <code>Vite + Shaka Player</code>
        </span>
      </footer>
    </div>
  );
}
