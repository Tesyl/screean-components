// component() factory — tags an existing SceneNode subtree as a component.
//
// Unlike the scene-graph factories, component() is an IDENTITY FUNCTION on
// structure: it attaches `_component` metadata to the passed node and returns
// the SAME reference. No wrapping, no extra tree hop. Walks, hit-tests, and
// layout pass through unchanged. What changes is that event routers can now
// identify this subtree as a single addressable unit.
//
// Factory helpers (button, label) build a subtree via screean's `stack(...)`
// / `node(...)` and pass the root to component() to tag it.

import type { SceneNode } from 'screean';
import {
  isComponent,
  type Component,
  type ComponentInternals,
  type ComponentOpts,
  type AriaRole,
} from './types';

// Deterministic id counter — good enough for dev; consumers who need stability
// across renders pass an explicit `id`. Reset via __resetComponentIds for tests.
let _nextComponentId = 1;
export const __resetComponentIds = (): void => {
  _nextComponentId = 1;
};

// Generic factory. A tight, low-ceremony API used directly by consumers who
// need custom shapes, and indirectly by the button/label factories in this
// directory.
//
// Idempotency: calling component(node, ...) twice on the same node throws,
// because silently overwriting handlers is a bug magnet. If you need to update
// handlers after construction, mutate `node._component.handlers` — but that's
// intentionally awkward to discourage run-time reshuffling.
export const component = (
  node: SceneNode,
  opts: ComponentOpts = {},
): Component => {
  if (isComponent(node)) {
    throw new Error(
      `component(): node is already a component (id="${node._component.id}"). ` +
        `Wrap a fresh SceneNode — re-tagging is never the right fix.`,
    );
  }
  const id = opts.id ?? `c${_nextComponentId++}`;
  const role: AriaRole = opts.ariaRole ?? 'none';
  const handlers: ComponentInternals['handlers'] = Object.freeze({
    onClick: opts.onClick,
    onPointerEnter: opts.onPointerEnter,
    onPointerLeave: opts.onPointerLeave,
    onPointerDown: opts.onPointerDown,
    onPointerUp: opts.onPointerUp,
  });
  const internals: ComponentInternals = Object.freeze({
    id,
    role,
    ariaLabel: opts.ariaLabel,
    disabled: opts.disabled ?? false,
    // `pressed` and `checked` are explicitly `undefined` when not provided —
    // domMirror reads these to decide whether to emit `aria-pressed` /
    // `aria-checked` attrs. A default of `false` would wrongly label every
    // component as a toggle/checkbox to screen readers.
    pressed: opts.pressed,
    checked: opts.checked,
    font: opts.font,
    value: opts.value,
    min: opts.min,
    max: opts.max,
    handlers,
  });
  (node as Component)._component = internals;
  return node as Component;
};

// Walk up from any SceneNode (typically a hit-test result leaf) until finding
// the nearest component ancestor. Returns the component, or null if the node
// is not inside any component — e.g. decoration placed directly under a
// layout container without a component() wrap.
export const findComponentAncestor = (node: SceneNode | null): Component | null => {
  let cur: SceneNode | null = node;
  while (cur) {
    if (isComponent(cur)) return cur;
    cur = cur.parent;
  }
  return null;
};
