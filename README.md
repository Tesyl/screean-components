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

**Pattern A (DOM-first) is the standard.** The real DOM element holds the
truth; particles are a transition artifact. Full detail:
[`docs/ARCHITECTURE-components.md`](docs/ARCHITECTURE-components.md).

```
screean-components/
├── src/
│   ├── index.ts                    Subpath "." — the six-ink GPU hero
│   ├── hero/                       Six-ink hero/background implementation
│   ├── components/
│   │   ├── public.ts               Subpath "./components" — Pattern A only
│   │   ├── types.ts                AriaRole + RENDER_STRATEGY_BY_ROLE
│   │   │                           (the compile-time classification boundary)
│   │   ├── headless/               DOM-first factories — THE component library
│   │   │   ├── button.ts · label.ts · card.ts · checkbox.ts · toggle.ts
│   │   │   ├── radio.ts · image.ts · textField.ts · slider.ts
│   │   │   ├── checkable.ts         Shared checkbox / toggle / radio behaviour
│   │   │   └── element.ts           applyStyles · applyBaseOpts · toElementComponent
│   │   ├── transition/             Re-export of the engine's dissolve/swap core
│   │   │                           (createScreenController, applyTransitionFrame)
│   │   ├── choreography/           Free-particle motion effects + pipeline
│   │   │                           (NOT a component layer)
│   │   ├── styles.css              Default skin — inline + foreignObject-safe
│   │   ├── component.ts            LEGACY (Pattern B) — do not extend
│   │   ├── factories/              LEGACY — scene-graph button.ts · label.ts
│   │   └── routing/                LEGACY — pointer + focus trackers
│   ├── react/                      Subpath "./react" — 9 wrappers, useHeadless,
│   │                               SixInkBackground, ScreenProvider re-export
│   ├── demos/                      Standalone Vite multi-page entries
│   │   ├── button-grid/             /components.html
│   │   ├── html-interop/            /html-interop.html
│   │   ├── html-interop-2/          /html-interop-2.html
│   │   ├── routing/                 /routing-demo.html
│   │   └── legacy-demo/             /legacy-demo.html — the only Pattern B consumer
│   └── testing/                    OffscreenCanvas stub for happy-dom tests
└── site/                           Vanilla TS showcase SPA
    ├── main.ts · router.ts · layout.ts · themes.ts · embed.ts
    ├── pages/                       Landing · components · experiments · lab · moonshot
    ├── stories/                     Storybook tile groups
    ├── experiments/                 Lazy-loaded sandboxes (GPU flowfield, six-ink, …)
    ├── lab/                         Per-component design surface (9 stories)
    ├── assets/                      .glb models, static assets
    └── lib/                         transitions/ · effects/ · physics/ · loaders/ · ui/
```

Removed since the previous README revision: `src/components/dom/` (the
DOM-mirror overlay), `src/components/ui/`, and `src/lib/utils.ts`. Pattern A
made the mirror unnecessary — a component IS a DOM element now.

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

## DOM-first rendering (this replaces the DOM mirror)

Each headless factory authors a **real DOM element** — `<button>`, `<input
type="range">`, `<input type="text">` — as the single source of truth. The
browser keeps focus, keyboard, IME, copy/paste, screen readers, and
forced-colour modes. The library does not re-implement them on canvas.

Particles appear only at the transition edges. `RENDER_STRATEGY_BY_ROLE` in
`src/components/types.ts` classifies every ARIA role:

- `'rasterize'` — DISCRETE components (button, checkbox, toggle, radio, label,
  card, image). The element rasterizes to a bitmap field at a dissolve or swap.
- `'live-dom'` — CONTINUOUS controls (slider drag, text input/IME). The element
  stays live through the gesture; only the transition edges rasterize.

The table is type-coupled to `AriaRole`. If you add a role and do not classify
it, compilation fails.

> The earlier `createDomMirror({ scene, host })` overlay is removed. It mirrored
> scene-graph components into DOM elements, which Pattern A made redundant.

## Lab — per-component design surface

`/lab/<story>` is where you tune a component's choreography before it lands in product code. Each story has Props / Forces / Choreography / Globals / Code tabs. State persists across stories so you can A/B-test "what does outBack feel like across all my components." See `site/lab/` and `site/lab/stories/` for the implementation.

## How the `screean` dependency works

The engine is a **peer** dependency: `"@tesyl/screean": "^0.3.0"`. Local
development resolves it through a `file:../screean` **dev** dependency.

pnpm **hard-copies** the engine into `node_modules` — it is not a live symlink.
After you edit the engine `src/`, run `pnpm run sync:engine` here. That rebuilds
`../screean` and refreshes the copy. If you skip it, this repo type-checks
against a stale engine `dist/` and reports confusing "has no export" errors.

This repo and the site both import from the package barrel
(`import { node, circle, spawn } from '@tesyl/screean'`). Neither reaches into
the engine's `src/`.

## Tuning a transition

A transition has four phases: `idle → dissolving → particles → reforming`. The
return leg is **spring physics**, not a keyframed easing curve — particles bind
to the target field and the spring/drag pair carries them there.

```ts
import { createScreenController } from '@tesyl/screean-components/components';

const controller = createScreenController({
  canvas,
  feel: 'taut',                 // named preset
  feelOverrides: { drag: 0.9 }, // springK · springC · drag · shimmerAmp ·
                                // shimmerFreq · repelRadius · repelStrength ·
                                // pointerAttract · hashCellSize
  particleCount: 6000,          // TransitionTuning — also particlePhaseMs,
  disperseKick: 1.2,            // disperseKick, fadeMs
  reformSpeed: { min: 0.6, max: 1.4 },
});

// Per-call overrides of TransitionTuning:
await controller.dissolve(el, { particlePhaseMs: 900 });
await controller.swap(from, into, { fadeMs: 120 });
```

`easing` still ships from `@tesyl/screean` and drives the choreography effects
in `src/components/choreography/` (`linear`, in/out/inOut variants of `quad`
`cubic` `quart` `quint` `sine` `expo` `circ` `back`, plus `smoothstep`,
`smootherstep`, and the `bounce` / `elastic` families). Any `(t: number) =>
number` works.

> The earlier `createDissolve({ returnEasing })` API is removed. Use
> `createScreenController` — see rule 2 in `CLAUDE.md`.

## Cross-platform deployment

This package is designed to ship unchanged across three deployment targets:

- **Web** — the showcase site as-is, deployed to any static host
- **iOS app** — wrapped in Capacitor / WKWebView. Same TS, same Vite build
- **visionOS** — via Safari/WebXR (Apple Vision Pro). Same WGSL drives spatial scenes (Safari 26.2+)

The CPU engine is the universal baseline; `flowfield-gpu` is a WebGPU compute showpiece that runs natively on every modern browser including Safari 26+ on Apple platforms. See [`screean/docs/RFC-cross-platform.md`](../screean/docs/RFC-cross-platform.md) for the matrix and architectural decisions.
