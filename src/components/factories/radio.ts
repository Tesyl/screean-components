// radio — single radio button. Visual: outer circle chrome with a smaller
// filled inner circle when selected. Consumers manage radiogroup logic
// externally (group of N radios, only one `checked: true` at a time, the
// `onChange` of each fires when activated).
//
// ARIA: role=radio + aria-checked={checked}. domMirror writes both. For
// proper radiogroup semantics, the consumer wraps the radios in a parent
// element with role="radiogroup" — that's a layout concern, not a
// component-factory concern.

import { node, circleField, type SceneNode } from 'screean';
import { component } from '../component';
import type {
  Component,
  Handler,
  InteractiveOpts,
  SizedOpts,
} from '../types';

export type RadioOpts = InteractiveOpts &
  Pick<SizedOpts, 'width' | 'height' | 'z'> & {
    // Whether this radio is the selected one in its group.
    checked: boolean;
    // Activation handler. Consumer rebuilds the OTHER radios in the group
    // with `checked: false` and this one with `checked: true`.
    onChange: Handler;
    // Optional override for the inner-dot radius. Default ~38% of the outer.
    dotRadius?: number;
  };

export const radio = (opts: RadioOpts): Component => {
  const size = opts.width ?? opts.height ?? 24;
  const w = opts.width ?? size;
  const h = opts.height ?? size;
  // Outer circle (the click target ring).
  const r = Math.min(w, h) / 2;
  const cx = w / 2;
  const cy = h / 2;
  const dotR = opts.dotRadius ?? Math.max(2, r * 0.42);

  const ring = node(circleField({ cx, cy, r }), { z: 0 });
  const children: SceneNode[] = [ring];
  if (opts.checked) {
    const dot = node(circleField({ cx, cy, r: dotR }), { z: 1 });
    children.push(dot);
  }

  // Manual composition keeps the inner dot at the explicit (cx, cy);
  // stack would re-center which we don't want for off-axis cases.
  const container: SceneNode = node(null, { z: opts.z ?? 0 });
  for (const c of children) {
    c.parent = container;
    container.children.push(c);
  }
  container.intrinsic = { x: 0, y: 0, w, h };

  return component(container, {
    id: opts.id,
    ariaRole: opts.ariaRole ?? 'radio',
    ariaLabel: opts.ariaLabel ?? (opts.checked ? 'selected' : 'not selected'),
    disabled: opts.disabled,
    checked: opts.checked,
    onClick: opts.onChange,
    onPointerEnter: opts.onPointerEnter,
    onPointerLeave: opts.onPointerLeave,
    onPointerDown: opts.onPointerDown,
    onPointerUp: opts.onPointerUp,
  });
};
