import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth, type AuthUser } from '../context/AuthContext';
import { Icon } from '../components/Icon';

function generateHex(count: number): string {
  let s = 9876543;
  const out: string[] = [];
  for (let i = 0; i < count; i++) {
    s = (s * 9301 + 49297) % 233280;
    out.push(s.toString(16).slice(0, 2).padStart(2, '0').toUpperCase());
  }
  return out.join(' ');
}

/** Đánh giá độ mạnh mật khẩu: 0–4 */
function passwordStrength(pw: string): number {
  if (!pw) return 0;
  let score = 0;
  if (pw.length >= 8)  score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/[0-9]/.test(pw)) score++;
  if (/[^A-Za-z0-9]/.test(pw)) score++;
  return Math.min(score, 4);
}

const STRENGTH_LABEL = ['', 'Yếu', 'Trung bình', 'Khá', 'Mạnh'];
const STRENGTH_COLOR = ['', '#ef4444', '#facc15', 'var(--accent)', 'var(--ok)'];

function StrengthMeter({ level }: { level: number }) {
  if (!level) return null;
  return (
    <div className="strength">
      {[1, 2, 3, 4].map(i => (
        <span key={i} className="strength-bar"
          style={{ background: i <= level ? STRENGTH_COLOR[level] : 'var(--bg-3)' }}
        />
      ))}
      <span className="strength-label" style={{ color: STRENGTH_COLOR[level] }}>
        {STRENGTH_LABEL[level]}
      </span>
    </div>
  );
}

function PasswordRule({ pass, label }: { pass: boolean; label: string }) {
  return (
    <li className={`rule ${pass ? 'pass' : ''}`}>
      {pass ? <Icon name="check" size={10} stroke={3} /> : <span className="rule-dot" />}
      {' '}{label}
    </li>
  );
}

type FieldProps = {
  label: string;
  type?: string;
  placeholder?: string;
  value: string;
  onChange: (v: string) => void;
  hint?: string;
  error?: string;
  children?: React.ReactNode;
};

function Field({ label, type = 'text', placeholder, value, onChange, hint, error, children }: FieldProps) {
  const [show, setShow] = useState(false);
  return (
    <div className="field">
      <div className="field-head"><label>{label}</label></div>
      <div className="field-input">
        <input
          type={type === 'password' ? (show ? 'text' : 'password') : type}
          placeholder={placeholder}
          value={value}
          onChange={e => onChange(e.target.value)}
          autoComplete={type === 'password' ? 'new-password' : type === 'email' ? 'email' : 'off'}
          style={error ? { borderColor: 'var(--danger, #ff6b6b)' } : undefined}
        />
        {type === 'password' && (
          <button type="button" className="field-eye" onClick={() => setShow(s => !s)}>
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
      {error && <span className="field-hint" style={{ color: 'var(--danger, #ff6b6b)' }}>{error}</span>}
      {children}
    </div>
  );
}

export default function RegisterPage() {
  const navigate   = useNavigate();
  const { login }  = useAuth();

  const [name,     setName]     = useState('');
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [agreed,   setAgreed]   = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [apiError, setApiError] = useState<string | null>(null);
  const [fieldErr, setFieldErr] = useState<Record<string, string>>({});

  const strength = passwordStrength(password);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs['name'] = 'Vui lòng nhập họ tên';
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errs['email'] = 'Email không hợp lệ';
    if (password.length < 8) errs['password'] = 'Mật khẩu ít nhất 8 ký tự';
    if (!agreed) errs['terms'] = 'Bạn cần đồng ý với điều khoản';
    setFieldErr(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;
    setLoading(true);
    setApiError(null);
    try {
      const res = await fetch('/api/auth/register', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ email, password, name: name.trim() }),
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

      login(data.token, data.user);
      navigate('/', { replace: true });
    } catch {
      setApiError('Không kết nối được máy chủ. Hãy kiểm tra VM1.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="ss-root auth-root">
      <div className="auth-bg">
        <div className="auth-bg-grid" />
        <div className="auth-bg-blob auth-bg-blob-1" />
        <div className="auth-bg-blob auth-bg-blob-2" />
        <div className="auth-bg-hex">{generateHex(700)}</div>
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
              <span className="mono auth-eyebrow">/ register · bước 1 / 1</span>
              <h2>Tạo tài khoản SecureStream</h2>
              <p>Bắt đầu dùng thử — không cần thẻ tín dụng.</p>
            </div>

            <div className="auth-fields">
              <Field label="Họ và tên" placeholder="Nguyễn Văn An"
                value={name} onChange={setName} error={fieldErr['name']} />

              <Field label="Email" type="email" placeholder="you@example.com"
                value={email} onChange={setEmail}
                error={fieldErr['email']}
              />

              <Field label="Mật khẩu" type="password" placeholder="Tối thiểu 8 ký tự"
                value={password} onChange={setPassword} error={fieldErr['password']}
              >
                <StrengthMeter level={strength} />
                <ul className="rules">
                  <PasswordRule pass={password.length >= 8}  label="Ít nhất 8 ký tự" />
                  <PasswordRule pass={/[A-Z]/.test(password) && /[a-z]/.test(password)} label="Có chữ hoa & thường" />
                  <PasswordRule pass={/[0-9]/.test(password)}    label="Có số" />
                  <PasswordRule pass={/[^A-Za-z0-9]/.test(password)} label="Có ký tự đặc biệt" />
                </ul>
              </Field>

              {apiError && (
                <div className="auth-error">
                  <Icon name="info" size={13} />
                  {apiError}
                </div>
              )}

              <label className="check check-block" style={{ cursor: 'pointer' }}
                onClick={() => { setAgreed(a => !a); setFieldErr(e => ({ ...e, terms: '' })); }}
              >
                <span className={`check-box ${agreed ? 'checked' : ''}`} style={{ marginTop: 2 }}>
                  {agreed && <Icon name="check" size={10} stroke={3} />}
                </span>
                <span>
                  Tôi đồng ý với{' '}
                  <a className="auth-link-inline" onClick={e => e.stopPropagation()}>điều khoản dịch vụ</a>
                  {' '}và{' '}
                  <a className="auth-link-inline" onClick={e => e.stopPropagation()}>chính sách bảo mật</a>.
                  {fieldErr['terms'] && (
                    <span style={{ display: 'block', color: 'var(--danger, #ff6b6b)', fontSize: 11, marginTop: 4 }}>
                      {fieldErr['terms']}
                    </span>
                  )}
                </span>
              </label>

              <button type="submit" className="btn btn-primary btn-block btn-xl" disabled={loading}>
                {loading ? <span className="auth-spinner" /> : null}
                {loading ? 'Đang tạo tài khoản…' : 'Tạo tài khoản'}
                {!loading && <Icon name="arrow" size={14} />}
              </button>

              <p className="auth-tiny-foot">
                Đã có tài khoản?{' '}
                <Link to="/login" className="auth-link-inline" style={{ fontSize: 13 }}>
                  Đăng nhập tại đây
                </Link>
              </p>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
