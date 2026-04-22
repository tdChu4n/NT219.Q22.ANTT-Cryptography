import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config cho NT219 Player (Task T1.7 scaffold)
//   - Proxy /video/* → cdn-sim (port 8080)  → tránh CORS khi dev.
//   - Proxy /license   → license-server qua cdn-sim cũng port 8080.
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/video': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
      '/license': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
