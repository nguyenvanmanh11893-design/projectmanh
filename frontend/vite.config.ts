import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  const isDev = mode === 'development';
  const backendTarget = env.VITE_BACKEND_URL || 'http://localhost:3000';

  return {
    plugins: [react()],
    // server and proxy are development-only settings used by Vite dev server.
    // They are never bundled into the production static build (vite build).
    server: isDev
      ? {
          port: 5173,
          proxy: {
            '/api': {
              target: backendTarget,
              changeOrigin: true,
              configure: (proxy) => {
                proxy.on('proxyReq', (proxyReq) => {
                  // Development only: set Origin to match backend host
                  // to satisfy backend validateOrigin CSRF middleware during Vite dev.
                  // In production, the SPA is served directly from the same origin by backend/Nginx,
                  // so the browser sets the native Origin header automatically.
                  const url = new URL(backendTarget);
                  proxyReq.setHeader('Origin', url.origin);
                });
              }
            }
          }
        }
      : undefined,
    build: {
      outDir: 'dist',
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'react-router-dom'],
            antd: ['antd', '@ant-design/icons']
          }
        }
      }
    }
  };
});
