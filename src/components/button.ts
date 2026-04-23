// button — an interactive component composed of a rounded-rect chrome and an
// optional text label stacked on top of it. The stack is built with screean's
// `stack` primitive so vertical + horizontal centering is automatic.
//
// The button's FIELD for hit-test purposes is the rect (z=0, the bottom
// layer). The text sits above (z=1) so the renderer paints it on top. Because
// hit-test walks z-descending and then up the parent chain, a click anywhere
// on the text OR the rect routes to this button — exactly what you want.

import { node, rect, stack, text, type SceneNode } from 'screean';
import { component } from './component';
import type { Component, Handler } from './types';

export type ButtonOpts = {
  // Visible button text. Also the default accessible label.
  label: string;
  // Handler fired on click. Receives a ComponentEvent with world-space coords.
  onClick: Handler;
  // Optional hover + press handlers. Opt-in for buttons that want visual
  // feedback beyond the default. Consumer receives the same ComponentEvent
  // shape as onClick.
  onPointerEnter?: Handler;
  onPointerLeave?: Handler;
  onPointerDown?: Handler;
  onPointerUp?: Handler;
  // Chrome dimensions. Kept as opts rather than computed from text bounds so
  // the caller has explicit control over hit area — critical for touch UIs
  // where chrome often extends past the visible text.
  width?: number;
  height?: number;
  // Corner radius of the rounded rectangle. 0 = sharp corners.
  radius?: number;
  // Font spec for the label. Defaults to a neutral system-font weight.
  font?: string;
  // If the visible `label` is decorative / empty (icon-only), pass explicit
  // ariaLabel. Otherwise `label` doubles as the accessible label.
  ariaLabel?: string;
  id?: string;
  // Per-button z in the scene graph. Internal stacking of chrome (z=0) and
  // text (z=1) is handled internally and is NOT affected by this value.
  z?: number;
  disabled?: boolean;
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
    onClick: opts.onClick,
    onPointerEnter: opts.onPointerEnter,
    onPointerLeave: opts.onPointerLeave,
    onPointerDown: opts.onPointerDown,
    onPointerUp: opts.onPointerUp,
  });
};
