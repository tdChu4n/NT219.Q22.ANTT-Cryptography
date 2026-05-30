import { Link, useLocation } from 'react-router-dom';
import { Icon } from './Icon';

type AppHeaderProps = {
  solid?: boolean;
};

export const AppHeader = ({ solid = false }: AppHeaderProps) => {
  const { pathname } = useLocation();
  const active = pathname === '/' ? 'home' : pathname.startsWith('/library') ? 'library' : '';

  return (
    <header className={`ss-header ${solid ? 'solid' : ''}`}>
      <Link to="/" className="ss-logo">
        <div className="ss-logo-mark" />
        <span>SecureStream</span>
      </Link>

      <nav className="ss-nav">
        <Link to="/" className={active === 'home' ? 'active' : ''}>Trang chủ</Link>
        <Link to="/" className={active === 'library' ? 'active' : ''}>Thư viện</Link>
        <a style={{ cursor: 'default', opacity: 0.4 }}>Kho bảo mật</a>
        <a style={{ cursor: 'default', opacity: 0.4 }}>Trực tiếp</a>
      </nav>

      <div className="ss-search">
        <Icon name="search" size={14} />
        <input placeholder="Tìm phim, series, kênh…" defaultValue="" />
        <kbd>⌘K</kbd>
      </div>

      <button className="btn-icon" title="Thông báo">
        <Icon name="bell" size={14} />
      </button>

      <div className="ss-avatar">AN</div>
    </header>
  );
};
