import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon } from './Icon';

type AppHeaderProps = {
  solid?: boolean;
};

export const AppHeader = ({ solid = false }: AppHeaderProps) => {
  const { pathname }               = useLocation();
  const navigate                   = useNavigate();
  const { isAuthenticated, user, logout } = useAuth();

  const active = pathname === '/' ? 'home' : pathname.startsWith('/library') ? 'library' : '';

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  // Lấy 2 chữ cái đầu của tên hoặc email để hiển thị avatar
  const initials = (() => {
    if (!user) return 'AN';
    if (user.name) {
      const parts = user.name.trim().split(' ');
      return (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '');
    }
    return user.email.slice(0, 2).toUpperCase();
  })().toUpperCase();

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

      {isAuthenticated ? (
        <>
          <button className="btn-icon" title="Thông báo">
            <Icon name="bell" size={14} />
          </button>

          {/* Avatar + menu logout */}
          <div className="ss-user-menu">
            <div className="ss-avatar" title={user?.email}>{initials}</div>
            <div className="ss-user-dropdown">
              <div className="ss-user-info">
                <strong>{user?.name || user?.email}</strong>
                <span className="mono">{user?.role}</span>
              </div>
              <hr className="ss-user-divider" />
              <button className="ss-user-item" onClick={handleLogout}>
                <Icon name="back" size={13} /> Đăng xuất
              </button>
            </div>
          </div>
        </>
      ) : (
        <Link to="/login" className="btn btn-secondary btn-sm">
          <Icon name="lock" size={12} stroke={2} /> Đăng nhập
        </Link>
      )}
    </header>
  );
};
