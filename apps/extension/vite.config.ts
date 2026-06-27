import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import tailwindcss from '@tailwindcss/vite';
import { crx } from '@crxjs/vite-plugin';
import manifest from './manifest.json' with { type: 'json' };

export default defineConfig({
  plugins: [
    preact(),
    tailwindcss(),
    crx({ manifest }),
  ],
  build: {
    target: 'esnext',
    rollupOptions: {
      // Service worker must NOT have window references; keep its bundle separate
      output: {
        chunkFileNames: 'assets/chunk-[hash].js',
      },
    },
  },
});
