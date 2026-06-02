// Component types.
//
// A component is a SceneNode with a `_component` internals tag that carries
// event handlers, ARIA metadata, and UI state flags (disabled / pressed /
// checked). Composing a component does not add a new tree hop — the tag
// lives on the container SceneNode that already wraps the compositional
// subtree (e.g. the `stack` that holds a button's rect + label).
//
// Event coordinates are world-space by default (matches screean's scene-graph
// hit-test convention); `screen` and `local` are available as escape hatches.
//
// State philosophy (consumer-controlled):
//   - `disabled`, `pressed`, `checked` are STATIC values captured when the
//     component is built. The factory doesn't own state — the consumer does.
//   - To flip a toggle, the consumer rebuilds the component with `pressed:
//     newValue` and swaps it into the scene, OR mutates `_component` via the
//     component-model escape hatch (not recommended — breaks determinism).
//   - This mirrors the "React controlled input" pattern: state lives in the
//     consumer, the component is a pure projection.
//   - Every new factory (toggle, slider, checkbox, radio) follows this shape:
//     takes the current value + an `onChange`-style handler, renders that
//     value, and trusts the caller to re-build on change.

import type { SceneNode, Vec2 } from '@tesyl/screean';

// Closed role set — open enough for v1 components, closed enough that typos
// fail compilation. Expand deliberately when a new factory lands.
export type AriaRole =
  | 'button'
  | 'checkbox'
  | 'heading'
  | 'img'
  | 'link'
  | 'none'
  | 'radio'
  | 'slider'
  | 'switch'
  | 'text'
  | 'textbox';

// World-space coords are the primary; screen/local exposed for consumers that
// need them (gesture overlays, local-space drag math). Keeping them eager
// rather than lazy keeps the shape predictable at log/print time — the ~32
// bytes of allocation per event is not a hot-path concern for pointer events.
export type ComponentEvent = {
  type:
    | 'click'
    | 'pointerdown'
    | 'pointerup'
    | 'pointermove'
    | 'pointerenter'
    | 'pointerleave'
    // Continuous text-input event. Fires per keystroke from a textbox
    // mirror's underlying <input>. `value` carries the new string.
    | 'input';
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
  // Populated for `type: 'input'` events. Carries the new text content of
  // the underlying <input> mirror element. Undefined for all other events.
  value?: string;
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
  // Fires per keystroke for textbox-role components. The DOM mirror's
  // <input> element drives this — the consumer reads `e.value` for the new
  // string and rebuilds the component (controlled-input pattern, same as
  // every other state axis here).
  onInput?: Handler;
};

// ─── opt-shape hierarchy ────────────────────────────────────────────────────
// Every factory composes from these. Four categories:
//
//   BaseComponentOpts  — identity + a11y. Used by decorative components
//                        (label, image, heading) that have no behavior.
//   InteractiveOpts    — identity + a11y + handlers + state flags. Used by
//                        active controls (button, toggle, slider, checkbox).
//   SizedOpts          — visual chrome dimensions. Mixed in with the above
//                        for components that render their own rect chrome.
//   ComponentOpts      — the low-level component() factory's opts: everything
//                        in InteractiveOpts.
//
// Preferred composition pattern:
//     export type ButtonOpts = InteractiveOpts & SizedOpts & {
//       label: string;                // REQUIRED visible text
//       onClick: Handler;             // overrides the optional handler from
//                                     //   ComponentHandlers to require it
//     };
// TypeScript's intersection narrows optional → required cleanly.

// Identity + accessibility. Minimum for anything that shows up in the a11y tree.
export type BaseComponentOpts = {
  // Stable id. Auto-generated if omitted. Surfaces in ARIA and debug logs.
  // Consumers building stateful UIs should pass explicit ids so rebuilding a
  // component (e.g. toggling `pressed`) preserves identity in the a11y tree.
  id?: string;
  ariaRole?: AriaRole;
  ariaLabel?: string;
};

// Interactive controls — adds handlers + state flags on top of the base.
// Disabled / pressed / checked are the primary ARIA state bindings:
//   - `disabled` → `aria-disabled="true"` + `tabindex="-1"` + pointer-events: none
//   - `pressed`  → `aria-pressed="true|false"` for toggle-button semantics
//   - `checked`  → `aria-checked="true|false|mixed"` for checkbox/radio
//
// State flags are captured at construction time. The consumer owns the
// actual source of truth and rebuilds the component when state changes.
export type InteractiveOpts = BaseComponentOpts & ComponentHandlers & {
  disabled?: boolean;
  pressed?: boolean;
  checked?: boolean | 'mixed';
};

// Visual chrome sizing. Kept separate so decorative components (label, image)
// don't inherit dimensional props that don't apply to them.
export type SizedOpts = {
  width?: number;
  height?: number;
  radius?: number;
  font?: string;
  // Per-component z in the scene graph. Useful when a component needs to
  // draw above or below its siblings independent of traversal order.
  z?: number;
};

