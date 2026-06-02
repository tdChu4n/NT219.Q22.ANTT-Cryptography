import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { useAuth, type AuthUser } from '../context/AuthContext';
import { Icon } from '../components/Icon';

function generateHex(count: number): string {
  let s = 1234567;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(s.toString(16).slice(0, 2).padStart(2, '0').toUpperCase());
  }
  return out.join(' ');
}

type FieldProps = {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  rightLink?: { label: string; onClick: () => void };
  error?: boolean;
};

function Field({ label, type = 'text', placeholder, value, onChange, hint, rightLink, error }: FieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <div className="field-head">
        <label>{label}</label>
        {rightLink && (
          <button type="button" className="auth-link-inline"
            style={{ background: 'none', border: 'none', padding: 0 }}
            onClick={rightLink.onClick}
          >
            {rightLink.label}
          </button>
        )}
      </div>
      <div className="field-input">
        <input
          type={type === 'password' ? (show ? 'text' : 'password') : type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          style={error ? { borderColor: 'var(--danger, #ff6b6b)' } : undefined}
          autoComplete={type === 'password' ? 'current-password' : 'email'}
        />
        {type === 'password' && (
          <button type="button" className="field-eye" onClick={() => setShow(s => !s)} title="Hiển thị">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              {show
                ? <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></>
                : <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/><circle cx="12" cy="12" r="3"/></>
              }
            </svg>
          </button>
        )}
      </div>
      {hint && <span className="field-hint mono">{hint}</span>}
    </div>
  );
}

export default function LoginPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const { login } = useAuth();

  const [email,    setEmail]    = useState('demo@nt219.local');
  const [password, setPassword] = useState('');
  const [remember, setRemember] = useState(true);
  const [loading,  setLoading]  = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);

  // Sau khi đăng nhập thành công, quay về trang trước đó nếu có
  const from = (location.state as { from?: { pathname: string } } | null)?.from?.pathname ?? '/';

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      setApiError('Vui lòng nhập email và mật khẩu.');
      return;
    }
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch('/api/auth/login', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password }),
      });
      const data = await res.json() as { token?: string; user?: AuthUser; error?: string };

      if (!res.ok) {
        setApiError(data.error ?? `Lỗi ${res.status}`);
        return;
      }
      if (!data.token || !data.user) {
        setApiError('Phản hồi máy chủ không hợp lệ.');
        return;
      }

      login(data.token, data.user, remember);
      navigate(from, { replace: true });
    } catch {
      setApiError('Không kết nối được máy chủ. Hãy kiểm tra VM1.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ss-root auth-root">
      {/* Nền trang trí */}
      <div className="auth-bg">
        <div className="auth-bg-grid" />
        <div className="auth-bg-blob auth-bg-blob-1" />
        <div className="auth-bg-blob auth-bg-blob-2" />
        <div className="auth-bg-hex">{generateHex(500)}</div>
      </div>

      <div className="auth-shell">
        <div className="auth-form-wrap">
          <div className="auth-brand">
            <Link to="/" className="ss-logo" style={{ textDecoration: 'none', color: 'inherit' }}>
              <div className="ss-logo-mark" />
              <span>SecureStream</span>
            </Link>
          </div>

          <form className="auth-form" onSubmit={handleSubmit} noValidate>
            <div className="auth-form-head">
              <span className="mono auth-eyebrow">/ login</span>
              <h2>Chào mừng trở lại</h2>
              <p>Đăng nhập để tiếp tục phiên xem đã mã hoá của bạn.</p>
            </div>

            <div className="auth-fields">
              <Field label="Email" type="email"
                placeholder="you@securestream.io"
                value={email} onChange={setEmail}
                error={!!apiError}
              />
              <Field label="Mật khẩu" type="password"
                placeholder="••••••••"
                value={password} onChange={setPassword}
                rightLink={{ label: 'Quên mật khẩu?', onClick: () => {} }}
                error={!!apiError}
              />

              {/* Thông báo lỗi */}
              {apiError && (
                <div className="auth-error">
                  <Icon name="info" size={13} />
                  {apiError}
                </div>
              )}

              <div className="auth-row">
                <label className="check" onClick={() => setRemember(r => !r)} style={{ cursor: 'pointer' }}>
                  <span className={`check-box ${remember ? 'checked' : ''}`}>
                    {remember && <Icon name="check" size={10} stroke={3} />}
                  </span>
                  <span>Ghi nhớ thiết bị này 30 ngày</span>
                </label>
              </div>

              <button type="submit" className="btn btn-primary btn-block btn-xl" disabled={loading}>
                {loading ? (
                  <span className="auth-spinner" />
                ) : (
                  <Icon name="lock" size={13} stroke={2} />
                )}
                {loading ? 'Đang đăng nhập…' : 'Đăng nhập an toàn'}
                {!loading && <Icon name="arrow" size={14} />}
              </button>
            </div>

            <div className="auth-foot">
              <span>Chưa có tài khoản?</span>
              <Link to="/register" className="auth-link">
                Tạo tài khoản mới <Icon name="arrow" size={12} />
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
