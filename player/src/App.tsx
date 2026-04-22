import { useEffect, useMemo, useRef, useState } from 'react';
import Header from './components/Header';
import VideoPlayer from './components/VideoPlayer';
import ManifestSelector from './components/ManifestSelector';
import QualityPanel from './components/QualityPanel';
import ContentInfo from './components/ContentInfo';
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
  const [activeManifest, setActiveManifest] = useState<MockManifest | null>(null);

  const shaka = useShakaPlayer(videoRef);

  const selectedManifest = useMemo(
    () => MOCK_MANIFESTS.find((m) => m.id === selectedId) ?? null,
    [selectedId],
  );

  // Tự load manifest mặc định 1 lần khi player attach xong (status === 'idle')
  useEffect(() => {
    if (!selectedManifest || activeManifest || shaka.status !== 'idle') return;
    void shaka.load(selectedManifest).then(() => setActiveManifest(selectedManifest));
  }, [selectedManifest, activeManifest, shaka]);

  const handleSelect = (id: string) => {
    setSelectedId(id);
    const next = MOCK_MANIFESTS.find((m) => m.id === id);
    if (next) {
      void shaka.load(next).then(() => setActiveManifest(next));
    }
  };

  const handleReload = () => {
    if (!selectedManifest) return;
    void shaka.load(selectedManifest).then(() => setActiveManifest(selectedManifest));
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
    };
    void shaka.load(custom).then(() => setActiveManifest(custom));
  };

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
              <li>T2 · Tích hợp License Server (RSA-OAEP + JWT)</li>
              <li>T3 · Widevine/PlayReady request filter</li>
              <li>T4 · Telemetry + QoE metrics</li>
              <li>T5 · Watermark overlay (user-id)</li>
            </ul>
          </section>
        </aside>
      </main>

      <footer className={styles.footer}>
        <span>
          NT219 · Capstone — Player scaffold (Task T1.7) · React {/* note */}
          <code>Vite + Shaka Player</code>
        </span>
      </footer>
    </div>
  );
}