// The low-level component() factory's opts. Interactive + visual identity
// fields the mirror needs to render in lockstep with the particle field.
//
// Visual identity (font, width, height, radius) is captured here because
// BOTH projections — the particle rasterization and the DOM mirror — must
// agree on geometry. The factory composes the particle field from these
// numbers (rect width/height/radius, glyph metrics from font); the mirror
// reads the same numbers off internals and inlines them. There is no
// separate "particle layout" and "DOM layout" — there is one geometry
// declared once on the component, projected twice.
//
// Paint (color, shadow, border style, blur) is NOT captured here. Paint
// is theme-level and applied by the package stylesheet (overridable). The
// distinction matters: geometry must agree by construction, paint only
// has to agree aesthetically.
//
// `value`/`min`/`max` carry the slider/range axis: domMirror writes
// `aria-valuenow`/`aria-valuemin`/`aria-valuemax` when present. Set on
// role=slider (or role=spinbutton if/when added). Leave undefined for
// every other component — the mirror skips emitting the attrs.
export type ComponentOpts = InteractiveOpts & {
  // CSS font shorthand (e.g. '500 16px system-ui'). When set, `domMirror`
  // inlines this on the mirror div so DOM text matches the particle text
  // exactly. When undefined, the mirror falls back to consumer CSS.
  font?: string;
  // Chrome dimensions. When set, the particle field rasterizes these
  // exact pixels and the mirror inlines `border-radius` (radius) and
  // tracks the same width/height the bounds rect would give it. Keeping
  // them on internals lets the mirror render the rounded chrome that the
  // particle SDF rasterizes — without this, the mirror has square corners
  // while particles trace a pill.
  width?: number;
  height?: number;
  radius?: number;
  value?: number;
  min?: number;
  max?: number;
  // Text-input value for role=textbox components. The DOM mirror sets the
  // underlying <input>.value from this field. Distinct from `value` (which
  // is the numeric range axis for sliders) so the two state surfaces don't
  // collide on a single component.
  textValue?: string;
  // Initial drag state — slider sets this `false` at construction so the
  // dragging axis is tracked. `undefined` (default) = component is not
  // draggable; the `whileDragging` predicate stays inert.
  dragging?: boolean;
};

// A component IS a SceneNode. The internals live under `_component`; regular
// tree walking / hit-testing / layout treat it exactly like any other node.
// This is what lets `scene.bindAll(world.particles)` and `scene.hitTest(x, y)`
// keep working without knowing components exist.
//
// Fields mirror InteractiveOpts 1:1, but with defaults resolved: `disabled`
// is always boolean (defaults to false); `ariaLabel` is string | undefined
// (preserves the opt-in nature rather than collapsing to ''); `pressed` and
// `checked` are undefined when not applicable, so domMirror can skip writing
// their aria-* attributes when the component doesn't use them.
export type ComponentInternals = {
  id: string;
  role: AriaRole;
  ariaLabel: string | undefined;
  disabled: boolean;
  pressed: boolean | undefined;
  checked: boolean | 'mixed' | undefined;
  // Drag state — true while a pointer is held down on the component.
  // Sliders flip this on pointerdown/up so choreography's `whileDragging`
  // predicate can light up. `undefined` = component is not draggable
  // and the state isn't tracked. Mutated at runtime via
  // setComponentInternals (component.ts) — same swap-the-frozen-ref
  // pattern triggers use.
  dragging: boolean | undefined;
  // CSS font shorthand — captured so the DOM mirror inlines it and the
  // rendered DOM text matches the particle-rendered text size/family.
  // Undefined when the consumer didn't set one (mirror falls back to CSS).
  font: string | undefined;
  // Chrome geometry — populated when the factory composes a sized chrome
  // (button rect, card rect, toggle pill, etc). The mirror reads `radius`
  // to inline `border-radius`; width/height are duplicated here from the
  // particle field's bounds rect so the mirror has the same number even
  // when bounds aren't yet computed. Undefined for components that don't
  // ship their own chrome (label, image — the consumer or theme stylesheet
  // controls their box).
  width: number | undefined;
  height: number | undefined;
  radius: number | undefined;
  // Range-axis state for role=slider. `undefined` = component does not
  // participate in the value axis; mirror skips aria-valuenow / -valuemin
  // / -valuemax. A default of 0 would wrongly tag every component as a
  // sliderable to assistive tech.
  value: number | undefined;
  min: number | undefined;
  max: number | undefined;
  // Text-input state for role=textbox. domMirror writes it as the
  // underlying <input>.value; undefined = component is not text-editable
  // and the mirror renders a <div> as usual.
  textValue: string | undefined;
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
