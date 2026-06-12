# UI Rendering Pattern Audit — DOM-Rasterize Dissolve vs Scene-Graph Primitives

**Date:** 2026-06-03
**Scope:** Every component, experiment, lab story, story-group, and demo route in `screean-components` (+ the `screean` engine and its `./react` binding).
**Goal:** Identify which UI surfaces use the "premier" DOM-rasterize dissolve/reform pattern, which don't, and plan a migration to make it the standard.

> **Decision:** the direction is now committed in [`DECISION-component-rendering-pattern.md`](./DECISION-component-rendering-pattern.md) — from-scratch headless library, Pattern A as standard, style-system-agnostic rasterizer (Tailwind-later safe), and **one** transition core. The plan in §4 has been re-prioritized so **consolidating the three dissolve implementations comes first**.

---

## 1. There are two patterns, not one

The codebase contains **two distinct mechanisms** that both produce a "UI element dissolves into particles and reforms." They share vocabulary (`dissolve`, "reform") but are architecturally different. This is the crux of the audit.

### Pattern A — DOM-Rasterize Dissolve (the "premier" pattern)

The element is a **real DOM node** (the source of truth). It is rasterized to a particle field, dissolved, reformed, and the DOM node fades back. Visual fidelity = whatever the browser renders (real CSS, gradients, `box-shadow`, web fonts, shadcn/Tailwind — anything).

```
author real DOM (HTMLElement)
  → bitmapFieldFromElement({ element, strategy:'foreignObject', alphaThreshold:20 })  → BitmapField
  → state machine: dom → dissolving(16ms) → particles(~1500ms, free physics)
                       → returning(~50ms, lerp k=0.22) → reforming(~100ms, fade 0→1) → dom
  → primitives: spawn(n, point) + radialImpulse(kick) + World.tick + field.sample(n) targets
```

**Engine exports it relies on** (`@tesyl/screean`): `bitmapFieldFromElement`, `BitmapField`, `spawn`, `radialImpulse`, `World`, `spring`/`drag`/`shimmer`/`neighborRepel`/`pointForce`, `createRenderer`, `pointerSensor`, `TRANSPARENT`, `packRGBA`, `feels`.

**Reference implementations (most → least productized):**
1. `screean/react/index.tsx` — `ScreenProvider` + `useScreen`/`useDissolve(ref)`/`useSwap(from,to)`. **The canonical, distributable form** (exported as `@tesyl/screean/react`).
2. `site/pages/moonshot/engine/canvas.tsx` — generalizes to `swap(from → into)` (two fields).
3. `src/demos/html-interop/main.tsx` — original Phase-1 reference (plain inline-styled button).
4. `src/demos/html-interop-2/main.tsx` — same, ported onto the `feels.taut` preset.
5. `site/lib/effects/componentReel.ts` — the only **library helper** that does Pattern A (used by the `components` story group).

### Pattern B — Scene-Graph Primitives + Choreography Dissolve (today's default for "components")

The element is **drawn by the engine from SDF primitives** (`rect` + `text` + `circle` fields). There is **no real styled DOM** — only an *invisible* DOM mirror kept in sync for accessibility/input (`src/components/dom/domMirror.ts`). "Dissolve" is the `dissolve()` **choreography recipe** (`src/components/choreography/effects/dissolve.ts`) that bursts the already-bound particle pool and fades the invisible mirror:

```
setMirrorOpacity(0) → kick(burst) → wait(particlePhaseMs)
  → captureStarts → easeToTargets → pinToTargets → setMirrorOpacity(1) → wait(fadeMs)
```

It **never rasterizes real CSS**. Fidelity is bounded by what the primitives express: rounded rect + monospace-ish text. No gradients, no `box-shadow`, no real web-font rendering, no Tailwind/shadcn.

> Naming collision to be aware of: the engine choreography `dissolve()` (Pattern B) and the hand-rolled html-interop state machine (Pattern A) are **different code paths with the same name**. There is also a legacy `src/components/dom/dissolveAndReform.ts` (`createDissolve`) — a third parallel implementation.

---

## 2. Inventory — who uses what

### Pattern A — DOM-rasterize (✅ already premier)

| Item | File | Notes |
|---|---|---|
| html-interop demo | `src/demos/html-interop/` | Original reference. **(palette just fixed)** |
| html-interop v2 | `src/demos/html-interop-2/` | `feels.taut` port. **(palette just fixed)** |
| moonshot canvas | `site/pages/moonshot/engine/canvas.tsx` | adds `swap()` |
| React binding | `screean/react/index.tsx` | `ScreenProvider`/`useDissolve`/`useSwap` — distributable |
| components story group | `site/stories/components.ts` + `site/lib/effects/componentReel.ts` | library-level helper |

