// Components public surface.
//
// THE STANDARD (Pattern A, DECISION-component-rendering-pattern.md):
//   - transition/ — the ONE dissolve/swap engine (createScreenController)
//   - headless/   — DOM-first component factories (real elements are the
//                   source of truth; particles are a transition artifact)
//   - RenderStrategy — compile-enforced discrete vs continuous boundary
// See docs/headless-components-guide.md for the canonical how-to.
//
// LEGACY (Pattern B, deprecated — retained only for src/demos/legacy-demo
// and scene-graph particle work):
//   - types.ts + component.ts — SceneNode component tagging
//   - factories/ — button + label SDF factories (the others are deleted)
//   - routing/ — canvas hit-test event routing
// The DOM mirror and the choreography `dissolve` recipe are deleted; the
// choreography subsystem itself remains for free-particle motion (pipelines,
// runner, popTo3D / visual.fallAway — see the visual-fallaway experiment).
// External consumers should import via this barrel; the subdirs are private.

// ─── transition core (THE dissolve/swap engine — Decision point 4) ──────────
export * from './transition';

// ─── headless (DOM-first / Pattern A) components — the standard ─────────────
export * from './headless';

// ─── render strategy (Pattern A, audit §4 Step 0) ───────────────────────────
export {
  RENDER_STRATEGY_BY_ROLE,
  renderStrategyOf,
  type RenderStrategy,
} from './types';

// ═══ LEGACY Pattern B surface below — deprecated ════════════════════════════

export {
  type Component,
  type ComponentEvent,
  type ComponentHandlers,
  type ComponentOpts,
  type ComponentInternals,
  type BaseComponentOpts,
  type InteractiveOpts,
  type SizedOpts,
  type Handler,
  type AriaRole,
  type MirrorStrategy,
  isComponent,
} from './types';

export {
  component,
  findComponentAncestor,
  __resetComponentIds,
} from './component';

// ─── legacy factories (SDF scene-graph) ─────────────────────────────────────
export { label, type LabelOpts } from './factories/label';
export { button, type ButtonOpts } from './factories/button';

// ─── choreography ──────────────────────────────────────────────────────────
// Free-particle motion system (pipelines, runner, effects). Still current
// for particle work; no longer the component-dissolve mechanism.
export * from './choreography';

// ─── routing (events + focus) — legacy canvas hit-testing ───────────────────
export {
  routePointerEvent,
  type RoutablePointerType,
} from './routing/routePointerEvent';

export {
  createPointerTracker,
  indicesUnderPointer,
  type PointerTracker,
} from './routing/pointerTracker';

export { createFocusTracker, type FocusTracker } from './routing/focusTracker';
export {
  routeKeyboardEvent,
  type RoutableKeyboardEvent,
} from './routing/routeKeyboardEvent';
