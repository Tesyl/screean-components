# Component Architecture — as implemented

**Status:** Current · reflects the codebase after the Pattern A migration (2026-06-11)
**Companions:**
[`DECISION-component-rendering-pattern.md`](./DECISION-component-rendering-pattern.md) (why) ·
[`ui-rendering-pattern-audit.md`](./ui-rendering-pattern-audit.md) (what it replaced) ·
[`headless-components-guide.md`](./headless-components-guide.md) (how to use it)

This document describes the architecture **as it exists in the code** — the
module map, the runtime flows, and the invariants that must survive future
changes.

---

## 1. The model in one paragraph

A component is a **real DOM element** — the single source of truth for
pixels, accessibility, and events. Particles exist **only during
transitions**: activating a component rasterizes the element exactly as the
browser painted it (`bitmapFieldFromElement`), a particle cloud takes its
place on the same silhouette, physics plays, and the cloud snaps back as the
element fades in over it. At rest there are zero particles, zero mirrors,
zero parallel representations.

## 2. Layer diagram

```
            consumers (site pages, demos, experiments, lab)
                              │
        ┌─────────────────────┼──────────────────────┐
        ▼                     ▼                      ▼
┌────────────────┐   ┌─────────────────┐   ┌──────────────────────┐
│   headless/    │   │   transition/   │   │  choreography/        │
│ DOM-first      │──▶│ THE dissolve/   │   │ free-particle motion  │
│ factories      │   │ swap engine     │   │ (pipelines, runner,   │
│ (9 components) │   │ (controller +   │   │  popTo3D, fallAway…)  │
│                │   │  4-frame machine)│  │ NOT a component layer │
└────────────────┘   └────────┬────────┘   └──────────────────────┘
                              │
                              ▼
                  ┌───────────────────────┐
                  │   @tesyl/screean       │
                  │ World · forces · feels │
                  │ bitmapFieldFromElement │
                  │ createRenderer · spawn │
                  └───────────────────────┘
```

- `headless/` depends on `transition/`; neither depends on `choreography/`.
- `choreography/` operates on particle clouds generically — it lost its role
  as the component-dissolve mechanism (its `dissolve` recipe is deleted) but
  remains current for particle work (see the `visual-fallaway` experiment:
  rasterized real-DOM fields fed into `popTo3D` / `visual.fallAway`).

## 3. Module map

### `src/components/transition/` — the one transition core

| File | Responsibility |
|---|---|
| `constant.ts` | Every timing/physics constant (`DISSOLVE_HANDOFF_MS`, `RETURN_MS`, `FADE_MS`, `RETURN_LERP_K`, `MAX_DT_SECONDS`, palette tokens…). The single tuning source. |
| `types.ts` | `TransitionPhase` union, `TransitionTuning`, `ScreenControllerOpts`, `ScreenController`, `Prettify`. |
| `machine.ts` | `applyTransitionFrame(phase, world, now, tuning)` — one frame of the four-frame cycle. Pure-shaped (returns next phase + `settled`); mutates only world particles + the into-element's opacity. `PHYSICS_ACTIVE` gates `world.tick` per phase. |
| `controller.ts` | `createScreenController(opts)` — owns ONE World + Renderer + (optional) rAF over a consumer canvas. Public: `dissolve(el)`, `swap(from, into)`, `thwack`, `fieldOf(el)`, `tick(now)`, `phase()`, `world()`, `dispose()`. |
| `palette.ts` | `resolveParticlePalette(el)` — `--screean-particle{,-2,-3}` CSS vars → computed bg/fg → fallback. Canvas-based color parsing (handles oklch — Tailwind v4 safe). |

**The cycle:**

```
idle ─ dissolve(el) ─▶ dissolving(16ms) ─▶ particles(~1400ms, free physics)
                                                │
 idle ◀─ reforming(fade 0→1, particles pinned) ◀─ returning(50ms lerp,
              │                                     physics+pointer OFF)
              └── settled: pool emptied, element restored, promise resolves
```

**Controller deployments** (both in production use):

| Deployment | Opts | Example |
|---|---|---|
| Viewport overlay | `{ canvas }` — full-viewport, `z` above content, `pointer-events: none` | button-grid, routing demo, controls, lab |
| Canvas-local (tile/panel) | `{ canvas, originOf: el => ({x,y}), minView }` | `componentReel` story tiles |

### `src/components/headless/` — the component library

