// popTo3D — animate a component's particles along the depth axis.
//
// Sets `tz` on every particle bound to the component's subtree; the engine's
// z-spring physics pulls `z` toward `tz` smoothly. After `holdMs` (if set),
// the particles snap back to their rest depth (usually 0).
//
// This is the button-goes-3D helper. Typical use:
//
//   const tracker = createPointerTracker(scene);
//   button({
//     label: 'Enter',
//     onClick: () => popTo3D({
//       scene, component: tracker.hovered!, particles: world.particles,
//       tz: 5, holdMs: 400,
//     }),
//   });
//
// Returns a `reset` function. Callers who want manual control (no timer-based
// snap-back) pass `holdMs: undefined` and invoke `reset()` themselves.
//
// Types are strict: `tz` is a plain number (positive = closer to camera,
// negative = receding). `particles` is read-only from our perspective — we
// only mutate the `tz` field on entries the component's subtree owns.

import type { Particle, Scene, SceneNode } from 'screean';

export type PopTo3DOpts = {
  // The scene the component lives under. Used to look up which particle
  // indices belong to the component's subtree.
  scene: Scene;
  // The subtree whose particles should pop. Typically a Component from
  // screean-components, but any SceneNode works — the engine's
  // `indicesForSubtree` treats them uniformly.
  subtree: SceneNode;
  // The pool to animate. Pass `world.particles`.
  particles: Particle[];
  // Target depth. Positive = closer to camera (larger on screen), negative =
  // further (smaller). Try ±3 for subtle, ±8 for dramatic.
  tz: number;
  // How long to hold at `tz` before returning to rest depth. If omitted,
  // particles stay at `tz` indefinitely until the caller invokes `reset()`.
  holdMs?: number;
  // Rest depth to snap back to when the hold ends or `reset()` is called.
  // Defaults to 0 (screen plane).
  restTz?: number;
};

export type PopTo3DHandle = {
  // Restore all affected particles to `restTz` immediately. Cancels any
  // pending auto-restore timer. Safe to call multiple times.
  reset: () => void;
};

export const popTo3D = (opts: PopTo3DOpts): PopTo3DHandle => {
  const restTz = opts.restTz ?? 0;
  const indices = opts.scene.indicesForSubtree(opts.subtree);

  for (const i of indices) {
    const p = opts.particles[i];
    if (p && p.life > 0) p.tz = opts.tz;
  }

  let timer: ReturnType<typeof setTimeout> | null = null;
  let done = false;

  const reset = (): void => {
    if (done) return;
    done = true;
    if (timer !== null) {
      clearTimeout(timer);
      timer = null;
    }
    for (const i of indices) {
      const p = opts.particles[i];
      if (p && p.life > 0) p.tz = restTz;
    }
  };

  if (opts.holdMs !== undefined) {
    timer = setTimeout(reset, opts.holdMs);
  }

  return { reset };
};
