import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { readFileSync } from 'node:fs';

const DEFAULT_PORT = Number(process.env.DUST_PORT ?? 5174);

const pkg = JSON.parse(readFileSync(path.resolve(__dirname, 'package.json'), 'utf8')) as {
  version: string;
};
const APP_VERSION = pkg.version;

// DEPLOY_BASE controls the public URL prefix the bundle uses for `<script src=...>`
// and `import()` chunk URLs. The cPanel deploy script sets it to '/dust-analysis/'
// so the SPA can live at electricrv.ca/dust-analysis/. Default '/' for dev.
const BASE = process.env.DEPLOY_BASE ?? '/';

export default defineConfig({
  base: BASE,
  plugins: [react()],
  define: {
    __APP_VERSION__: JSON.stringify(APP_VERSION),
    // Unique per build — used to namespace the sessionStorage data cache so a
    // fresh deploy's data is never masked by a previous build's cache.
    __BUILD_ID__: JSON.stringify(Date.now().toString(36)),
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
  build: {
    target: 'es2022',
    // No production sourcemaps — they more than double the deploy payload
    // (the echarts vendor map alone is ~5.5 MB) and only matter in devtools.
    // Run a local `npm run build` with this flipped if you need to debug prod.
    sourcemap: false,
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
