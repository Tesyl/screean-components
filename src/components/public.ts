// Public vanilla surface for the `./components` subpath export.
//
// Pattern A (DOM-first) ONLY — the deprecated legacy Pattern B surface
// re-exported by ./index.ts (scene-graph factories, routing, DOM mirror)
// stays internal and must never ship here. A vanilla consumer gets:
//
//   • the 9 headless factories (+ their handle/opts types)
//   • the transition core re-export (createScreenController + tuning types)
//     so a controller can be constructed without importing the engine's
//     internals knowledge
//   • the compile-time role → render-strategy boundary
//
// React consumers should prefer the `./react` subpath (component wrappers
// over these factories).

export * from './headless';
export * from './transition';
export {
  RENDER_STRATEGY_BY_ROLE,
  renderStrategyOf,
  type AriaRole,
  type RenderStrategy,
} from './types';
