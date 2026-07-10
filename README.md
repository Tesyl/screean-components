# screean-components

UI component library + showcase site built on the [`screean`](../screean) particle engine.

The thesis: **state changes feel like matter moving, not styles swapping.** When UI changes, particles bound to "before" re-bind to "after" — the spring/drag system carries them through. The intermediate state is the physics, not a hand-tuned animation.

## Install & use (React)

```sh
npm install @tesyl/screean @tesyl/screean-components
```

```tsx
'use client'; // Next.js App Router — every entry is browser-only

import { useState } from 'react';
import {
  ScreenProvider,
  ScreeanButton,
  ScreeanSlider,
} from '@tesyl/screean-components/react';

export default function App() {
  const [v, setV] = useState(40);
  return (
    <ScreenProvider feel="taut">
      <ScreeanButton label="Save" onClick={() => console.log('saved')} />
      <ScreeanSlider value={v} onChange={setV} />
    </ScreenProvider>
  );
}
```

All nine components ship as wrappers: `ScreeanButton · ScreeanLabel ·
ScreeanCard · ScreeanCheckbox · ScreeanToggle · ScreeanRadioGroup ·
ScreeanImage · ScreeanTextField · ScreeanSlider`. Prop model, imperative
handles (`ref` → `dissolve()`/`swapTo()`), and lifecycle details:
[`docs/react-wrappers.md`](docs/react-wrappers.md).

Vanilla TS instead? `@tesyl/screean-components/components` exports the
headless factories + `createScreenController` directly — see
[`docs/headless-components-guide.md`](docs/headless-components-guide.md).

## Layout

```
screean-components/
├── src/
│   ├── components/                 Component library (the public surface)
│   │   ├── component.ts             Core factory + findComponentAncestor
│   │   ├── types.ts                 Component, ComponentEvent, opts, AriaRole
│   │   ├── index.ts                 Public barrel — consumers import from here
│   │   ├── factories/               Visible factories
│   │   │   ├── label.ts · button.ts · card.ts
│   │   │   ├── toggle.ts · slider.ts · checkbox.ts
│   │   │   └── radio.ts · image.ts · textField.ts
│   │   ├── dom/                     DOM mirror + dom-flavored choreography
│   │   │   ├── domMirror.ts         Real <div>/<input> overlay per component
│   │   │   ├── dissolveAndReform.ts Click → shatter → return → fade-in
│   │   │   └── popTo3D.ts           Z-axis lift effect
│   │   ├── routing/                 Event + focus routing
│   │   │   ├── pointerTracker.ts · focusTracker.ts
│   │   │   └── routePointerEvent.ts · routeKeyboardEvent.ts
│   │   └── ui/                      React shadcn versions (interop)
│   ├── demos/                      Standalone Vite multi-page entries
│   │   ├── legacy-demo/             /legacy-demo.html — original
│   │   ├── button-grid/             /components.html — DOM mirror showcase
│   │   ├── routing/                 /routing-demo.html — physics-as-routing
│   │   └── html-interop/            /html-interop.html — Phase 3a
│   ├── lib/utils.ts                shadcn cn() helper for ui/
│   └── testing/                    OffscreenCanvas stub for happy-dom tests
└── site/                           Vanilla TS SPA (the showcase)
    ├── main.ts · router.ts · layout.ts · themes.ts · embed.ts
    ├── pages/                       Landing + components storybook + experiments + lab
    ├── stories/                     Component storybook tile groups
    ├── experiments/                 Lazy-loaded sandbox demos (button, sixLogo,
    │                                flowfield, flowfield-gpu, controls)
    ├── lab/                         Per-component design surface (NEW)
    │   ├── mount.ts · types.ts · registry.ts
    │   └── stories/                 One LabStory per component (9 total)
    ├── assets/                      .glb models, static assets
    └── lib/                         Site utilities, by category
        ├── transitions/             screeanNav, screeanWipe (canonical examples)
        ├── effects/                 Reel, componentReel
        ├── physics/                 flowfield (stacked-sine vector field)
        ├── loaders/                 gltf (parser + area-weighted sampler)
        └── ui/                      fullscreen
```

## Run it

```sh
pnpm install
pnpm dev          # site SPA at http://localhost:3100/
pnpm test         # 261 tests
pnpm build        # type-check + bundle all entries
```

The dev server serves the SPA at `/` plus four standalone multi-page entries:

| URL | What |
|---|---|
| `/` | Showcase site SPA (landing · `/components` storybook · `/experiments/*` · `/lab/*`) |
| `/lab/<story>` | Per-component design surface — Props / Forces / Choreography / Globals / Code knobs |
| `/components.html` | Button-grid dissolve demo (real DOM mirror) |
| `/html-interop.html` | Phase 3a interactive button-particle demo |
| `/routing-demo.html` | Physics-as-routing-transition demo |
| `/legacy-demo.html` | Original particle-components demo (kept for reference) |

