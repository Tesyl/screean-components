// Stateful pointer tracker — the one piece of mutable state the component
// event story needs. `routePointerEvent()` is stateless and handles discrete
// clicks; hover requires remembering the previously-hovered component to
// diff against, and press requires remembering which component the press
// started on.
//
// Consumer pattern:
//
//   const tracker = createPointerTracker(ui);
//   canvas.addEventListener('pointermove', (e) => {
//     const world = ui.camera!.toWorld([e.clientX, e.clientY]);
//     tracker.onPointerMove(world, [e.clientX, e.clientY]);
//   });
//   canvas.addEventListener('pointerdown',  (e) => {
//     const world = ui.camera!.toWorld([e.clientX, e.clientY]);
//     tracker.onPointerDown(world, [e.clientX, e.clientY]);
//   });
//   canvas.addEventListener('pointerup',    (e) => {
//     const world = ui.camera!.toWorld([e.clientX, e.clientY]);
//     tracker.onPointerUp(world, [e.clientX, e.clientY]);
//   });
//   canvas.addEventListener('pointerleave', () => tracker.onPointerLeaveCanvas());
//
// The tracker fires component handlers at the right moments — one
// onPointerEnter per new component, one onPointerLeave per component the
// pointer moves off of, onPointerDown on press start, and onPointerUp on
// release. Consumer does not need to track any hover/press state themselves.
//
// Press-and-release semantics match native HTML buttons: if you press on A
// and release on B, onPointerDown fires on A, onPointerUp fires on B, and
// neither gets a click. Click semantics live in routePointerEvent (fired
// explicitly on 'click' pointer events).

import type { Scene, SceneNode, Vec2 } from 'screean';
import { findComponentAncestor } from './component';
import type { Component, ComponentEvent } from './types';

export type PointerTracker = {
  // Returns the component currently under the pointer, or null. Read-only
  // view for consumers that want to know hover state outside handlers.
  readonly hovered: Component | null;
  readonly pressed: Component | null;
  // Route a pointermove at (world). If the hovered component changed, fires
  // onPointerLeave on the old one and onPointerEnter on the new one.
  onPointerMove: (world: Vec2, screen?: Vec2) => void;
  // Route a pointerdown at (world). Fires onPointerDown on whatever
  // component is currently under the pointer, records it as pressed.
  onPointerDown: (world: Vec2, screen?: Vec2) => void;
  // Route a pointerup. Fires onPointerUp on whatever's currently under the
  // pointer (may differ from the pressed component). Clears pressed.
  onPointerUp: (world: Vec2, screen?: Vec2) => void;
  // Handle the pointer leaving the canvas entirely — clears hover/press
  // state and fires onPointerLeave on the last-hovered component if any.
  onPointerLeaveCanvas: () => void;
  // Reset internal state without firing any handlers. Useful when rebuilding
  // the scene (old component references are stale; suppress handler calls
  // on defunct nodes).
  reset: () => void;
};

export const createPointerTracker = (scene: Scene): PointerTracker => {
  let hovered: Component | null = null;
  let pressed: Component | null = null;

  const hitComponentAt = (world: Vec2): Component | null => {
    const leaf = scene.hitTest(world[0], world[1]);
    return findComponentAncestor(leaf);
  };

  const makeEvent = (
    type: ComponentEvent['type'],
    component: Component,
    world: Vec2,
    screen: Vec2,
  ): ComponentEvent => ({
    type,
    x: world[0],
    y: world[1],
    world,
    screen,
    get local(): Vec2 {
      return world; // identity-local for v1 (same caveat as routePointerEvent)
    },
    component,
  });

  // A disabled component never fires handlers — matches the routePointerEvent
  // behavior so the two dispatch paths agree.
  const fire = (
    comp: Component,
    kind: keyof Component['_component']['handlers'],
    world: Vec2,
    screen: Vec2,
    eventType: ComponentEvent['type'],
  ): void => {
    if (comp._component.disabled) return;
    const h = comp._component.handlers[kind];
    h?.(makeEvent(eventType, comp, world, screen));
  };

  const onPointerMove: PointerTracker['onPointerMove'] = (world, screen = world) => {
    const next = hitComponentAt(world);
    if (next === hovered) return;
    if (hovered) fire(hovered, 'onPointerLeave', world, screen, 'pointerleave');
    hovered = next;
    if (hovered) fire(hovered, 'onPointerEnter', world, screen, 'pointerenter');
  };

  const onPointerDown: PointerTracker['onPointerDown'] = (world, screen = world) => {
    // Refresh hover just in case the consumer called onPointerDown without a
    // prior onPointerMove (e.g. touch devices where the first event is a tap).
    const under = hitComponentAt(world);
    if (under !== hovered) {
      if (hovered) fire(hovered, 'onPointerLeave', world, screen, 'pointerleave');
      hovered = under;
      if (hovered) fire(hovered, 'onPointerEnter', world, screen, 'pointerenter');
    }
    pressed = hovered;
    if (pressed) fire(pressed, 'onPointerDown', world, screen, 'pointerdown');
  };

  const onPointerUp: PointerTracker['onPointerUp'] = (world, screen = world) => {
    // Fire onPointerUp on whatever's under the pointer NOW. This may differ
    // from `pressed` if the user dragged off — native HTML buttons behave
    // this way (only the `click` event is cross-gated on same-component).
    const under = hitComponentAt(world);
    if (under !== hovered) {
      if (hovered) fire(hovered, 'onPointerLeave', world, screen, 'pointerleave');
      hovered = under;
      if (hovered) fire(hovered, 'onPointerEnter', world, screen, 'pointerenter');
    }
    if (under) fire(under, 'onPointerUp', world, screen, 'pointerup');
    pressed = null;
  };

  const onPointerLeaveCanvas: PointerTracker['onPointerLeaveCanvas'] = () => {
    if (hovered) {
      // Synthesize a "leave" event; canvas leave doesn't carry coords. Use
      // a far-off sentinel so consumers reading event.world get something
      // predictable (vs. undefined or stale).
      const offscreen: Vec2 = [Number.NaN, Number.NaN];
      fire(hovered, 'onPointerLeave', offscreen, offscreen, 'pointerleave');
    }
    hovered = null;
    pressed = null;
  };

  const reset: PointerTracker['reset'] = () => {
    hovered = null;
    pressed = null;
  };

  return {
    get hovered(): Component | null {
      return hovered;
    },
    get pressed(): Component | null {
      return pressed;
    },
    onPointerMove,
    onPointerDown,
    onPointerUp,
    onPointerLeaveCanvas,
    reset,
  };
};

// Thin helper: union indices of whichever component is currently hovered (or
// pressed). Returns empty array if no component is in that state. Lets a RAF
// consumer do `world.particles[i].weight = boost` in a single loop without
// plumbing the component reference through.
export const indicesUnderPointer = (
  scene: Scene,
  tracker: PointerTracker,
  which: 'hovered' | 'pressed' = 'hovered',
): readonly number[] => {
  const comp = which === 'hovered' ? tracker.hovered : tracker.pressed;
  if (!comp) return [];
  return scene.indicesForSubtree(comp);
};

// Re-export so scene-tree consumers don't have to double-import.
export type { SceneNode };
