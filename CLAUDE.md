# screean-components

A from-scratch, **headless component library** where components are real DOM
elements that dissolve into (and reform from) particle clouds via the
`@tesyl/screean` engine. Sister repo: `../screean` (the engine — its
`docs/RFC-*.md` files are the design history this library executes against).

## Architecture — READ FIRST

**Pattern A (DOM-first) is the standard.** Real DOM element = single source
of truth; particles are a transition artifact. The full implemented
architecture, module map, runtime flows, and invariants:

- **[`docs/ARCHITECTURE-components.md`](docs/ARCHITECTURE-components.md)** — the implemented architecture (start here)
- [`docs/headless-components-guide.md`](docs/headless-components-guide.md) — how to build/use a dissolving component
- [`docs/DECISION-component-rendering-pattern.md`](docs/DECISION-component-rendering-pattern.md) — the decision record (executed 2026-06-11)
- [`docs/ui-rendering-pattern-audit.md`](docs/ui-rendering-pattern-audit.md) — the audit + migration log it executed

### Layout (the 30-second version)

```
src/components/transition/   THE dissolve/swap engine (createScreenController)
src/components/headless/     DOM-first factories — the component library
src/components/types.ts      RENDER_STRATEGY_BY_ROLE (compile-time boundary)
src/components/choreography/ free-particle motion (NOT a component layer)
src/components/{factories,routing,component.ts}   LEGACY (deprecated; only
                             src/demos/legacy-demo consumes it — don't extend)
site/                        showcase SPA (experiments registry, lab, stories)
src/demos/                   standalone demo routes (own .html entries)
```

## Rules for working here

1. **New components go in `src/components/headless/`**, following
   `button.ts` (discrete / `'rasterize'`) or `slider.ts` (continuous /
   `'live-dom'`) as the template. Register the role in
   `RENDER_STRATEGY_BY_ROLE` — the compiler enforces classification.
2. **Never add a second dissolve implementation.** All transitions go
   through `createScreenController` / `applyTransitionFrame`. If the core
   lacks a capability (it has `originOf`, `minView`, `feelOverrides`,
   `fadeMs`…), extend the core — don't hand-roll a state machine.
3. **Respect the invariants** in `ARCHITECTURE-components.md` §6 (dt clamp,
   physics gating, crossfade order, repaint-before-dissolve,
   fonts-ready-before-rasterize). They are load-bearing; "simplifying" them
   causes NaN explosions or visible pops.
4. **Discrete activation contract:** flip state → repaint → `onChange` →
   `dissolve`. **Continuous controls** (slider drag, text input/IME) stay
   live-DOM — never rasterize away live interaction.
5. **Styling:** default skins are inline + foreignObject-safe. External
   styling layers come in via `unstyled` + `className`; mind the rasterizer
   input contract (no cross-origin `url()`, fonts embedded/ready).
6. **Don't extend the legacy surface** (`factories/`, `routing/`,
   `component.ts`, DOM-mirror concepts). It exists for `legacy-demo` only.

## Working across the two repos (`screean` ⇄ `screean-components`)

The engine is consumed via `@tesyl/screean` (declared as a **peer**
dependency `^0.2.0`; resolved locally through a `file:../screean` **dev**
dependency). pnpm **hard-copies** the engine into `node_modules` — it is NOT
a live symlink. So:

> **After editing the engine `src/`, run `pnpm run sync:engine` in this repo**
> (rebuilds the engine + `pnpm install` to refresh the copy). Otherwise this
> repo typechecks against a **stale** engine `dist/` and you get baffling
> "type X is not assignable" / "has no export Y" errors against code you just
> changed. The engine also has a `prepare` script so a fresh `pnpm install`
> self-builds its `dist`.

The transition core (`createScreenController` etc.) lives in the engine
(`screean/src/screen`); this repo's `src/components/transition/` re-exports it.

## Commands

```
npm run dev          # vite dev server (site + demo html entries)
npm test             # vitest run (suites in src/ and site/)
npm run build        # tsc --noEmit + vite build (the site)
npm run build:lib    # library build (vite.lib.config.ts)
npm run sync:engine  # rebuild ../screean + refresh the local copy (run after engine edits)
```

Verification gate for any change: `tsc --noEmit` clean + `vitest run` green;
run both builds when touching exports or vite config. When the change spans
the engine, run the engine's `npm test` + `npm run build` too, then
`sync:engine` here.
