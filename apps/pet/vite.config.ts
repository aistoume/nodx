import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standalone pet app — one entry, one tiny bundle.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1430, strictPort: true },
  envPrefix: ['VITE_', 'TAURI_ENV_*'],
  build: {
    rollupOptions: { input: { main: 'index.html', settings: 'settings.html' } },
    target: process.env.TAURI_ENV_PLATFORM === 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_ENV_DEBUG,
    sourcemap: !!process.env.TAURI_ENV_DEBUG,
  },
});
