import { defineConfig, type UserConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const host = process.env.TAURI_DEV_HOST;

export default defineConfig(
  (): UserConfig => ({
    plugins: [react(), tailwindcss()],

    // Tauri reserves ports 1420 / 1421 by convention so HMR survives the embedded webview.
    clearScreen: false,
    server: {
      port: 1420,
      strictPort: true,
      host: host ?? false,
      hmr: host ? { protocol: 'ws', host, port: 1421 } : undefined,
      watch: {
        ignored: ['**/src-tauri/**'],
      },
    },

    envPrefix: ['VITE_', 'TAURI_ENV_*'],
    build: {
      target:
        process.env.TAURI_ENV_PLATFORM === 'windows'
          ? 'chrome105'
          : 'safari13',
      minify: process.env.TAURI_ENV_DEBUG ? false : 'esbuild',
      sourcemap: !!process.env.TAURI_ENV_DEBUG,
      // Two entry points: the main app shell and the system-capture popover.
      rollupOptions: {
        input: {
          main: 'index.html',
          popover: 'popover.html',
        },
      },
    },
  }),
);
