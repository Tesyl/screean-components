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
| `/components` | Storybook grid (fields · composition · layout · forces · presets · type · choreography · components · easing) |
| `/experiments` | Experiments index |
| `/experiments/<name>` | Lazy-loaded experiment (button · six-logo · flowfield · flowfield-gpu · controls) |
| `/lab` | Component lab — auto-redirects to first story |
| `/lab/<story>` | Per-component design surface — Props / Forces / Choreography / Globals / Code knobs (label · button · card · toggle · slider · checkbox · radio · text-field · image) |
| `/components.html`, `/html-interop.html`, `/routing-demo.html`, `/legacy-demo.html` | Standalone demo entries (Vite multi-page; not SPA routes) |

The original engine lab lives in the sibling `screean` repo (`pnpm dev` there opens it at `/`). The components lab here (`/lab/*`) is a different thing — a per-component design surface, not a generic particle-physics testbed.

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

## Adding a new lab story

The lab (`/lab/<story>`) is the per-component design surface. To add a story for a new component:

1. Create `site/lab/stories/<componentName>.ts` exporting a `LabStory` with `name`, `title`, `blurb`, `defaultProps`, `propDefs` (knob metadata), `build(props, onActivate)` (returns a Component), and `codeTemplate` (snippet shown in the Code tab).
2. Register it in `site/lab/registry.ts` — order in the array drives sidebar order.
3. The framework wires Stage / scene / DOM mirror / dissolve. Story does NOT need to manage lifecycle.
4. Wire the `onActivate` callback to the component's `onClick` / `onChange` so user clicks fire the dissolve choreography. Non-interactive components (label / card / image) skip this — the panel's "Trigger" button fires dissolve manually.

## Where to develop new UI experiments

Three paths, ordered by isolation:

1. **Lab story** — `site/lab/stories/<name>.ts`. Best for tuning per-component behavior (forces, choreography, props). Constrained: one component, knob-driven.
2. **Experiment** — `site/experiments/<name>.ts` registered in `experiments/registry.ts`. Best for a self-contained interactive demo (controls grid, dissolve workflow, custom physics, glTF cloud). Free-form: full Stage + scene control.
3. **Standalone demo** — top-level HTML at the package root (e.g. `routing-demo.html`) with its own `src/demos/<name>/main.ts`. Best for production-shaped flows (full-screen routing, multi-component layouts) that aren't SPA routes.

For most new component work, **start with a lab story**. Promote to an experiment when you need free-form interactivity beyond the lab's knob model.
