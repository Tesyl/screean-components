# site/ — the screean demo site

A vanilla-TS SPA that consumes screean's engine and showcases its primitives + animations. The site is also where we develop new UI experiments and components on top of the engine.

## Layers

```
site/
├── main.ts          ← SPA bootstrap. Listens to router, applies theme, mounts pages.
├── router.ts        ← Path-based route resolver (history API, no hash routing).
├── themes.ts        ← CSS-variable token tables + applyTheme().
├── layout.ts        ← Shared chrome (nav, footer).
├── embed.ts         ← Stage class (one Canvas + World + Renderer + force stack)
│                       and the shared RAF ticker.
├── style.css        ← Single stylesheet, theme-driven via var(--token).
└── pages/
    ├── landing.ts   ← Hero + specsheet + pillars + Force Playground + Choreography Reel + CTA.
    └── components.ts ← Storybook-style grid of primitive demos.
```

## Routes

| Path | Page |
|------|------|
| `/` | Landing |
| `/components` | Storybook grid |
| `/experiments` | Experiments index |
| `/experiments/<name>` | Lazy-loaded per-component experiment |
| `/components.html`, `/html-interop.html`, `/routing-demo.html` | Standalone demo entries (separate Vite multi-page entries, not SPA routes) |

The original engine lab lives in the sibling `screean` repo (`pnpm dev` there opens it at `/`). The site is the components/showcase surface and consumes the engine through the `screean` package barrel.

## Stage — the embed primitive

`Stage` (in `embed.ts`) is the single way to put a screean canvas anywhere in the site. It owns a `World`, a `Renderer`, a force stack, a current scene, and a lifecycle (`.dispose()`). Every animated canvas on the site goes through it.

```ts
const stage = new Stage({
  canvas, width, height,
  feel: theme.feel,                // preset name
  feelOverrides: { springK: 60 },  // partial overrides
  palette: theme.palette,          // HSL params for color sampling
  particleCount: 1500,
  spawnFrom: 'edge' | 'center',
  pointerProvider: windowPointer,  // optional cursor attractor
});
stage.setScene((w, h) => node(circle({ r: 60 })));
// later:
stage.setFeelOverrides({ springK: 80 });   // live-tune force constants
stage.retheme(palette, feel, overrides);   // swap palette + feel preset
stage.dispose();                           // tear down (page teardown calls this)
```

A single shared `ticker` in `embed.ts` drives every active Stage from one RAF — adding 20 small canvases costs one frame, not 20.

## Adding a new section to the landing

1. Open `pages/landing.ts`.
2. Append a `<section>` with a stable `id` (used by the nav anchor list).
3. Add the new section to `NAV_SECTIONS` near the top of the file.
4. If the section has a Stage, capture it in the teardown closure so the router cleans up on route change.
5. Style with the existing `.section-head` + `.surface-card` patterns; add bespoke classes scoped to the section name (`.playground-…`, `.reel-…`).

## Adding a new tile to the components page

1. Open `pages/components.ts`.
2. Find the appropriate group builder (`fieldsGroup`, `forcesGroup`, `presetsGroup`, etc.) or add a new one.
3. Each tile is a `TileDef`: `{ name, blurb, code, mount(canvas, w, h) → TileSetup }`.
4. `mount()` returns a `TileSetup` whose `stage` will be auto-disposed on page teardown.
5. New groups get added to the `groups` array in `renderComponents()`.

If the file gets unwieldy, split each group's builder into `site/stories/<group>.ts` and import.

## Theme system

`applyTheme(id)` writes CSS variables to `<body>`. The stylesheet only references variables — no hex codes inline. To add a theme, add a `Theme` record to `THEMES` in `themes.ts` and (if it needs theme-specific styling beyond variables) add gated rules in `style.css` keyed off `body[data-theme="<lowercased name>"]`.

The site currently renders **Acid** for every route. Other themes live in the `THEMES` table for design history and are not removed because the components page's preset/palette demos still reference them through the engine's `feels` table.

## Where to develop new UI experiments

Today: add sections to the landing or tiles to the components page.

For more isolated prototyping, propose creating a `site/experiments/` directory + a `/experiments/<name>` route. The router is small enough to extend in <10 lines (see `router.ts`).

The component layer staged in `to-move/src/components/` (button, label, pointerTracker, routePointerEvent) is the substrate built for screean-on-top UI. We have not promoted it into `site/` yet; doing so is the natural next step before building rich interactive demos.