### Pattern B — scene-graph primitives + choreography dissolve (❌ not premier)

| Item | File | UI rendered |
|---|---|---|
| **All component factories** | `src/components/factories/{button,card,checkbox,radio,slider,toggle,label,image}.ts` | SDF rect/circle/text — no real DOM |
| textField (hybrid) | `src/components/factories/textField.ts` | SDF chrome + a real `<input>` for IME, but **not rasterized** |
| All 9 lab stories | `site/lab/stories/*.ts` + `site/lab/mount.ts` | wrap the factories; dissolve via choreography runner |
| controls experiment | `site/experiments/controls.ts` | full v1 component scene, `createDissolve` |
| visual-fallaway | `site/experiments/visualFallAway.ts` | button factory + `popTo3D`/`visual.fallAway` |
| button-grid demo | `src/demos/button-grid/main.ts` | route `/` |
| routing demo | `src/demos/routing/main.ts` | route `/routing-demo` |

### Neither — pure particle/visual effects (no discrete UI element; out of scope)

`six-logo`, `six-logo-ink`, `six-logo-chalk`, `six-showcase{,-ink,-chalk}`, `qr-particles`, `flowfield`, `flowfield-gpu`, `gpu-engine`, `p24-binding-parity`, `particle-mask`, `legacy-demo`, and the `choreography/composition/forces/easing/layout` story tiles. These are particle art / engine demos, not UI rendering — **leave as-is**.

---

## 3. The gap & why it matters

The "premier" pattern (real DOM → rasterize → dissolve → reform) is confined to **5 demo/binding sites**. The actual **component library** — the thing meant to be reused — is entirely Pattern B. Consequences:

- **Fidelity ceiling.** Components can't render real shadcn/Tailwind, gradients, shadows, or true web-font glyphs — they're re-implemented as rect+text SDFs. The html-interop RFC already documents this is *why* it exists.
- **Two sources of truth.** Pattern B maintains an invisible DOM mirror *and* a primitive scene that must be kept geometrically identical by hand (`domMirror.ts:235-247`). Pattern A has one source of truth (the DOM node).
- **Three dissolve implementations.** `choreography/effects/dissolve.ts`, `dom/dissolveAndReform.ts`, and the hand-rolled html-interop/moonshot state machines. Divergent timing models, duplicated logic.
- **The productized form already exists** (`screean/react` `ScreenProvider`) but the component library predates it and doesn't consume it.

---

## 4. Migration plan

> **✅ EXECUTED 2026-06-11.** All steps below are done — see
> [`headless-components-guide.md`](./headless-components-guide.md) for the
> canonical post-migration guide. Summary of how each landed:
> **Step 0** → `RenderStrategy` + `RENDER_STRATEGY_BY_ROLE` (type-coupled) in `src/components/types.ts`.
> **Step 1** → `src/components/transition/` (`createScreenController` + the
> extracted four-frame machine; opts grew `originOf`/`minView`/`feelOverrides`/`fadeMs`).
> **Step 2** → `src/components/headless/` — full DOM-first library (button,
> slider, checkbox, toggle, radio+group, textField, card, label, image).
> **Step 3** → button-grid, routing demo, controls, lab (mount + 9 stories),
> button experiment, visual-fallaway (Pattern-A fields, recipes kept) all migrated.
> **Step 4** → deleted: `choreography/effects/dissolve.ts`, `dom/domMirror.ts`,
> 7 orphaned SDF factories; componentReel is a thin adapter over the core.
> Retained legacy surface: `factories/{button,label}`, `routing/`,
> `component.ts` — consumed only by `src/demos/legacy-demo` (historical
> reference). Remaining follow-up: upstream the core into `screean/react`'s
> `ScreenProvider` (it still carries its own copy of the machine).

Goal: make Pattern A the standard way components render, collapse the three dissolve implementations to one, and keep Pattern-B internals only where genuinely needed (continuous controls like sliders mid-drag).

> Each step: **[Complexity]**, ⚠️ **gotchas/LLM-fallacies**, 🔧 **technical details**.

### Step 0 — Decide the boundary (discrete vs continuous UI)
**[Low]** Classify each component as *discrete* (button, card, label, checkbox, radio, toggle, image — has a settled visual state) vs *continuous* (slider, textField mid-interaction). Pattern A fits discrete cleanly; continuous needs the live DOM during interaction and only rasterizes at transition edges.
- ⚠️ Don't force sliders/text inputs into a rasterize-only model — you'd lose live drag/IME. The premier pattern is for *transitions*, not for the interactive steady state.
- 🔧 Output: a `RenderStrategy = 'rasterize' | 'live-dom'` tag per component role, type-coupled so the compiler flags unhandled roles.

