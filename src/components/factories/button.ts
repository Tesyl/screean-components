// button — an interactive component composed of a rounded-rect chrome and an
// optional text label stacked on top of it. The stack is built with screean's
// `stack` primitive so vertical + horizontal centering is automatic.
//
// The button's FIELD for hit-test purposes is the rect (z=0, the bottom
// layer). The text sits above (z=1) so the renderer paints it on top. Because
// hit-test walks z-descending and then up the parent chain, a click anywhere
// on the text OR the rect routes to this button — exactly what you want.

import { node, rect, stack, text, type SceneNode } from 'screean';
import { component } from '../component';
import type {
  Component,
  Handler,
  InteractiveOpts,
  SizedOpts,
} from '../types';

// Button opts = handlers + a11y + state (from InteractiveOpts)
//             + visual chrome (from SizedOpts)
//             + `label` (REQUIRED visible text; also defaults `ariaLabel`)
//             + `onClick` (REQUIRED — intersection narrows the optional
//               `onClick?: Handler` from ComponentHandlers to required).
//
// Everything else (onPointerEnter, disabled, pressed, ariaRole, etc.) is
// inherited as-is. Adding a new handler to ComponentHandlers automatically
// surfaces on ButtonOpts without a code change here.
export type ButtonOpts = InteractiveOpts & SizedOpts & {
  label: string;
  onClick: Handler;
};

export const button = (opts: ButtonOpts): Component => {
  const width = opts.width ?? 200;
  const height = opts.height ?? 56;
  const radius = opts.radius ?? 14;
  const font = opts.font ?? '600 20px system-ui, -apple-system, sans-serif';

  // Build the compositional subtree. stack() auto-centers children on their
  // mutual midpoint, so text lands dead-center on the chrome regardless of
  // text width.
  const chrome = node(rect({ w: width, h: height, radius }), { z: 0 });
  const children: SceneNode[] = [chrome];
  if (opts.label !== '') {
    const labelLeaf = node(text({ text: opts.label, font }), { z: 1 });
    children.push(labelLeaf);
  }
  const container = stack(children, { z: opts.z ?? 0 });

  return component(container, {
    id: opts.id,
    ariaRole: 'button',
    // `label` doubles as `ariaLabel` by default. Icon-only buttons pass
    // ariaLabel explicitly; we don't try to be clever about detecting them.
    ariaLabel: opts.ariaLabel ?? opts.label,
    disabled: opts.disabled,
    pressed: opts.pressed,
    checked: opts.checked,
    // Same font used for the particle text goes onto the component — the
    // DOM mirror reads this to inline the same `font` on the mirror div,
    // so DOM text and particle text stay in lockstep on size/weight.
    font,
    // Geometry: the same numbers the rect() particle field rasterized.
    // The mirror reads these and inlines border-radius (so the mirror has
    // the same rounded corners as the particle SDF) — width/height also
    // travel here as a future hardening hook even though the bounds rect
    // already carries them.
    width,
    height,
    radius,
    onClick: opts.onClick,
    onPointerEnter: opts.onPointerEnter,
    onPointerLeave: opts.onPointerLeave,
    onPointerDown: opts.onPointerDown,
    onPointerUp: opts.onPointerUp,
  });
};
