// Component types.
//
// A component is a SceneNode with a `_component` internals tag that carries
// event handlers and ARIA metadata. Composing a component does not add a new
// tree hop — the tag lives on the container SceneNode that already wraps the
// compositional subtree (e.g. the `stack` that holds a button's rect + label).
//
// Event coordinates are world-space by default (matches screean's scene-graph
// hit-test convention); `screen` and `local` are available as escape hatches.

import type { SceneNode, Vec2 } from 'screean';

// Closed role set — open enough for v1 components, closed enough that typos
// fail compilation. Expand deliberately when a new factory lands.
export type AriaRole =
  | 'button'
  | 'heading'
  | 'img'
  | 'link'
  | 'none'
  | 'text';

// World-space coords are the primary; screen/local exposed for consumers that
// need them (gesture overlays, local-space drag math). Keeping them eager
// rather than lazy keeps the shape predictable at log/print time — the ~32
// bytes of allocation per event is not a hot-path concern for pointer events.
export type ComponentEvent = {
  type: 'click' | 'pointerdown' | 'pointerup' | 'pointermove' | 'pointerenter' | 'pointerleave';
  // Primary coord — post-camera-inverse world space, matches `field.contains`.
  x: number;
  y: number;
  // Alias of (x, y); explicit for code that reads better with a named vector.
  world: Vec2;
  // Raw canvas-relative pixels (before camera inverse). Useful for DOM overlays.
  screen: Vec2;
  // World coord re-expressed in the component's local frame. Equivalent to
  // `world` for components not under a transformed parent; identity-local
  // for v1 until inverse-transform caching lands in screean.
  readonly local: Vec2;
  // The component whose handler is firing.
  component: Component;
};

export type Handler = (e: ComponentEvent) => void;

// The handler bag. Consumer-facing events:
//
//   onClick         — primary activation (pointerdown + pointerup on same component)
//   onPointerEnter  — pointer became hovered over the component
//   onPointerLeave  — pointer moved off the component (or off the canvas entirely)
//   onPointerDown   — press begins
//   onPointerUp     — press ends (may or may not be on the same component — see tracker)
//
// Keyboard + focus slot in when the DOM mirror lands. Every handler is
// optional; components can opt into exactly the interactions they need.
export type ComponentHandlers = {
  onClick?: Handler;
  onPointerEnter?: Handler;
  onPointerLeave?: Handler;
  onPointerDown?: Handler;
  onPointerUp?: Handler;
};

// Consumer-facing opts for the low-level component() factory. Factories like
// button() / label() wrap this with their own opts that default ariaLabel
// from visible text.
export type ComponentOpts = {
  // Stable id. Auto-generated if omitted. Surfaces in ARIA and debug logs.
  id?: string;
  ariaRole?: AriaRole;
  // If omitted, the component's accessible label is absent. Generic
  // component() stays permissive (no required ariaLabel); button/toggle/slider
  // enforce via their own opts.
  ariaLabel?: string;
  disabled?: boolean;
} & ComponentHandlers;

// A component IS a SceneNode. The internals live under `_component`; regular
// tree walking / hit-testing / layout treat it exactly like any other node.
// This is what lets `scene.bindAll(world.particles)` and `scene.hitTest(x, y)`
// keep working without knowing components exist.
export type ComponentInternals = {
  id: string;
  role: AriaRole;
  label: string | undefined;
  disabled: boolean;
  handlers: Readonly<ComponentHandlers>;
};

export type Component = SceneNode & {
  // Non-enumerable-ish marker. Scene-tree consumers that want to identify
  // components duck-type on this property's presence. Matches the `_bounds`,
  // `_flexWeight`, `_camera` pattern used elsewhere.
  _component: ComponentInternals;
};

// Type guard. Cheap and duck-typed; does not mutate.
export const isComponent = (n: SceneNode): n is Component =>
  !!(n as Component)._component;

// MirrorStrategy — how a component's DOM mirror keeps its position synchronized
// with its rendered-canvas counterpart. Two strategies planned; only one in
// production (P13 DOM mirror is not shipped yet, this type commits the shape).
//
// `div-overlay` — the current P13 plan: invisible <div> overlays tracked with
// rAF-reconciled CSS transforms. Portable across browsers.
//
// `layoutsubtree` — html-in-canvas fast path: the component's DOM element
// lives inside a `<canvas layoutsubtree>`. The browser owns layout, a11y, and
// hit-testing; `ctx.drawElementImage` returns the DOMMatrix that keeps DOM
// visual position synced with the rasterized pixels. Requires the Chromium
// `chrome://flags/#canvas-draw-element` flag at the time of writing.
//
// Consumers of the future P13 mirror API should branch on `kind` and treat
// this as a forward-compatible surface. See
// `docs/RFC-html-in-canvas-interop.md` §"Phase 3" and
// `docs/RFC-component-model.md` §5.
export type MirrorStrategy =
  | { kind: 'div-overlay' }
  | { kind: 'layoutsubtree'; canvas: HTMLCanvasElement };
