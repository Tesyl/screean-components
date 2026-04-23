import { defineConfig } from 'vite';
import path from 'node:path';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// screean is linked via `file:../screean` in package.json. By default Vite
// pre-bundles node_modules deps, but our file-linked engine needs to live
// in the dev module graph so HMR works when editing screean internals.
// Excluding it from optimizeDeps gets us that behavior.
//
// Two entries: the vanilla particle-components demo (`index.html`) and the
// html-in-canvas interop demo (`html-interop.html`). The interop entry
// imports React + Tailwind + shadcn; the vanilla entry does not pay that
// cost.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  optimizeDeps: {
    exclude: ['screean'],
  },
  build: {
    rollupOptions: {
      input: {
        main: path.resolve(__dirname, 'index.html'),
        htmlInterop: path.resolve(__dirname, 'html-interop.html'),
        components: path.resolve(__dirname, 'components.html'),
      },
    },
  },
  server: {
    port: 3100,
  },
});
