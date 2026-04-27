// routePointerEvent — one-call helper that turns a world-space pointer event
// into a dispatched component handler. Consumer pattern:
//
//   canvas.addEventListener('pointerdown', (e) => {
//     const [sx, sy] = [e.clientX, e.clientY];
//     const world = ui.camera!.toWorld([sx, sy]);
//     const hit = routePointerEvent(ui, 'click', world, [sx, sy]);
//     if (!hit) fallthroughBehavior();  // empty-space click
//   });
//
// Returns `true` iff a matching handler fired, so the consumer can decide
// whether to take a default action on empty space. Disabled components never
// fire handlers.
//
// World coords in, world coords on the event. `screen` is optional; when
// provided it's echoed through to the ComponentEvent for consumers who need
// to render DOM overlays at the click's pixel location.

import type { Scene, Vec2 } from 'screean';
import { findComponentAncestor } from '../component';
import type { ComponentEvent } from '../types';

export type RoutablePointerType =
  | 'click'
  | 'pointerdown'
  | 'pointerup'
  | 'pointermove'
  | 'pointerenter'
  | 'pointerleave';

export const routePointerEvent = (
  scene: Scene,
  type: RoutablePointerType,
  world: Vec2,
  screen: Vec2 = world,
): boolean => {
  const hitLeaf = scene.hitTest(world[0], world[1]);
  if (!hitLeaf) return false;
  const component = findComponentAncestor(hitLeaf);
  if (!component) return false;
  if (component._component.disabled) return false;

  // Today's handler set only maps 'click' to `onClick`. As hover/press
  // routing matures the map grows — kept explicit here (vs. a generic string
  // dispatch) so that a typo in `type` fails a TypeScript narrowing rather
  // than silently matching nothing at runtime.
  const handler =
    type === 'click'
      ? component._component.handlers.onClick
      : undefined;
  if (!handler) return false;

  const event: ComponentEvent = {
    type,
    x: world[0],
    y: world[1],
    world,
    screen,
    get local(): Vec2 {
      // Identity-local for v1. A component rendered under a transformed
      // parent would need the full inverse chain — extend this when
      // per-component transform inverse caching lands in screean.
      return world;
    },
    component,
  };
  handler(event);
  return true;
};
