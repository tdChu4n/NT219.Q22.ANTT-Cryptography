import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Icon } from './Icon';

export function UserMenu() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onOutside);
    return () => document.removeEventListener('mousedown', onOutside);
  }, []);

  const handleLogout = () => {
    logout();
    navigate('/login', { replace: true });
  };

  const initials = (() => {
    if (!user) return 'AN';
    if (user.name) {
      const parts = user.name.trim().split(' ');
      return (parts[0]?.[0] ?? '') + (parts[parts.length - 1]?.[0] ?? '');
    }
    return user.email.slice(0, 2).toUpperCase();
  })().toUpperCase();

  return (
    <div className="ss-user-menu" ref={ref}>
      <div
        className="ss-avatar"
        title={user?.email}
        onClick={() => setOpen(o => !o)}
        style={{ cursor: 'pointer' }}
      >
        {initials}
      </div>
      {open && (
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
      )}
    </div>
  );
}
