import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Port de l'API (server/src/index.js, 3001 par défaut).
const API_PORT = process.env.API_PORT || 3001;

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': `http://127.0.0.1:${API_PORT}`,
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{js,jsx}'],
    globals: true,
  },
});
