// Components public surface.
//
// screean's scene primitives are one layer; components wrap those primitives
// with handlers + ARIA metadata. A component IS a screean SceneNode —
// consumers who want to bypass the component layer still can.
//
// Source layout (subdirs are organizational, not API):
//   - types.ts + component.ts (root) — the core abstraction
//   - factories/ — visible components (button, card, label, slider, toggle)
//   - dom/ — DOM mirror
//   - choreography/ — pipeline-based motion primitives + recipes
//   - routing/ — event + focus routing
//   - ui/ — React shadcn versions
// External consumers should import via this barrel; the subdirs are private.

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

// ─── factories ─────────────────────────────────────────────────────────────
export { label, type LabelOpts } from './factories/label';
export { button, type ButtonOpts } from './factories/button';
export { card, type CardOpts } from './factories/card';
export { toggle, type ToggleOpts } from './factories/toggle';
export { slider, type SliderOpts } from './factories/slider';
export { checkbox, type CheckboxOpts } from './factories/checkbox';
export { radio, type RadioOpts } from './factories/radio';
export { image, type ImageOpts, type ImageSource } from './factories/image';
export { textField, type TextFieldOpts } from './factories/textField';

// ─── dom (mirror) ──────────────────────────────────────────────────────────
export {
  createDomMirror,
  type DomMirror,
  type DomMirrorOpts,
} from './dom/domMirror';

// ─── choreography ──────────────────────────────────────────────────────────
// Re-export the full choreography surface from this barrel so consumers
// don't need to reach into screean-components/choreography/ directly.
export * from './choreography';

// ─── routing (events + focus) ──────────────────────────────────────────────
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
