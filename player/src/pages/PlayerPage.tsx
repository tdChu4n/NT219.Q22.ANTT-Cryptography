import { useRef, useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { getMovieById, MOVIES } from '../data/movies';
import { MOCK_MANIFESTS, type MockManifest } from '../mocks/manifests';
import { useShakaPlayer } from '../hooks/useShakaPlayer';
import { useAuth } from '../context/AuthContext';
import VideoPlayer from '../components/VideoPlayer';
import VideoControls from '../components/VideoControls';
import QualityPanel from '../components/QualityPanel';
import LogPanel from '../components/LogPanel';
import { Icon } from '../components/Icon';
import { Poster } from '../components/Poster';

function SideSection({ title, icon, children }: { title: string; icon: string; children: React.ReactNode }) {
  return (
    <section className="sd-sec">
      <header className="sd-head">
        <Icon name={icon} size={12} />
        <span className="mono">{title}</span>
      </header>
      <div className="sd-body">{children}</div>
    </section>
  );
}

export default function PlayerPage() {
  const { id }     = useParams<{ id: string }>();
  const navigate   = useNavigate();
  const { user }   = useAuth();
  const m = getMovieById(id ?? '') ?? MOVIES[0]!;

  // Phim chưa khả dụng → redirect về detail page
  useEffect(() => {
    if (!m.available) {
      navigate(`/movies/${m.id}`, { replace: true });
    }
  }, [m, navigate]);

  const videoRef                            = useRef<HTMLVideoElement>(null);
  const [activeManifest, setActiveManifest] = useState<MockManifest | null>(null);

  const shaka = useShakaPlayer(videoRef);

  const manifest = useMemo(
    () => MOCK_MANIFESTS.find(mn => mn.id === m.manifestId) ?? null,
    [m.manifestId],
  );

  const loadManifest = (mn: MockManifest) =>
    shaka.load(mn).then(() => setActiveManifest(mn));

  // Unload chỉ khi m.id THAY ĐỔI sau lần mount đầu (tránh cắt ngang load ban đầu)
  const prevIdRef = useRef(m.id);
  useEffect(() => {
    if (prevIdRef.current === m.id) return; // bỏ qua lần mount đầu
    prevIdRef.current = m.id;
    setActiveManifest(null);
    void shaka.unload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.id]);

  useEffect(() => {
    if (!manifest || activeManifest || shaka.status !== 'idle') return;
    void loadManifest(manifest);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [manifest, activeManifest, shaka.status]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (shaka.status !== 'ready') return;
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'select' || tag === 'textarea') return;
      switch (e.key) {
        case ' ': case 'k': case 'K': e.preventDefault(); shaka.togglePlay(); break;
        case 'ArrowLeft': case 'j': case 'J': e.preventDefault(); shaka.seekBy(-5); break;
        case 'ArrowRight': case 'l': case 'L': e.preventDefault(); shaka.seekBy(5); break;
        case 'm': case 'M': e.preventDefault(); shaka.toggleMute(); break;
        case 'f': case 'F': e.preventDefault(); shaka.requestFullscreen(); break;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [shaka]);

  const nextMovie = MOVIES.find(mv => mv.id !== m.id && mv.genre.some(g => m.genre.includes(g)));

  const initials = (() => {
    if (!user) return 'AN';
    if (user.name) {
      const parts = user.name.trim().split(' ');
      return (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '');
    }
    return user.email.slice(0, 2).toUpperCase();
  })().toUpperCase();

  return (
    <div className="ss-root player-root">
      {/* Top bar */}
      <header className="player-top">
        <button className="btn btn-ghost" onClick={() => navigate(`/movies/${m.id}`)}>
          <Icon name="back" size={14} /> Quay lại
        </button>
        <div className="player-top-title">
          <span className="mono player-top-id">/watch/{m.id}</span>
          <span className="player-top-sep">·</span>
          <strong>{m.title}</strong>
          {m.drm && <span className="badge drm"><Icon name="lock" size={10} stroke={2} />DRM</span>}
        </div>
        <div className="player-top-right">
          <div className="ss-avatar" title={user?.email}>{initials}</div>
        </div>
      </header>

      {/* Main grid */}
      <div className="player-grid">
        {/* Left: video + controls */}
        <div className="player-stage">
          <VideoPlayer
            ref={videoRef}
            status={shaka.status}
            error={shaka.error}
            poster={activeManifest?.poster}
            paused={shaka.playback.paused}
            onTogglePlay={shaka.togglePlay}
            onFullscreen={shaka.requestFullscreen}
          />

          <VideoControls
            playback={shaka.playback}
            tracks={shaka.tracks}
            abrEnabled={shaka.abrEnabled}
            onTogglePlay={shaka.togglePlay}
            onSeekTo={shaka.seekTo}
            onSeekBy={shaka.seekBy}
            onSetVolume={shaka.setVolume}
            onToggleMute={shaka.toggleMute}
            onSetRate={shaka.setPlaybackRate}
            onSelectTrack={shaka.selectTrack}
            onToggleAbr={shaka.enableAbr}
            onFullscreen={shaka.requestFullscreen}
            disabled={shaka.status !== 'ready'}
          />

          {/* Now playing / next */}
          <div className="player-next">
            <div className="next-now">
              <span className="mono lbl">ĐANG XEM</span>
              <h3>{m.title}</h3>
              <p>{m.director} · {m.year} · {m.dur}</p>
            </div>
            {nextMovie && (
              <div className="next-up">
                <span className="mono lbl">TIẾP THEO</span>
                <div className="next-row">
                  <div className="next-thumb">
                    <Poster movie={nextMovie} w="100%" aspect="16/9" badge={false} title={false} />
                  </div>
                  <div className="next-info">
                    <strong>{nextMovie.title}</strong>
                    <p>{nextMovie.director} · {nextMovie.year} · {nextMovie.dur}</p>
                    <div className="next-actions">
                      <button className="btn btn-ghost btn-sm">Bỏ qua</button>
                      <button
                        className="btn btn-secondary btn-sm"
                        onClick={() => navigate(`/watch/${nextMovie.id}`)}
                      >
                        Phát ngay <Icon name="play" size={11} />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right sidebar */}
        <aside className="player-side">
          <SideSection title="Phiên phát" icon="dot">
            <div className="sd-row">
              <span>trạng thái</span>
              <span className={shaka.status === 'ready' ? 'ok mono' : 'mono'}>
                <Icon name="dot" size={8} /> {shaka.status}
              </span>
            </div>
            <div className="sd-row">
              <span>thời lượng</span>
              <span className="mono">
                {Math.floor(shaka.playback.currentTime / 60)}:{String(Math.floor(shaka.playback.currentTime % 60)).padStart(2, '0')}
                {' / '}
                {Math.floor(shaka.playback.duration / 60)}:{String(Math.floor(shaka.playback.duration % 60)).padStart(2, '0')}
              </span>
            </div>
            {shaka.lastTtff && (
              <div className="sd-row">
                <span>ttff</span>
                <span className="mono ok">{shaka.lastTtff.timeMs} ms</span>
              </div>
            )}
          </SideSection>

          <QualityPanel
            tracks={shaka.tracks}
            abrEnabled={shaka.abrEnabled}
            playback={shaka.playback}
            onSelect={shaka.selectTrack}
            onToggleAbr={shaka.enableAbr}
            disabled={shaka.status !== 'ready'}
          />

          {m.drm && (
            <SideSection title="Bảo mật · DRM" icon="shield">
              <div className="sd-row">
                <span>encryption</span>
                <span className="mono">AES-128-CTR</span>
              </div>
              <div className="sd-row">
                <span>key system</span>
                <span className="mono">org.w3.clearkey</span>
              </div>
              {shaka.drmInfo.licenseRequests > 0 && (
                <div className="sd-row">
                  <span>license</span>
                  <span className="ok mono">{shaka.drmInfo.lastLicense?.timeMs ?? '—'} ms</span>
                </div>
              )}
              {shaka.drmInfo.keyIds.length > 0 && (
                <div className="sd-row">
                  <span>kid</span>
                  <span className="mono" style={{ fontSize: 9 }}>
                    {shaka.drmInfo.keyIds[0]?.slice(0, 8)}…
                  </span>
                </div>
              )}
            </SideSection>
          )}
        </aside>
      </div>

      {/* Event log — toàn chiều rộng, luôn hiển thị ở dưới cùng */}
      <section className="player-log-bar">
        <div className="player-log-bar-head">
          <Icon name="wave" size={13} />
          <span className="mono">Security Event Log</span>
          <span className="mono player-log-bar-count">{shaka.logs.length} sự kiện</span>
        </div>
        <div className="player-log-bar-body">
          <LogPanel logs={shaka.logs} onClear={shaka.clearLogs} />
        </div>
      </section>
    </div>
  );
}
