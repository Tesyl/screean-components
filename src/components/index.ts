// Components public surface.
//
// screean's scene primitives are one layer; components wrap those primitives
// with handlers + ARIA metadata. A component IS a screean SceneNode —
// consumers who want to bypass the component layer still can.

export {
  type Component,
  type ComponentEvent,
  type ComponentHandlers,
  type ComponentOpts,
  type ComponentInternals,
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

export { label, type LabelOpts } from './label';
export { button, type ButtonOpts } from './button';

export {
  routePointerEvent,
  type RoutablePointerType,
} from './routePointerEvent';

export {
  createPointerTracker,
  indicesUnderPointer,
  type PointerTracker,
} from './pointerTracker';

export { popTo3D, type PopTo3DOpts, type PopTo3DHandle } from './popTo3D';

export { createFocusTracker, type FocusTracker } from './focusTracker';
export {
  routeKeyboardEvent,
  type RoutableKeyboardEvent,
} from './routeKeyboardEvent';
