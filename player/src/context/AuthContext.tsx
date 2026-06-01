import {
  createContext,
  useContext,
  useState,
  useEffect,
  type ReactNode,
} from 'react';

export type AuthUser = {
  userId: string;
  email: string;
  name: string;
  role: string;
};

type AuthState = {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
};

const AuthContext = createContext<AuthState | null>(null);

export const TOKEN_KEY = 'ss_token';

/** Giải mã JWT payload (không verify chữ ký — chỉ để đọc exp/claims). */
function decodePayload(token: string): Record<string, unknown> | null {
  try {
    const [, b64] = token.split('.');
    return JSON.parse(atob(b64.replace(/-/g, '+').replace(/_/g, '/')));
  } catch {
    return null;
  }
}

/** Trả true nếu token chưa hết hạn (có buffer 60s). */
function isTokenValid(token: string): boolean {
  const payload = decodePayload(token);
  if (!payload || typeof payload.exp !== 'number') return false;
  return payload.exp * 1000 > Date.now() + 60_000;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);

  // Khôi phục session từ localStorage khi load lần đầu
  useEffect(() => {
    const stored = localStorage.getItem(TOKEN_KEY);
    if (stored && isTokenValid(stored)) {
      const payload = decodePayload(stored) as Record<string, string>;
      setToken(stored);
      setUser({
        userId: payload['userId'] ?? '',
        email:  payload['email']  ?? '',
        name:   payload['name']   ?? '',
        role:   payload['role']   ?? 'user',
      });
    } else if (stored) {
      // Token hết hạn — dọn dẹp
      localStorage.removeItem(TOKEN_KEY);
    }
  }, []);

  const login = (newToken: string, newUser: AuthUser) => {
    localStorage.setItem(TOKEN_KEY, newToken);
    setToken(newToken);
    setUser(newUser);
  };

  const logout = () => {
    localStorage.removeItem(TOKEN_KEY);
    setToken(null);
    setUser(null);
  };

  return (
    <AuthContext.Provider
      value={{ token, user, isAuthenticated: !!token, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth phải dùng bên trong <AuthProvider>');
  return ctx;
}

/** Lấy token hiện tại từ localStorage (dùng trong hook không có context). */
export function getStoredToken(): string | null {
  const t = localStorage.getItem(TOKEN_KEY);
  return t && isTokenValid(t) ? t : null;
}