| File | Component | Strategy |
|---|---|---|
| `button.ts` | `headlessButton` | rasterize |
| `card.ts` | `headlessCard` (composes real children) | rasterize |
| `label.ts` | `headlessLabel` (text / heading) | rasterize |
| `image.ts` | `headlessImage` (awaits `decode()` before dissolve) | rasterize |
| `checkbox.ts` / `toggle.ts` / `radio.ts` | checked-state controls; `radio.ts` also exports `createRadioGroup` (exclusivity) | rasterize |
| `slider.ts` | `headlessSlider` — real `track`/`fill`/`thumb` parts, own pointer math (`setPointerCapture`), full ARIA keyboard model | **live-dom** |
| `textField.ts` | `headlessTextField` — live typing/IME; dissolves on commit (`change`), never per keystroke | **live-dom** |
| `checkable.ts` | shared checked-state machinery (internal) | — |
| `element.ts` | `applyStyles` / `applyBaseOpts` / `toElementComponent` (internal plumbing) | — |
| `constant.ts` | default skin values (CAP_SNAKE_CASE) | — |

Every factory returns an **`ElementComponent`**:

```ts
{ el, role, strategy, dissolve(), swapTo(other), dispose() }
```

**Contracts baked into the factories:**

- **Activation order (discrete):** flip state → repaint → `onChange` →
  `dissolve` — the rasterizer must capture the NEW state's pixels.
- **Gating:** activation no-ops while `screen.phase() !== 'idle'`.
- **Styling seam:** default skins are inline (foreignObject-safe, zero
  external CSS). `style` merges over the skin; `unstyled: true` +
  `className` swaps in an external styling layer (the rasterizer reads
  *computed* styles, so classes work subject to the input contract:
  no cross-origin `url()`, fonts ready, pseudo-class state not captured).
- **A11y is native.** The element is the accessibility surface — roles,
  `aria-*`, tab order, Enter/Space, focus rings. There is no mirror.

### `src/components/types.ts` — the compile-time boundary

```ts
RENDER_STRATEGY_BY_ROLE = { button: 'rasterize', …, slider: 'live-dom',
                            textbox: 'live-dom' }
  as const satisfies Record<AriaRole, RenderStrategy>
```

Adding an `AriaRole` without classifying it fails compilation. `'rasterize'`
= discrete (element is the settled steady state; edges rasterize).
`'live-dom'` = continuous (drag/typing stays on live DOM; **never**
rasterized away — Decision §5).

## 4. Runtime flows

### Click → dissolve (discrete component)

```
user clicks real <button>
  → factory handler: gate on phase()==='idle' → business onClick (live)
  → screen.dissolve(el):
      await document.fonts.ready
      bitmapFieldFromElement({el, 'foreignObject', origin: originOf(el)})
      resolveParticlePalette(el)            ← CSS vars → computed colors
      spawn(N) at element center → field.sample(N) targets
      radialImpulse(kick)                    ← burst
      el.opacity=0, pointerEvents='none'     ← cloud takes over
  → per-frame (controller tick):
      PHYSICS_ACTIVE[phase] && world.tick(dt)   ← dt clamped (see §6)
      applyTransitionFrame(...)                 ← phase advance
      renderer.draw(particles)
  → settle: pool emptied, element restored, dissolve() promise resolves
```

### Route/view swap (routing demo pattern)

```
screen.swap(currentViewEl, nextViewEl)
  → both silhouettes rasterized (next is flipped visible just for capture)
  → particles spawn ON current, target next — spring carries them across
  → next view fades in during reforming; old view disposed after settle
ONE controller persists across routes; pool is emptied per cycle (no leaks)
```

### Concurrency

A transition call while another is in flight **chains** — it awaits the
in-flight cycle's settle before rasterizing (rasterizing mid-flight would
capture the hidden element → empty mask). Factories additionally gate user
activation on `phase() === 'idle'`.

## 5. The legacy surface (deprecated)

Retained **only** because `src/demos/legacy-demo` (historical reference)
consumes it:

| Module | Status |
|---|---|
| `component.ts` + scene-graph `Component` types | deprecated |
| `factories/button.ts`, `factories/label.ts` | deprecated (other 7 deleted) |
| `routing/` (pointerTracker, routePointerEvent, focusTracker, keyboard) | deprecated — canvas hit-testing; real DOM needs none of it |

