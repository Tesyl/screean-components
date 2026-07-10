import path from 'node:path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import dts from 'vite-plugin-dts'

// Library build for the published `@tesyl/screean-components` package — distinct
// from vite.config.ts (which builds the multi-page demo SITE). Three ESM entries:
//   .            → src/index.ts             (vanilla hero `mount` + types)
//   ./react      → src/react/index.tsx      (<Screean*/> wrappers + <SixInkBackground/>)
//   ./components → src/components/public.ts (vanilla headless factories, Pattern A only)
// The engine, React, and the JSX runtime stay external (peers/deps) — bundling
// '@tesyl/screean/react' would ship a second provider context (the dual-module
// context bug). The 6ix glTF is bundled as an emitted asset (vite rewrites the
// `?url` import); most consumers override it via the `logoUrl` option anyway.
export default defineConfig({
  plugins: [react(), dts({ rollupTypes: true, include: ['src', 'site'] })],
  build: {
    lib: {
      entry: {
        index: path.resolve(__dirname, 'src/index.ts'),
        react: path.resolve(__dirname, 'src/react/index.tsx'),
        components: path.resolve(__dirname, 'src/components/public.ts'),
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
      output: {
        entryFileNames: '[name].js',
        // Every entry is browser-only; the blanket client banner keeps the
        // package Next.js-App-Router-friendly (mirrors the engine build).
        banner: "'use client';",
      },
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
