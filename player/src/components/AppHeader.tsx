import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useTheme } from '../context/ThemeContext';
import { Icon } from './Icon';
import { UserMenu } from './UserMenu';

type AppHeaderProps = {
  solid?: boolean;
};

export const AppHeader = ({ solid = false }: AppHeaderProps) => {
  const { pathname }          = useLocation();
  const { isAuthenticated }   = useAuth();
  const { theme, toggleTheme } = useTheme();

  const active = pathname === '/' ? 'home' : pathname.startsWith('/library') ? 'library' : '';

  // UserMenu tự đóng khi click ngoài; đây chỉ để trigger re-render khi pathname đổi
  useEffect(() => {}, [pathname]);

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

      <button
        className="btn-icon"
        onClick={toggleTheme}
        title={theme === 'dark' ? 'Chuyển sang giao diện sáng' : 'Chuyển sang giao diện tối'}
        style={{ transition: 'transform .3s' }}
      >
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={15} />
      </button>

      {isAuthenticated ? (
        <>
          <button className="btn-icon" title="Thông báo">
            <Icon name="bell" size={14} />
          </button>
          <UserMenu />
        </>
      ) : (
        <Link to="/login" className="btn btn-secondary btn-sm">
          <Icon name="lock" size={12} stroke={2} /> Đăng nhập
        </Link>
      )}
    </header>
  );
};