### Step 1 — Promote `ScreenProvider` to the shared transition core
**[Medium]** Make `screean/react`'s state machine the single dissolve/swap engine. Have the component layer depend on it (or port its non-React core into `@tesyl/screean` as a framework-agnostic `createDissolveController(field, world, opts)`).
- ⚠️ The html-interop `dt` clamp and phase ordering are **load-bearing** (commented as such in `react/index.tsx`). Don't "simplify" them during extraction.
- ⚠️ Don't leave `dom/dissolveAndReform.ts` and `choreography/effects/dissolve.ts` alive in parallel — pick one. The 14 legacy tick-boundary tests assert a `since`-relative model incompatible with the cycle-elapsed model; rewrite them against behavior, not tick numbers (matches the repo's testing guidance).
- 🔧 Reuse exact exports listed in §1. Keep the controller pure: `(targets, world) → phase stream`.

### Step 2 — Add a real-DOM authoring path to the component factories
**[High]** Give each *discrete* factory a mode that renders a real (inline-styled, or shadcn-via-portal) DOM element as the source of truth, then rasterizes it via `bitmapFieldFromElement` for the dissolve — replacing the hand-built SDF subtree.
- ⚠️ **foreignObject tainting.** Tailwind v4's emitted CSS (`&` nesting needs CDATA; `url(...)` taints the canvas) breaks naive rasterization — the demos use plain inline styles for exactly this reason (`html-interop/App.tsx` header comment). Either keep authored components inline-styled, or use the native `drawElementImage`/`<canvas layoutsubtree>` path (Phase 3b, still dormant).
- ⚠️ `document.fonts.ready` must be awaited before rasterizing or glyphs sample empty (already done in `main.tsx:154`).
- ⚠️ The mirror/particle geometry coupling in `domMirror.ts` becomes redundant once the DOM *is* the element — delete it for rasterize-mode components rather than maintaining both.
- 🔧 Reuse the just-added `--screean-particle*` theme tokens + `resolveParticlePalette()` so rasterized clouds inherit themeable color with per-component override.

### Step 3 — Migrate the showcases (controls, button-grid, routing, visual-fallaway, lab)
**[Medium]** Re-point these onto the Step-2 factories + Step-1 controller. They already "dissolve"; this swaps the *mechanism* underneath, not the UX.
- ⚠️ `routing` persists one `World` across routes — ensure the shared controller is re-bindable without leaking particles between routes (`world.particles.length = 0` + respawn already present).
- 🔧 visual-fallaway's `popTo3D` vs `visual.fallAway` comparison is valuable — keep it, just feed it Pattern-A fields.

### Step 4 — Consolidate & document
**[Low]** Delete the dead dissolve path(s), update `src/components/index.ts` barrel, and write the canonical "how to render a dissolving UI component" doc next to this audit.
- ✅ ~~Keep `componentReel.ts` or fold it into the shared helper — don't leave a 4th near-duplicate.~~ **Done (2026-06-11):** `site/lib/effects/componentReel.ts` is now a thin adapter over `createScreenController` — its hand-rolled phase machine, Stage, and world management are gone. The fold required three core opts added for canvas-local deployments: `originOf` (rasterize/spawn anchor in canvas coords), `minView` (tile-size clamp floor), `feelOverrides` + tunable `fadeMs`. The adapter keeps only: DOM mount, theme-palette → `--screean-particle*` bridge, idle auto-loop timer, click wiring. Note: the core's pointer sensor is viewport-based, so canvas-local consumers must zero `pointerAttract` (componentReel does).
- 🔧 Add a constants module (`CAP_SNAKE_CASE`) for the phase durations currently scattered as locals (`PARTICLE_PHASE_MS`, `RETURN_MS`, `FADE_MS`, `RETURN_LERP_K`) so the timing is type-coupled and tunable in one place.

### Recommended sequencing (re-prioritized per the DECISION)
**Step 1 goes first** — collapsing the three dissolve implementations into one shared core is the active maintenance pain and unblocks everything else. Then 0 (boundary) → 2 (rasterize a `button`) → 3 (migrate showcases) → 4 (delete dead paths + document). Smallest valuable slice: **Step 1 (one core) + a single rasterize-mode `button` factory (Step 2)**, validated against the existing html-interop visual.
