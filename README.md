# screean-components

UI component library + showcase site built on the [`screean`](../screean) particle engine.

The thesis: **state changes feel like matter moving, not styles swapping.** When UI changes, particles bound to "before" re-bind to "after" — the spring/drag system carries them through. The intermediate state is the physics, not a hand-tuned animation.

## Layout

```
screean-components/
├── src/
│   ├── components/        Component primitives (button, label, card, toggle, slider)
│   │                      + machinery (domMirror, dissolveAndReform, popTo3D,
│   │                      focusTracker, pointerTracker, routePointerEvent,
│   │                      routeKeyboardEvent)
│   ├── components-demo/   Standalone button-grid dissolve demo (components.html)
│   ├── html-interop/      Phase 3a "click button → particles → reform" demo
│   │                      (html-interop.html)
│   ├── routing-demo/      Physics-as-routing-transition demo (routing-demo.html)
│   └── testing/           OffscreenCanvas stub for happy-dom tests
└── site/                  Vanilla TS SPA — landing + components storybook +
    ├── main.ts            experiments. Hosts screeanNav / screeanWipe (the
    ├── pages/             canonical "physics is the transition" examples).
    ├── stories/
    ├── assets/            Static assets (.glb models, etc.)
    ├── experiments/
    │   ├── button.ts             Hover/press/click state with palette swap
    │   ├── sixLogo.ts            glTF mesh ↔ wordmark ↔ flowfield, 3-state cycle
    │   ├── flowfield.ts          CPU bounded curl-flowfield
    │   └── flowfieldGpu.ts       WebGPU compute version (80K-500K particles)
    └── lib/
        ├── screeanNav.ts      Particle highlight that flies between nav items
        ├── screeanWipe.ts     Particle bar that masks a content swap
        ├── componentReel.ts   Tile reel: rasterize → dissolve → reform on cycle
        ├── Reel.ts            Pure timer/state-machine driver
        ├── embed.ts           Stage class + shared RAF ticker
        ├── flowfield.ts       Stacked-sine flow + bounded particle drift
        ├── fullscreen.ts      Canvas-wrap fullscreen toggle helper
        └── gltf.ts            .glb parser + area-weighted surface sampler
```

## Run it

```sh
pnpm install
pnpm dev          # site SPA at http://localhost:3100/
pnpm test         # 141 tests
pnpm build        # type-check + bundle all entries
```

The dev server serves five entries:

| URL | What |
|---|---|
| `/` | Showcase site SPA (landing + `/components` + `/experiments/*`) |
| `/components.html` | Button-grid dissolve demo |
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
| `label`  | `BaseComponentOpts & { label, font?, ariaRole?, z? }`  | role=text \| heading |
| `button` | `InteractiveOpts & SizedOpts & { label, onClick }`     | role=button + aria-pressed/checked |
| `card`   | `BaseComponentOpts & SizedOpts & { title, body, ... }` | role=none (decorative) |
| `toggle` | `InteractiveOpts & SizedOpts & { on, onChange }`       | role=switch + aria-checked |
| `slider` | `InteractiveOpts & SizedOpts & { value, min?, max?, onChange }` | role=slider + aria-valuenow/min/max |

Components are **consumer-controlled**: state (`pressed`, `checked`, `on`, `value`) is captured at construction; the consumer rebuilds with the new value on change. Mirrors React's controlled-input pattern.

## DOM mirror

`createDomMirror({ scene, host })` mounts an invisible `<div>` per component, parented to a single `#screean-mirror` container above the canvas. The div carries the component's role + ARIA state, sits at the component's world-bounds rect, and dispatches `click` + `keydown(Enter|Space)` into the component's `onClick`. Inline `font` + `line-height: 1` keep the DOM glyph metrics aligned with the canvas rasterization.

This is what makes screen readers, keyboard focus, IME, copy/paste, and forced-color modes Just Work — without re-implementing them on canvas.

## How `screean` dependency works

`screean` is linked via `"screean": "file:../screean"` in `package.json`. Vite excludes it from `optimizeDeps` so HMR works when editing engine internals.

The site (in `site/`) consumes `screean` through the same package barrel any external consumer would (`import { node, circle, spawn } from 'screean'`). It does NOT reach into the engine's `src/`.

## Cross-platform deployment

This package is designed to ship unchanged across three deployment targets:

- **Web** — the showcase site as-is, deployed to any static host
- **iOS app** — wrapped in Capacitor / WKWebView. Same TS, same Vite build
- **visionOS** — via Safari/WebXR (Apple Vision Pro). Same WGSL drives spatial scenes (Safari 26.2+)

The CPU engine is the universal baseline; `flowfield-gpu` is a WebGPU compute showpiece that runs natively on every modern browser including Safari 26+ on Apple platforms. See [`screean/docs/RFC-cross-platform.md`](../screean/docs/RFC-cross-platform.md) for the matrix and architectural decisions.
