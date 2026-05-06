import { defineConfig, type Plugin } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// SPA fallback for the showcase site. Vite's dev server is file-based by
// default — a request to `/components` returns 404 because no `components`
// file exists. The site uses History API routing for `/`, `/components`,
// and `/experiments/*`, so we rewrite those (and ONLY those) to the site's
// `index.html`. Any path with an extension or matching one of the standalone
// demo entries is left alone.
const spaFallback = (): Plugin => ({
  name: 'screean-spa-fallback',
  configureServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url ?? '/';
      if (req.method !== 'GET') return next();
      const q = url.indexOf('?');
      const pathname = q >= 0 ? url.slice(0, q) : url;
      if (
        /^\/components\/?$/.test(pathname) ||
        /^\/experiments(?:\/[a-z0-9-]+)?\/?$/i.test(pathname) ||
        /^\/lab(?:\/[a-z0-9-]+)?\/?$/i.test(pathname) ||
        /^\/moonshot(?:\/[a-z0-9-]+)?\/?$/i.test(pathname)
      ) {
        req.url = '/index.html' + (q >= 0 ? url.slice(q) : '');
      }
      return next();
    });
  },
  configurePreviewServer(server) {
    server.middlewares.use((req, _res, next) => {
      const url = req.url ?? '/';
      if (req.method !== 'GET') return next();
      const q = url.indexOf('?');
      const pathname = q >= 0 ? url.slice(0, q) : url;
      if (
        /^\/components\/?$/.test(pathname) ||
        /^\/experiments(?:\/[a-z0-9-]+)?\/?$/i.test(pathname) ||
        /^\/lab(?:\/[a-z0-9-]+)?\/?$/i.test(pathname) ||
        /^\/moonshot(?:\/[a-z0-9-]+)?\/?$/i.test(pathname)
      ) {
        req.url = '/index.html' + (q >= 0 ? url.slice(q) : '');
      }
      return next();
    });
  },
});

// `screean` is linked via `file:../screean`. Excluding it from optimizeDeps
// keeps it in the dev module graph so HMR works when editing engine internals.
//
// Five entries:
//   index.html         — the showcase SPA (landing + components + experiments)
//   legacy-demo.html   — the original particle-components demo (kept for now)
//   components.html    — button-grid dissolve demo
//   html-interop.html  — html-in-canvas Phase 3a demo
//   routing-demo.html  — physics-as-routing-transition demo
export default defineConfig({
  plugins: [react(), tailwindcss(), spaFallback()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['screean'],
  },
  build: {
    target: 'esnext',
    sourcemap: true,
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        legacyDemo: path.resolve(__dirname, 'legacy-demo.html'),
        htmlInterop: path.resolve(__dirname, 'html-interop.html'),
        components: path.resolve(__dirname, 'components.html'),
        routing: path.resolve(__dirname, 'routing-demo.html'),
      },
    },
  },
  server: {
    port: 3100,
    // Bind to all interfaces (not just localhost) so devices on the same
    // LAN — phones, iOS Simulator running outside the host network namespace,
    // physical iPhones plugged in via USB — can reach the dev server.
    // In Vite output you'll now see a "Network: http://<lan-ip>:3100/" line
    // alongside the local URL.
    host: true,
    // Allow any Host header. Vite's default allow-list rejects unknown
    // hostnames (e.g. tunneled HTTPS URLs from cloudflared / ngrok),
    // which we need for testing WebGPU on devices that require a secure
    // context. `true` = allow-all, fine for local dev.
    allowedHosts: true,
  },
});
