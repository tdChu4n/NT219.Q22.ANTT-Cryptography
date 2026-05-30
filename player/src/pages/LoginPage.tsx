import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
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
};

function Field({ label, type = 'text', placeholder, value, onChange, hint, rightLink }: FieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <div className="field-head">
        <label>{label}</label>
        {rightLink && (
          <button
            type="button"
            className="auth-link-inline"
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
        />
        {type === 'password' && (
          <button type="button" className="field-eye" onClick={() => setShow(s => !s)} title="Hiển thị">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
              <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7z"/>
              <circle cx="12" cy="12" r="3"/>
            </svg>
          </button>
        )}
      </div>
      {hint && <span className="field-hint mono">{hint}</span>}
    </div>
  );
}

export default function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState('an.nguyen@securestream.io');
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    navigate('/');
  };

  return (
    <div className="ss-root auth-root">
      {/* Decorative background */}
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

          <form className="auth-form" onSubmit={handleSubmit}>
            <div className="auth-form-head">
              <span className="mono auth-eyebrow">/ login</span>
              <h2>Chào mừng trở lại</h2>
              <p>Đăng nhập để tiếp tục phiên xem đã mã hoá của bạn.</p>
            </div>

            <div className="auth-fields">
              <Field
                label="Email"
                placeholder="you@securestream.io"
                value={email}
                onChange={setEmail}
                hint="Tài khoản gắn với khoá DRM"
              />
              <Field
                label="Mật khẩu"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={setPassword}
                rightLink={{ label: 'Quên mật khẩu?', onClick: () => {} }}
              />

              <div className="auth-row">
                <label className="check">
                  <span className="check-box checked">
                    <Icon name="check" size={10} stroke={3} />
                  </span>
                  <span>Ghi nhớ thiết bị này trong 30 ngày</span>
                </label>
                <span className="mono auth-tiny">session · jwt · 24h</span>
              </div>

              <button type="submit" className="btn btn-primary btn-block btn-xl">
                <Icon name="lock" size={13} stroke={2} />
                Đăng nhập an toàn
                <Icon name="arrow" size={14} />
              </button>
            </div>

            <div className="auth-foot">
              <span>Chưa có tài khoản?</span>
              <Link to="/" className="auth-link">
                Tạo tài khoản mới <Icon name="arrow" size={12} />
              </Link>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
