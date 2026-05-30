import { useNavigate } from 'react-router-dom';
import { MOVIES, getFeaturedMovie, type Movie } from '../data/movies';
import { AppHeader } from '../components/AppHeader';
import { Poster } from '../components/Poster';
import { Backdrop } from '../components/Backdrop';
import { Icon } from '../components/Icon';

const RAILS = [
  {
    id: 'drm',
    title: 'Nội dung được bảo vệ DRM',
    sub: 'AES-128-CTR · ClearKey',
    ids: ['bbb', 'sintel', 'tos', 'ed', 'spring'],
  },
  {
    id: 'new',
    title: 'Mới thêm tuần này',
    sub: '04 phim · cập nhật T6',
    ids: ['spring', 'cosmos', 'tos', 'caminandes', 'sintel'],
  },
  {
    id: 'free',
    title: 'Miễn phí xem thử',
    sub: 'Không cần tài khoản',
    ids: ['caminandes', 'cosmos', 'bbb', 'ed'],
  },
];

type RailProps = {
  title: string;
  sub: string;
  ids: string[];
  onCard: (id: string) => void;
};

function Rail({ title, sub, ids, onCard }: RailProps) {
  const movies = ids.map(id => MOVIES.find(m => m.id === id)).filter(Boolean) as Movie[];
  return (
    <div>
      <div className="rail-head">
        <div>
          <h3 className="rail-title">{title}</h3>
          <p className="rail-sub mono">{sub}</p>
        </div>
        <button className="rail-more">
          Xem tất cả <Icon name="chev" size={12} />
        </button>
      </div>
      <div className="rail-track">
        {movies.map((m, i) => (
          <div className="rail-card" key={i} onClick={() => onCard(m.id)}>
            <Poster movie={m} w={180} aspect="2/3" />
            <div className="rail-card-meta mono">
              <span>{m.year}</span>
              <span>·</span>
              <span>{m.dur}</span>
              <span>·</span>
              <span>{m.quality}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function HomePage() {
  const navigate = useNavigate();
  const featured = getFeaturedMovie();

  return (
    <div className="ss-root home-root">
      <AppHeader />

      <section className="hero">
        <div className="hero-bg">
          <Backdrop movie={featured} label={`HERO · ${featured.id.toUpperCase()}`} />
          <div className="hero-bg-fade" />
        </div>

        <div className="hero-content">
          <div className="hero-meta">
            <span className="mono hero-tag">▶ ĐANG ĐƯỢC XEM NHIỀU</span>
            <h1 className="hero-title">{featured.title}</h1>
            <div className="hero-row">
              {featured.drm && (
                <span className="badge drm">
                  <Icon name="lock" size={10} stroke={2} />AES-128-CTR
                </span>
              )}
              <span className="badge dot">{featured.year}</span>
              <span className="badge dot">{featured.dur}</span>
              <span className="badge dot">{featured.quality} · {featured.codec}</span>
              {featured.genre.slice(0, 1).map(g => (
                <span key={g} className="badge dot">{g}</span>
              ))}
            </div>
            <p className="hero-syn">{featured.synopsis}</p>
            <div className="hero-actions">
              <button
                className="btn btn-primary"
                onClick={() => navigate(`/watch/${featured.id}`)}
              >
                <Icon name="play" size={14} /> Phát ngay
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => navigate(`/movies/${featured.id}`)}
              >
                <Icon name="info" size={14} /> Chi tiết
              </button>
              <button className="btn-icon" title="Thêm vào danh sách">
                <Icon name="plus" size={16} />
              </button>
            </div>
          </div>
        </div>
      </section>

      <section className="rails">
        {RAILS.map(rail => (
          <Rail
            key={rail.id}
            title={rail.title}
            sub={rail.sub}
            ids={rail.ids}
            onCard={(id) => navigate(`/movies/${id}`)}
          />
        ))}
      </section>
    </div>
  );
}
