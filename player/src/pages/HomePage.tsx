import { useNavigate } from 'react-router-dom';
import { MOVIES, getFeaturedMovie, type Movie } from '../data/movies';
import { AppHeader } from '../components/AppHeader';
import { Poster } from '../components/Poster';
import { Backdrop } from '../components/Backdrop';
import { Icon } from '../components/Icon';

const RAILS = [
  {
    id: 'trending',
    title: 'Đang thịnh hành',
    sub: 'Xem nhiều nhất tuần này',
    ids: ['aaronswartz', 'citizenfour', 'mr-robot', 'zero-days', 'matrix', 'snowden'],
  },
  {
    id: 'new',
    title: 'Mới thêm gần đây',
    sub: 'Cập nhật tuần này',
    ids: ['aaronswartz', 'citizenfour', 'zero-days', 'snowden', 'deep-web'],
  },
  {
    id: 'documentary',
    title: 'Phim tài liệu',
    sub: 'Câu chuyện thật · Nhân vật thật',
    ids: ['citizenfour', 'zero-days', 'we-are-legion', 'snowden', 'deep-web', 'aaronswartz'],
  },
  {
    id: 'cinema',
    title: 'Phim điện ảnh',
    sub: 'Điện ảnh về công nghệ & thế giới số',
    ids: ['matrix', 'social-network', 'ex-machina', 'mr-robot', 'hackers', 'wargames'],
  },
  {
    id: 'classic',
    title: 'Phim kinh điển',
    sub: 'Những tác phẩm vượt thời gian',
    ids: ['wargames', 'hackers', 'matrix', 'social-network', 'ex-machina'],
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
            <Poster movie={m} w={180} aspect="2/3" title={true} />
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
          <Backdrop movie={featured} />
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
              <span className="badge dot">{featured.quality}</span>
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
