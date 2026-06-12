// Test fixtures — minimal scene-graph components for choreography tests.
//
// The choreography state-trigger tests exercised the legacy slider/toggle
// factories purely as convenient Component sources (role + parts + the
// `dragging` axis wiring). Those factories were deleted in the Pattern A
// migration; these fixtures replicate ONLY the wiring the tests assert —
// they are not library surface and must not be exported from any barrel.

import { node, rect, stack } from '@tesyl/screean';
import { component, setComponentInternals } from '../component';
import { setPart } from './parts';
import type { Component, Handler } from '../types';

// Slider-shaped fixture: role 'slider' with the deleted factory's THREE
// leaves (track / fill / thumb — the narrow() tests bind particles 'equal'
// across leaves and count per-part shares), plus pointer handlers that flip
// the `dragging` internals axis exactly the way the factory did
// (down → true, up → false).
export const testSlider = (opts: {
  onPointerDown?: Handler;
  onPointerUp?: Handler;
} = {}): Component => {
  const track = setPart(node(rect({ w: 160, h: 6, radius: 3 }), { z: 0 }), 'track');
  const fill = setPart(node(rect({ w: 80, h: 6, radius: 3 }), { z: 1 }), 'fill');
  const thumb = setPart(node(rect({ w: 14, h: 14, radius: 7 }), { z: 2 }), 'thumb');
  const container = stack([track, fill, thumb]);

  // Forward-declared so the wrapped handlers (constructed before component()
  // returns) can flip internals on the final reference.
  let c: Component;
  const onPointerDownWrapped: Handler = (ev) => {
    setComponentInternals(c, { dragging: true });
    opts.onPointerDown?.(ev);
  };
  const onPointerUpWrapped: Handler = (ev) => {
    setComponentInternals(c, { dragging: false });
    opts.onPointerUp?.(ev);
  };

  c = component(container, {
    ariaRole: 'slider',
    ariaLabel: 'test slider',
    dragging: false,
    onPointerDown: onPointerDownWrapped,
    onPointerUp: onPointerUpWrapped,
  });
  return c;
};

// Switch-shaped fixture: role 'switch' with a 'knob' part — enough for the
// registry-resolution and narrow() paths the tests walk.
export const testToggle = (opts: { onClick?: Handler } = {}): Component => {
  const trackNode = setPart(node(rect({ w: 40, h: 22, radius: 11 }), { z: 0 }), 'track');
  const knob = setPart(node(rect({ w: 16, h: 16, radius: 8 }), { z: 1 }), 'knob');
  return component(stack([trackNode, knob]), {
    ariaRole: 'switch',
    ariaLabel: 'test toggle',
    checked: false,
    onClick: opts.onClick,
  });
};
