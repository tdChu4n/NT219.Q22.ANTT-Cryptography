import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { ProtectedRoute } from './components/ProtectedRoute';
import HomePage     from './pages/HomePage';
import DetailPage   from './pages/DetailPage';
import PlayerPage   from './pages/PlayerPage';
import LoginPage    from './pages/LoginPage';
import RegisterPage from './pages/RegisterPage';

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/"           element={<HomePage />} />
          <Route path="/movies/:id" element={<DetailPage />} />
          <Route path="/login"      element={<LoginPage />} />
          <Route path="/register"   element={<RegisterPage />} />

          {/* Route được bảo vệ — yêu cầu đăng nhập */}
          <Route path="/watch/:id" element={
            <ProtectedRoute>
              <PlayerPage />
            </ProtectedRoute>
          } />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
