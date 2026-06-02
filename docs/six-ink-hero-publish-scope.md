# Six-Ink Hero — Publishing & Embedding Scope

Scope for making the **six-showcase · ink** experiment consumable as an embeddable
hero (WebGPU + fallback) in an external React app (theGreenRoom). Covers the
`screean` (engine) and `screean-components` repos only. GreenRoom-side changes
are tracked separately.

Status: **scoping** (not yet implemented). Date: 2026-05-30.

---

## Framing decision: publish target

Both repos are private under `Tesyl`; GreenRoom deploys on Vercel with bun.

| Option | Consumer friction | Privacy | Notes |
|---|---|---|---|
| Public scoped npm (`@tesyl/…`) | none (no auth on Vercel) | public | simplest |
| GitHub Packages (scoped) | `.npmrc` + `NODE_AUTH_TOKEN` in Vercel | private | robust + private |
| git dependency + `prepare` build | builds on install | private | no registry, fragile |

**Both packages must ship a compiled build (ESM JS + `.d.ts`)** regardless —
today their `exports` point at raw `./src/*.ts`, which only works via sibling
`file:` linking under Vite.

---

## Repo A — `screean` (engine)

The public API already exports all 19 symbols the showcase imports — **no new
engine API needed.** Work is packaging only.

- **A1. Library build (ESM + dts → `dist/`).** Med.
  `tsup src/index.ts react/index.tsx --format esm --dts --external react,react-dom --splitting`.
  Keep simplex-noise/webgpu-utils/wgpu-matrix external. WGSL is inline strings →
  nothing to bundle.
  Gotchas: don't bundle React; `splitting:true` so the engine dedupes across the
  `.` and `./react` entries; emitted dts references ambient `@webgpu/types` —
  add a triple-slash ref or document it.
- **A2. `package.json`.** Low. Remove `private`; bump `0.0.0→0.1.0`; repoint
  `exports` at `dist`; add `files:["dist"]`, `sideEffects:false`, `build` +
  `prepublishOnly`. Optional `development`/`source` condition → `./src/index.ts`
  to keep sibling-repo HMR.
  Gotcha: `sideEffects:false` is safe because sensors attach listeners lazily —
  confirm no top-level `window.addEventListener`.
- **A3. Wire publish target** (framing decision). Low–Med.

---

## Repo B — `screean-components`

Today a **site, not a package** (multi-HTML vite build, `noEmit` tsconfig, no
`exports`). The showcase is a **fullscreen viewport takeover** in
`site/experiments/`. Both change.

- **B1. Promote showcase → container-scoped component.** High (real work).
  `site/experiments/sixShowcaseInk.ts` → `src/hero/sixInkHero.ts`, keep
  `mount(container, opts) => cleanup`.
  - Host `fixed inset:0 z-9999` → fill container (`absolute inset:0`, no z-9999).
  - **Replace `window.innerWidth/Height` in `applySize()` with container
    `clientWidth/Height`** (critical for letterbox cutout). Keep
    `ResizeObserver(host)`.
  - Gate all HUD chrome behind options, default OFF.
  - Remove site `window` keydown (Escape→router nav, M/F/T) + `window.resize`.
  - `SixInkHeroOptions = Prettify<{ particleCount?, autoCycle?, dwellMs?,
    glitch?, interactions?, chrome?, logoUrl?, onFallback?, fallbackMessage? }>`.
  Gotchas: preserve `renderer.resize` DPR contract; preserve full teardown
  (StrictMode double-mounts); route existing WebGPU fallback through
  `onFallback`/`fallbackMessage`.
- **B2. Relocate loaders.** Low. `site/lib/loaders/{gltf,clouds}.ts` →
  `src/lib/loaders/` (only import `type Rng`).
- **B3. Asset (`6ixLogo.glb`, 882 KB).** Med (sub-decision). Reco: `logoUrl`
  prop + ship glb as secondary export path. Alt: procedural "6" via `sampleText`
  (zero asset).
- **B4. React wrapper.** Low. `<SixInkHero/>` on `/react` subpath; stabilize
  `opts` (useMemo) so the sim doesn't remount each render.
- **B5. Library build + metadata.** Med. Separate tsup lib build (hero + react
  entries) alongside the site build. `exports`, `files:["dist","assets"]`,
  `peerDependencies:{ screean, react, react-dom }`.
  Gotchas: externalize `screean` (avoid duplicate engine/WebGPU device); scope
  lib entry to hero (keep Tailwind/shadcn `ui/` out); `.glb` needs
  `assetsInlineLimit:0` + copy.
- **B6. Docs.** Low. `docs/six-ink-hero.md`.

---

## Scope reducers (no change needed)

- Engine exports all 19 showcase symbols already.
- WebGPU-with-fallback already exists (hard gate → "WEBGPU REQUIRED").
- WGSL = inline strings, no shader-asset build.
- Loaders depend only on a screean type.

## Open decisions

1. Publish target (npm public / GitHub Packages / git-dep).
2. Asset (`logoUrl` prop / bundle glb / procedural "6").
3. HUD chrome on hero, or pure particles + GreenRoom overlay?
4. Build tool (tsup / vite lib mode).
