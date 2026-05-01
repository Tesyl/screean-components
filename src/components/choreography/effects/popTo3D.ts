// popTo3D effect — pipeline-friendly z-axis lift.
//
// On first tick, writes `tz` on every particle in the group; the engine's
// z-spring smoothly pulls `z` toward `tz` over subsequent frames. On effect
// end (or cancel), restores `tz = restTz`.
//
// Mirrors the legacy `popTo3D` (dom/popTo3D.ts) function; that one stays
// for setTimeout-based one-shot use. This Effect composes with pipelines.

import type { Effect } from '../effect';

export type PopTo3DEffectOpts = {
  // Target depth (positive = toward camera). ±3 is subtle, ±8 dramatic.
  tz: number;
  // Hold duration before snap-back. Required for the Effect form — the
  // pipeline runner needs a duration to know when to fire onEnd.
  holdMs: number;
  // Rest depth to snap back to. Defaults to 0 (screen plane).
  restTz?: number;
};

export const popTo3D = (opts: PopTo3DEffectOpts): Effect => {
  const restTz = opts.restTz ?? 0;
  return {
    duration: opts.holdMs,
    tick: (indices, ctx) => {
      // Single-shot write at t=0; engine integrator drives z-spring afterward.
      if (ctx.t !== 0) return;
      for (const i of indices) {
        const p = ctx.particles[i];
        if (p && p.life > 0) p.tz = opts.tz;
      }
    },
    onEnd: (indices, ctx) => {
      for (const i of indices) {
        const p = ctx.particles[i];
        if (p && p.life > 0) p.tz = restTz;
      }
    },
  };
};