Deleted in the migration: `dom/domMirror.ts`, `choreography/effects/dissolve.ts`,
`factories/{card,checkbox,radio,slider,toggle,image,textField}.ts`, plus the
dead shadcn track (`src/components/ui/`, `src/lib/utils.ts`) and its five
runtime deps (`@radix-ui/react-slot`, `class-variance-authority`, `clsx`,
`lucide-react`, `tailwind-merge`). `defaultChoreography`'s button entry is
pop-only (dissolve removed). The deprecated declarations carry `@deprecated`
JSDoc so editors strike them through.

## 5b. Published package surface (and the two `./react`s)

`@tesyl/screean-components` currently publishes **two entries**, and neither
is the Pattern-A component library (that lives in `src/components/` and is
**not exported yet** — a follow-up if it's to ship):

| Export | Source | What it is | Consumer |
|---|---|---|---|
| `.` | `src/index.ts` → `src/hero` → `site/experiments/sixShowcaseInk.ts` | the six-ink GPU hero `mount()` (vanilla) | — |
| `./react` | `src/react/index.tsx` | `<SixInkBackground>` — React wrapper over the hero | **theGreenRoomSite** (`six-ink-background.tsx`, `six-chalk-background.tsx`) |

**Do not confuse the two `./react` exports across the packages:**
- **`@tesyl/screean/react`** = `<ScreenProvider>` + hooks (the transition
  theater — engine binding).
- **`@tesyl/screean-components/react`** = `<SixInkBackground>` (a prebuilt
  background — a *product*, externally consumed).

They are unrelated surfaces that happen to share the `./react` name. The
engine is a **peer** dependency (`^0.2.0`); see CLAUDE.md for the local
build-order workflow (`sync:engine`). Known publish follow-ups: the lib build
base64-inlines the 882 KB default glTF (vite lib-mode limitation — kept lazy;
needs an emitFile plugin for binary emission); and the headless component
library has no published export.

## 6. Invariants — do not "simplify"

1. **`MAX_DT_SECONDS = 0.05` clamp.** One slow frame compounds with the taut
   spring (K≈140) into NaN coordinates and a frozen tab.
2. **Physics OFF during `returning`/`reforming`** (`PHYSICS_ACTIVE`), and
   pointer attraction gated off — the snap-back must be deterministic; the
   cursor must not pull particles off-target.
3. **Crossfade order:** particles stay pinned to targets while the DOM fades
   in OVER them. That ordering is why there's no visible pop.
4. **Rasterize order for state changes:** repaint BEFORE dissolve, so the
   captured silhouette is the post-change visual.
5. **`await document.fonts.ready` before rasterizing** — otherwise glyphs
   sample empty.
6. **Pool emptied on settle** (`world.particles.length = 0`) — steady state
   owns zero particles; this is also what makes one controller safe across
   routes.

## 7. Testing layout

| Suite | Covers |
|---|---|
| `transition/machine.test.ts` | the cycle's behavior contract (order, convergence, fade, settle, gating) — behavior, not tick numbers |
| `headless/headless.test.ts` | button activation contract + slider math (combinatorial over range shapes) + gesture/ARIA |
| `headless/factories.test.ts` | checkbox/toggle/radio-group/textField/card/label/image contracts |
| `choreography/*` | the particle-motion system (state triggers use `_testComponents.ts` fixtures, not the deleted factories) |
| `factories/factories.test.ts` | legacy button+label only |

## 8. Known follow-ups

- ✅ **Core upstreamed into the engine (2026-06-15).** `createScreenController`
  + the four-frame machine + palette resolution now live in
  `@tesyl/screean` (`src/screen`). This library's `src/components/transition/`
  is a thin **re-export shim** over the engine; `screean/react`'s
  `ScreenProvider` is a thin wrapper over `createScreenController`. One
  implementation, three consumers. The engine also gained `resolveFeel(name,
  overrides)` and a `pointerSensor({ transform })` hook (pointer coords are
  now mapped into canvas space by the controller, closing the canvas-local
  embed offset bug).
- **Demo follow-pass:** the `html-interop{,-2}` demos and the moonshot
  `engine/canvas.tsx` still hand-roll their own inline machines — re-point
  them at `createScreenController` to finish collapsing the last copies
  (the moonshot migration is also the Pattern-A "dogfood" milestone).
- **Live controller tuning** — tuning is construction-time; the lab's old
  knob panels await live setters if we want them back.
- **`:hover` not captured by foreignObject rasterize** (pseudo-class state
  isn't serialized); the dormant native `drawElementImage` path
  (RFC-html-in-canvas-interop Phase 3b) fixes this.
- **Fixed settle delays in visual-fallaway** (`SETTLE_MS`) — convergence
  detection would be the polish step.
