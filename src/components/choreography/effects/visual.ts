// visual — namespace of "depth as illusion" effects.
//
// Distinct from PHYSICAL depth (popTo3D + setTz + the integrator's z-spring).
// Visual effects produce the *appearance* of depth — receding, peeling
// back, rising forward — using only the existing 2D primitives (scale +
// fade + position offsets). No per-particle z, no struct changes, no
// integrator costs.
//
// Trade-off: visual effects work on every backend identically (CPU, GPU,
// future visionOS) because they don't depend on z. They lose composability
// with REAL depth — a card that's grabbable in 3D space needs the
// physical primitives. For 99% of UI dismissals / peek-back / receding
// transitions, the visual version is the right call.
//
// See docs/RFC-effect-language.md for the visual-vs-physical framing.

import { collapsePipelineToEffect } from './_recipe';
import { pipe, at } from '../pipeline';
import { fade } from './fade';
import { scale } from './scale';
import type { Easing } from '@tesyl/screean';
import type { Effect } from '../effect';

export type FallAwayOpts = {
  // Total duration in ms. Default 320ms — feels like "this is leaving."
  duration?: number;
  // Final scale factor relative to centroid. <1 shrinks (fallAway).
  // Default 0.7 — visibly receded but not collapsed.
  scaleTo?: number;
  // Final alpha (0-255). 0 = fully dismissed; ~80 = "ghosted". Default 0.
  alphaTo?: number;
  // Ease curve. Default outCubic — fast first, settles at the end.
  easing?: Easing;
};

// fallAway — visual recession. The component compresses toward its
// centroid AND fades to transparent over `duration`. Particles never
// move in z; the cloud just looks like it's leaving.
//
// One-way: this effect does NOT revert. Pair with `riseUp` (or any
// re-binding action) if the component should come back.
//
// Composable: parallel(scale, fade) collapsed to a single Effect via
// the recipe helper, so it drops into any pipeline like any primitive:
//   onEvent('onClick', pipe(visual.fallAway({duration: 280})))
//   parallel(visual.fallAway({...}), kick({...})) // physical + visual
export const fallAway = (opts: FallAwayOpts = {}): Effect => {
  const duration = opts.duration ?? 320;
  const scaleTo = opts.scaleTo ?? 0.7;
  const alphaTo = opts.alphaTo ?? 0;
  const easing = opts.easing;

  const recipe = pipe(
    at(0, scale({ factor: scaleTo, around: 'centroid', duration, easing })),
    at(0, fade({ to: alphaTo, duration, easing })),
  );
  return collapsePipelineToEffect(recipe, 'spatial');
};

// riseUp — the inverse. Component re-emerges: scale 1 + alpha back to
// full. Designed to be triggered AFTER a fallAway has settled, e.g. on
// pointer-leave / on cancel. Captures `from` lazily, so if invoked from
// a non-fallen state it's a no-op-feeling refresh.
export type RiseUpOpts = {
  duration?: number;
  // Starting alpha to lerp from. Default 0 — assumes you're rising from
  // a fully-dismissed state.
  alphaFrom?: number;
  // Starting scale (relative to centroid) to lerp from. Default 0.7 —
  // matches fallAway's default scaleTo.
  scaleFrom?: number;
  easing?: Easing;
};

export const riseUp = (opts: RiseUpOpts = {}): Effect => {
  const duration = opts.duration ?? 320;
  const alphaFrom = opts.alphaFrom ?? 0;
  const scaleFrom = opts.scaleFrom ?? 0.7;
  const easing = opts.easing;

  // Inverse: scale from `scaleFrom` back to 1; fade from `alphaFrom`
  // back to 255. The scale primitive's `factor` is the FINAL multiplier
  // applied to the captured starts, so passing 1/scaleFrom returns the
  // cloud to its bound size assuming it currently sits at scaleFrom.
  // Practically this means riseUp is most accurate when called from a
  // truly-fallen state.
  const recipe = pipe(
    at(0, scale({ factor: 1 / scaleFrom, around: 'centroid', duration, easing })),
    at(0, fade({ from: alphaFrom, to: 255, duration, easing })),
  );
  return collapsePipelineToEffect(recipe, 'spatial');
};

// Namespace export — `visual.fallAway`, `visual.riseUp`. Same convention
// as `loop.streaming` from combinators.ts — top-level grouping that hints
// "these belong together as one axis."
export const visual = {
  fallAway,
  riseUp,
} as const;
