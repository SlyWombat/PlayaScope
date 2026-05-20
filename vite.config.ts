import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const DEFAULT_PORT = Number(process.env.PLAYASCOPE_PORT ?? 5174);

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};
const APP_VERSION = pkg.version;

// DEPLOY_BASE controls the public URL prefix the bundle uses for `<script src=...>`
// and `import()` chunk URLs. Set it (e.g. '/playascope/') if you serve from a
// subpath. Default '/' covers root deploys.
const BASE = process.env.DEPLOY_BASE ?? '/';

export default defineConfig({
  base: BASE,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    target: 'es2022',
    sourcemap: true,
    chunkSizeWarningLimit: 1200,
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('echarts')) return 'vendor-echarts';
            if (id.includes('leaflet')) return 'vendor-leaflet';
            if (id.includes('react-dom')) return 'vendor-react';
            if (id.includes('react/')) return 'vendor-react';
            if (id.includes('zod')) return 'vendor-zod';
          }
        },
      },
    },
  },
  server: { port: DEFAULT_PORT, strictPort: false },
  preview: { port: DEFAULT_PORT, strictPort: false },
});
