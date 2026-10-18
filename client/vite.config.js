import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// VITE_BASE : sous-chemin de déploiement (ex. /Habits-Tracker/ sur GitHub Pages).
export default defineConfig({
  base: process.env.VITE_BASE || '/',
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3001',
    },
  },
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.{js,jsx}'],
    globals: true,
  },
});
