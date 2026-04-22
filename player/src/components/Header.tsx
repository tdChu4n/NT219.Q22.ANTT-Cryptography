import styles from './Header.module.css';

type HeaderProps = {
  user?: { name: string; role: string } | null;
};

export default function Header({ user = null }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.brand}>
        <div className={styles.logo} aria-hidden>
          <svg viewBox="0 0 64 64" width="28" height="28">
            <defs>
              <linearGradient id="hdg" x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stopColor="#5b8cff" />
                <stop offset="100%" stopColor="#7d5bff" />
              </linearGradient>
            </defs>
            <rect width="64" height="64" rx="12" fill="url(#hdg)" />
            <path d="M24 18 L46 32 L24 46 Z" fill="#fff" />
          </svg>
        </div>
        <div>
          <div className={styles.title}>NT219 · Secure Streaming</div>
          <div className={styles.subtitle}>Shaka Player · DRM Demo (T1.7)</div>
        </div>
      </div>

      <nav className={styles.nav}>
        <a href="#player">Player</a>
        <a
          href="https://shaka-player-demo.appspot.com/docs/api/index.html"
          target="_blank"
          rel="noreferrer"
        >
          Shaka Docs
        </a>
      </nav>

      <div className={styles.user}>
        {user ? (
          <>
            <span className={styles.userName}>{user.name}</span>
            <span className={styles.userRole}>{user.role}</span>
          </>
        ) : (
          <button type="button" className="primary" disabled title="Sẽ triển khai ở Sprint 2">
            Đăng nhập (mock)
          </button>
        )}
      </div>
    </header>
  );
}
