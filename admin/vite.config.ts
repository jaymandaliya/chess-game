import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The API is proxied so the refresh-token cookie (path /api/v1/auth) stays same-origin in development
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: process.env.API_URL || 'http://localhost:4000', changeOrigin: false },
    },
  },
});