## Components

All components are built with a tight opt-shape hierarchy:

```ts
BaseComponentOpts    = { id?, ariaRole?, ariaLabel? }
InteractiveOpts      = BaseComponentOpts & ComponentHandlers
                       & { disabled?, pressed?, checked? }
SizedOpts            = { width?, height?, radius?, font?, z? }
```

| Component | Opts | A11y |
|---|---|---|
| `label`     | `BaseComponentOpts & { label, font?, ariaRole?, z? }`                | role=text \| heading |
| `button`    | `InteractiveOpts & SizedOpts & { label, onClick }`                   | role=button + aria-pressed/checked |
| `card`      | `BaseComponentOpts & SizedOpts & { title, body, ... }`               | role=none (decorative) |
| `toggle`    | `InteractiveOpts & SizedOpts & { on, onChange }`                     | role=switch + aria-checked |
| `slider`    | `InteractiveOpts & SizedOpts & { value, min?, max?, onChange }`      | role=slider + aria-valuenow/min/max |
| `checkbox`  | `InteractiveOpts & SizedOpts & { checked, onChange }`                | role=checkbox + aria-checked (incl. `'mixed'`) |
| `radio`     | `InteractiveOpts & SizedOpts & { checked, onChange, dotRadius? }`    | role=radio + aria-checked |
| `image`     | `BaseComponentOpts & SizedOpts & { source, ariaLabel, alphaThreshold? }` | role=img + ariaLabel |
| `textField` | `InteractiveOpts & SizedOpts & { value, onChange }`                  | role=textbox + onInput |

Components are **consumer-controlled**: state (`pressed`, `checked`, `on`, `value`, `textValue`) is captured at construction; the consumer rebuilds with the new value on change. Mirrors React's controlled-input pattern.

## DOM mirror

`createDomMirror({ scene, host })` mounts a real DOM element per component, parented to a single `#screean-mirror` container above the canvas. Most components get a `<div role="...">`; `role=textbox` components get a real `<input type="text">` so the browser owns cursor / selection / IME / paste. Each element carries the component's role + ARIA state, sits at the component's world-bounds rect, and dispatches:

- `click` + `keydown(Enter|Space)` → `onClick`
- `input` (per keystroke from textbox elements) → `onInput`, with `e.value` carrying the new string

Inline `font` + `line-height: 1` keep DOM glyph metrics aligned with the canvas rasterization. This is what makes screen readers, keyboard focus, IME, copy/paste, and forced-color modes Just Work — without re-implementing them on canvas.

## Lab — per-component design surface

`/lab/<story>` is where you tune a component's choreography before it lands in product code. Each story has Props / Forces / Choreography / Globals / Code tabs. State persists across stories so you can A/B-test "what does outBack feel like across all my components." See `site/lab/` and `site/lab/stories/` for the implementation.

## How `screean` dependency works

`screean` is linked via `"screean": "file:../screean"` in `package.json`. Vite excludes it from `optimizeDeps` so HMR works when editing engine internals.

The site (in `site/`) consumes `screean` through the same package barrel any external consumer would (`import { node, circle, spawn } from 'screean'`). It does NOT reach into the engine's `src/`.

## Easing curves for `dissolveAndReform`

The return-to-target phase is parametric: each particle's start position is snapshotted at phase entry, then `start + (target - start) * easing(t)` each frame. Curves come from `screean`'s `easing` namespace.

```ts
import { easing } from 'screean';
import { createDissolve } from '@screean/components';

const dissolve = createDissolve({
  // ...other opts
  returnEasing: easing.outCubic,   // default — matches the previous "exponential approach" feel
});

// Per-trigger override:
dissolve.trigger(button, { easing: easing.outBack });   // punchy overshoot
```

Available curves: `linear`, in/out/inOut variants of `quad` `cubic` `quart` `quint` `sine` `expo` `circ` `back`, plus `smoothstep`, `smootherstep`, `inBounce` `outBounce` `inOutBounce`, `inElastic` `outElastic` `inOutElastic`. Overshoot families (`back`, `elastic`, `bounce`) intentionally exit `[0, 1]` mid-curve — the final snap-to-target at phase end covers any residual offset. Pass any `(t: number) => number` for custom curves.

## Cross-platform deployment

This package is designed to ship unchanged across three deployment targets:

- **Web** — the showcase site as-is, deployed to any static host
- **iOS app** — wrapped in Capacitor / WKWebView. Same TS, same Vite build
- **visionOS** — via Safari/WebXR (Apple Vision Pro). Same WGSL drives spatial scenes (Safari 26.2+)

The CPU engine is the universal baseline; `flowfield-gpu` is a WebGPU compute showpiece that runs natively on every modern browser including Safari 26+ on Apple platforms. See [`screean/docs/RFC-cross-platform.md`](../screean/docs/RFC-cross-platform.md) for the matrix and architectural decisions.
