import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

type Props = { children: React.ReactNode };

/**
 * Bảo vệ route — redirect về /login nếu chưa đăng nhập.
 * Lưu lại path hiện tại trong location.state.from để sau khi
 * login xong có thể redirect về đúng trang.
 */
export function ProtectedRoute({ children }: Props) {
  const { isAuthenticated } = useAuth();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  return <>{children}</>;
}
