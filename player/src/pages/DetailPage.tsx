import { useParams, useNavigate } from 'react-router-dom';
import { getMovieById, MOVIES } from '../data/movies';
import { AppHeader } from '../components/AppHeader';
import { Poster } from '../components/Poster';
import { Backdrop } from '../components/Backdrop';
import { Icon } from '../components/Icon';

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="block">
      <h3 className="block-title">{title}</h3>
      {children}
    </section>
  );
}

function Crew({ role, name }: { role: string; name: string }) {
  return (
    <div className="crew">
      <span className="crew-role">{role}</span>
      <span className="crew-name">{name}</span>
    </div>
  );
}

export default function DetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const m = getMovieById(id ?? '') ?? MOVIES[0]!;

  const similar = MOVIES.filter(mv => mv.id !== m.id && mv.genre.some(g => m.genre.includes(g))).slice(0, 5);

  return (
    <div className="ss-root detail-root">
      <AppHeader />

      <section className="detail-hero">
        <div className="detail-bg">
          <Backdrop movie={m} />
          <div className="detail-bg-fade" />
        </div>

        <div className="detail-back">
          <button className="btn-icon" onClick={() => navigate(-1)}>
            <Icon name="back" size={16} />
          </button>
          <span className="mono detail-crumb">
            Thư viện / {m.genre[0]} / {m.title}
          </span>
        </div>

        <div className="detail-info">
          <div className="detail-poster">
            <Poster movie={m} w={200} aspect="2/3" badge={false} title={false} />
          </div>

          <div className="detail-info-main">
            <span className="mono detail-eyebrow">
              {m.genre.join(' · ').toUpperCase()} · BLENDER OPEN MOVIE · {m.year}
            </span>
            <h1 className="detail-title">{m.title}</h1>

            <div className="detail-metarow">
              <span className="rating">
                <Icon name="dot" size={8} /> 8.4 <span className="rating-out">/10</span>
              </span>
              <span className="metasep">•</span>
              <span>{m.year}</span>
              <span className="metasep">•</span>
              <span>{m.dur}</span>
              <span className="metasep">•</span>
              <span>{m.quality} · HDR10</span>
            </div>

            <div className="detail-badges">
              {m.drm ? (
                <>
                  <span className="badge drm"><Icon name="lock" size={10} stroke={2} />AES-128-CTR</span>
                  <span className="badge drm">CLEARKEY DRM</span>
                </>
              ) : (
                <span className="badge clear">CLEAR</span>
              )}
              <span className="badge">HDR10</span>
              <span className="badge">{m.codec}</span>
              <span className="badge">VI · EN SUB</span>
            </div>

            <p className="detail-syn">{m.synopsis}</p>

            <div className="detail-actions">
              {m.available ? (
                <button
                  className="btn btn-primary btn-xl"
                  onClick={() => navigate(`/watch/${m.id}`)}
                >
                  <Icon name="play" size={15} /> Phát ngay
                </button>
              ) : (
                <button className="btn btn-secondary btn-xl" disabled style={{ opacity: 0.5, cursor: 'not-allowed' }}>
                  <Icon name="lock" size={15} stroke={2} /> Sắp ra mắt
                </button>
              )}
              <button className="btn btn-secondary">
                <Icon name="film" size={14} /> Xem trailer
              </button>
              <button className="btn-icon" title="Thêm vào danh sách">
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="detail-body">
        <div className="detail-body-grid">
          <div className="detail-body-main">
            <Block title="Tóm tắt">
              <p className="block-text">{m.synopsis}</p>
            </Block>

            <Block title="Đoàn phim">
              <div className="crew-grid">
                <Crew role="Đạo diễn" name={m.director} />
                <Crew role="Kịch bản" name={m.director} />
                <Crew role="Nhạc phim" name="Jan Morgenstern" />
                <Crew role="Sản xuất" name="Blender Institute" />
              </div>
            </Block>
          </div>

          <aside className="detail-body-aside">
            <div className="play-card">
              <span className="mono play-card-tag">Bắt đầu xem</span>
              <div className="play-bar">
                <div className="play-bar-fill" style={{ width: '0%' }} />
              </div>
              {m.available ? (
                <button
                  className="btn btn-accent btn-block"
                  onClick={() => navigate(`/watch/${m.id}`)}
                >
                  <Icon name="play" size={13} /> Xem ngay
                </button>
              ) : (
                <button className="btn btn-secondary btn-block" disabled style={{ opacity: 0.5 }}>
                  Sắp ra mắt
                </button>
              )}
            </div>
          </aside>
        </div>

        {similar.length > 0 && (
          <div className="similar">
            <h3 className="rail-title">Tương tự</h3>
            <div className="similar-track">
              {similar.map((sm, i) => (
                <div
                  className="rail-card"
                  key={i}
                  onClick={() => navigate(`/movies/${sm.id}`)}
                >
                  <Poster movie={sm} w={170} aspect="2/3" />
                  <div className="rail-card-meta mono">
                    <span>{sm.year}</span><span>·</span><span>{sm.dur}</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
