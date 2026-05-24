import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Vite config cho NT219 Player (Task T1.7 scaffold)
//
//  VM layout (host-only 192.168.155.x):
//    VM1 App  192.168.155.10:3000  — License Server (Node.js)
//    VM2 CDN  192.168.155.11:80   — Nginx CDN phục vụ /video/*
//
//  Proxy dev giúp tránh CORS và không cần TLS cert ở dev:
//    /video/*  → VM2 Nginx CDN (media segments + manifest)
//    /license  → VM1 License Server (DRM license endpoint)
//    /api/*    → VM1 License Server (auth login, health check)
export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: {
      '/video': {
        target: 'http://192.168.155.11',
        changeOrigin: true,
      },
      '/license': {
        target: 'http://192.168.155.10:3000',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://192.168.155.10:3000',
        changeOrigin: true,
      },
    },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
