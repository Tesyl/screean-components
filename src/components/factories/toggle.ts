// toggle — a stateful boolean control. Pill-shaped track with a circular
// thumb that sits on the left (off) or right (on). Click flips state.
//
// State pattern: consumer-controlled. The `on` value is captured at build
// time; the `onChange` handler fires with a ComponentEvent on click and the
// caller is expected to rebuild with the new `on` and swap into the scene.
// Mirrors React controlled-input semantics. State drift between renders is
// impossible by construction.
//
// ARIA: `role=switch` + `aria-checked={on}`. The DOM mirror writes both via
// the `checked` field on ComponentInternals.

import { node, rect, circleField, type SceneNode } from 'screean';
import { component } from '../component';
import { setPart } from '../choreography/parts';
import type {
  Component,
  Handler,
  InteractiveOpts,
  SizedOpts,
} from '../types';

export type ToggleOpts = InteractiveOpts &
  Pick<SizedOpts, 'width' | 'height' | 'z'> & {
    // Current state. Click fires onChange; consumer rebuilds with the new
    // value. The component does not flip state internally.
    on: boolean;
    // Activation handler. The new value is `!opts.on` — consumer can read
    // it without inspecting the event.
    onChange: Handler;
    // Optional thumb radius override. Default = height/2 - 4 so it fits
    // inside the track with 4px padding each side.
    thumbRadius?: number;
  };

export const toggle = (opts: ToggleOpts): Component => {
  const width = opts.width ?? 88;
  const height = opts.height ?? 40;
  const thumbR = opts.thumbRadius ?? Math.max(8, height / 2 - 4);

  // Track: rounded rect at the component's local origin (the scene-sugar
  // `rect()` is zero-anchored — the layout system / parent stack
  // positions it).
  const track = setPart(node(rect({ w: width, h: height, radius: height / 2 }), { z: 0 }), 'track');

  // Thumb: a circle field at an explicit position. circleField (raw field)
  // takes cx/cy directly — using it instead of the scene-sugar `circle()`
  // because we need the off-center placement that the on/off state demands.
  const cx = opts.on
    ? width - height / 2 // right edge: center one (height/2) in from the right
    : height / 2; // left edge: center one (height/2) in from the left
  const cy = height / 2;
  const thumb = setPart(node(circleField({ cx, cy, r: thumbR }), { z: 1 }), 'knob');

  // Manual composition (not stack) — stack auto-centers children, but the
  // thumb must sit at an explicit cx based on `on`. Container's intrinsic
  // bounds match the track so the DOM mirror sizes the hit area correctly.
  const container: SceneNode = node(null, { z: opts.z ?? 0 });
  container.children.push(track, thumb);
  track.parent = container;
  thumb.parent = container;
  container.intrinsic = { x: 0, y: 0, w: width, h: height };

  return component(container, {
    id: opts.id,
    ariaRole: opts.ariaRole ?? 'switch',
    ariaLabel: opts.ariaLabel ?? (opts.on ? 'on' : 'off'),
    disabled: opts.disabled,
    // `checked` is the ARIA state for role=switch. domMirror writes
    // aria-checked from this. The consumer's onChange rebuild flips it.
    checked: opts.on,
    onClick: opts.onChange,
    onPointerEnter: opts.onPointerEnter,
    onPointerLeave: opts.onPointerLeave,
    onPointerDown: opts.onPointerDown,
    onPointerUp: opts.onPointerUp,
  });
};
