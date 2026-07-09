import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

// Library build for the published `@tesyl/screean-components` package — distinct
// from vite.config.ts (which builds the multi-page demo SITE). Two ESM entries:
//   .       → src/index.ts        (vanilla hero `mount` + types)
//   ./react → src/react/index.tsx (<SixInkBackground/> wrapper)
// The engine, React, and the JSX runtime stay external (peers/deps). The 6ix
// glTF is bundled as an emitted asset (vite rewrites the `?url` import); most
// consumers override it via the `logoUrl` option anyway.
export default defineConfig({
  plugins: [react(), dts({ rollupTypes: true, include: ['src', 'site'] })],
  build: {
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        react: path.resolve(__dirname, 'src/react/index.tsx'),
      },
      formats: ['es'],
    },
    rollupOptions: {
      external: [
        '@tesyl/screean',
        '@tesyl/screean/react',
        'react',
        'react-dom',
        'react/jsx-runtime',
      ],
      output: { entryFileNames: '[name].js' },
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'esnext',
    // Keep small assets from base64-inlining. NOTE: vite library mode still
    // inlines the default 882 KB glTF (loaded lazily via `?url` in
    // sixShowcaseInk.ts) into its own async chunk as base64 — `assetsInlineLimit`
    // does not override lib-mode asset inlining. It's lazy (out of the eager
    // path) and consumers that pass `logoUrl` never fetch it; true binary
    // emission is a publish follow-up (needs an emitFile rollup plugin).
    assetsInlineLimit: 0,
  },
})
