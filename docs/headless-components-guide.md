# Rendering a dissolving UI component — the canonical guide

**Status:** Current · 2026-06-11
**Companion:** [`DECISION-component-rendering-pattern.md`](./DECISION-component-rendering-pattern.md) (the decision) · [`ui-rendering-pattern-audit.md`](./ui-rendering-pattern-audit.md) (the inventory that led to it)

This is the post-migration "how to" the audit's Step 4 calls for. Pattern A is
now implemented: **the real DOM element is the single source of truth; the
particle cloud is a transition artifact.**

---

## The three layers

```
┌────────────────────────────────────────────────────────────┐
│  src/components/headless/   — DOM-first component factories │
│  headlessButton · headlessSlider · headlessCheckbox ·       │
│  headlessToggle · headlessRadio/createRadioGroup ·          │
│  headlessTextField · headlessCard · headlessLabel ·         │
│  headlessImage                                              │
└──────────────────────────┬─────────────────────────────────┘
                           │ screen.dissolve(el) / swapTo()
┌──────────────────────────▼─────────────────────────────────┐
│  src/components/transition/ — THE one dissolve/swap engine  │
│  createScreenController · applyTransitionFrame (machine) ·  │
│  resolveParticlePalette · constants                         │
└──────────────────────────┬─────────────────────────────────┘
                           │ bitmapFieldFromElement · World ·
                           │ createRenderer · feels
┌──────────────────────────▼─────────────────────────────────┐
│  @tesyl/screean — the engine                                 │
└────────────────────────────────────────────────────────────┘
```

## Quick start

```ts
import { createScreenController, headlessButton } from '@tesyl/screean-components';

// 1. One controller per page. The canvas is a full-viewport overlay ABOVE
//    content, pointer-events: none.
const screen = createScreenController({ canvas });

// 2. Components are real DOM. Append them anywhere.
const save = headlessButton({
  screen,
  label: 'Save',
  onClick: () => persist(),   // business logic runs FIRST, on the live element
});                            // then the dissolve round-trip plays
host.appendChild(save.el);

// 3. Transitions on demand:
await save.dissolve();         // element → particles → same element
await save.swapTo(other);      // element → particles → other element
```

## The four-frame cycle

```
dom ── activate ──▶ dissolving(16ms) ──▶ particles(~1400ms, free physics)
                                              │
   dom ◀── reforming(fade 0→1) ◀── returning(50ms lerp, physics OFF) ◀──┘
```

Load-bearing details (do not "simplify"):
- **dt clamp** `MAX_DT_SECONDS = 0.05` — one slow frame + the taut spring
  (K≈140) compounds into NaN positions and a frozen tab.
- **Physics gating** (`PHYSICS_ACTIVE`) — `returning`/`reforming` are
  deterministic; pointer attraction is gated off so the cursor can't drag
  particles off-target during the snap-back.
- **Crossfade order** — particles stay pinned while the DOM fades in OVER
  them; that's why there is no visible pop.

## Discrete vs continuous (`RenderStrategy`)

Type-coupled in `src/components/types.ts` (`RENDER_STRATEGY_BY_ROLE` —
adding an `AriaRole` without classifying it fails compilation):

| Strategy | Roles | Contract |
|---|---|---|
| `rasterize` | button, checkbox, switch, radio, card, label, image… | Element is the settled steady state. Activation: **flip state → repaint → onChange → dissolve** (the rasterizer must capture the NEW state's pixels). |
| `live-dom` | slider, textbox | The continuous gesture (drag, typing/IME) stays on live DOM — **never rasterized away**. Only the edges dissolve: slider on demand (e.g. dblclick), textField on commit (`change`), not per keystroke. |

The slider is the reference continuous control: real `track`/`fill`/`thumb`
child nodes (`data-part` styling hooks), our own pointer math
(`setPointerCapture` + clientX→value) and the full ARIA keyboard model — so
the inners rasterize exactly as painted, at the current value.

## Controller deployments

| Deployment | Opts | Coordinate space |
|---|---|---|
| Viewport overlay (default) | `{ canvas }` | element viewport rect = canvas coords |
| Tile / panel local canvas | `{ canvas, originOf: el => ({x,y}), minView: {w,h} }` | `originOf` maps each element to its anchor in canvas coords |

Other tuning: `feel` (preset, default `taut`), `feelOverrides`
(per-constant force tweaks), `particleCount`, `particlePhaseMs`,
`disperseKick`, `fadeMs`, `ownLoop: false` (drive `tick(now)` from your own
rAF — the repo's "consumer owns the cadence" pattern).

## Styling layer (the Tailwind-later seam)

Factories ship a **default inline skin** (foreignObject-safe: zero external
CSS). Two override levels:

- `style: {...}` — inline overrides merged over the skin.
- `unstyled: true` + `className` — bring your own styling layer.

The rasterizer reads *computed* styles, so any styling system works **iff**
the rasterizer input contract holds (DECISION doc §gotchas):
no cross-origin `url()` (canvas tainting), fonts ready before rasterize
(the core awaits `document.fonts.ready`), pseudo-element/backdrop-filter
caveats on the foreignObject path. The native `drawElementImage` path
(RFC-html-in-canvas-interop Phase 3b, dormant) lifts these when it ships.

## Particle palette

Resolution order (`resolveParticlePalette`): `--screean-particle{,-2,-3}`
custom properties (component → theme cascade) → the element's computed
`background-color`/`color` → neutral fallback. Set the variables on `:root`
for a theme, or on the element to override per-component.

## Accessibility

There is no mirror. The element **is** the a11y surface: native focus, tab
order, Enter/Space activation, `aria-checked`/`aria-valuenow`/
`aria-disabled` written by the factories, screen-reader names mandatory
where there's no visible text (toggle, textField, image `alt`).

## What replaced what

| Legacy (Pattern B) | Replacement |
|---|---|
| `factories/*` SDF subtrees + `component()` tag | `headless/*` real-DOM factories |
| `dom/domMirror.ts` invisible mirror | the element itself |
| `routing/` (pointerTracker, routePointerEvent…) | native DOM events |
| `choreography/effects/dissolve.ts` recipe | `transition/` core (`createScreenController`) |
| hand-rolled state machines (html-interop ×2, moonshot, ScreenProvider, componentReel) | the same one core |

The choreography subsystem itself (pipelines, runner, particle effects like
`popTo3D`/`visual.fallAway`) remains for **free-particle work** — effects on
clouds that exist during transitions or particle-art scenes (see the
`visual-fallaway` experiment). What's gone is its role as the component
dissolve mechanism.

## Upstreaming note

`screean/react`'s `ScreenProvider` still carries its own copy of the state
machine. Next step: make it a thin wrapper over `createScreenController`
(or move the core into `@tesyl/screean` proper) so the React binding and
this library share literally one implementation.
