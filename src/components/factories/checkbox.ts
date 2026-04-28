// checkbox — boolean state control with a square chrome and an inner mark
// when checked. Like toggle, consumer-controlled: pass `checked` + `onChange`,
// rebuild on activation. Three-state checkboxes (`'mixed'`) are supported
// via the same field — useful for "select all" controls reflecting partial
// child selection.
//
// ARIA: role=checkbox + aria-checked={checked}. domMirror writes both.

import { node, rect, type SceneNode } from 'screean';
import { component } from '../component';
import type {
  Component,
  Handler,
  InteractiveOpts,
  SizedOpts,
} from '../types';

export type CheckboxOpts = InteractiveOpts &
  Pick<SizedOpts, 'width' | 'height' | 'radius' | 'z'> & {
    // Current state. `'mixed'` = indeterminate (partial-selection indicator).
    checked: boolean | 'mixed';
    // Activation handler. New value is `!checked` for booleans; consumer
    // decides what 'mixed' becomes (typically `true`).
    onChange: Handler;
  };

export const checkbox = (opts: CheckboxOpts): Component => {
  const size = opts.width ?? opts.height ?? 28;
  const w = opts.width ?? size;
  const h = opts.height ?? size;
  const radius = opts.radius ?? 4;

  // Outer chrome — small rounded square, the click target.
  const chrome = node(rect({ w, h, radius }), { z: 0 });

  // Inner mark — drawn only when checked or mixed. For checked we use a
  // smaller filled rect (a check glyph would need text rasterization for
  // one character; a centered fill reads as "on" cleanly across themes).
  // For mixed, a horizontal slab indicator (the convention for tri-state).
  const children: SceneNode[] = [chrome];
  if (opts.checked === true) {
    const inset = Math.max(4, Math.round(w * 0.22));
    const mark = node(
      rect({ w: w - inset * 2, h: h - inset * 2, radius: Math.max(1, radius - 2) }),
      { z: 1 },
    );
    children.push(mark);
  } else if (opts.checked === 'mixed') {
    const inset = Math.max(4, Math.round(w * 0.22));
    const slabH = Math.max(2, Math.round(h * 0.18));
    const mark = node(
      rect({ w: w - inset * 2, h: slabH, radius: 1 }),
      { z: 1 },
    );
    children.push(mark);
  }

  // Manual composition — children sit at zero anchor, the chrome's bounds
  // determine the component's bbox. With no `stack`, the inner mark stays
  // centered (rect is zero-anchored — both rect and chrome share top-left).
  const container: SceneNode = node(null, { z: opts.z ?? 0 });
  for (const c of children) {
    c.parent = container;
    container.children.push(c);
  }
  container.intrinsic = { x: 0, y: 0, w, h };

  return component(container, {
    id: opts.id,
    ariaRole: opts.ariaRole ?? 'checkbox',
    ariaLabel: opts.ariaLabel ?? labelFor(opts.checked),
    disabled: opts.disabled,
    checked: opts.checked,
    onClick: opts.onChange,
    onPointerEnter: opts.onPointerEnter,
    onPointerLeave: opts.onPointerLeave,
    onPointerDown: opts.onPointerDown,
    onPointerUp: opts.onPointerUp,
  });
};

const labelFor = (state: boolean | 'mixed'): string => {
  if (state === 'mixed') return 'partially checked';
  return state ? 'checked' : 'unchecked';
};
