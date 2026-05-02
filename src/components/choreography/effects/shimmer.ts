// shimmer — small random velocity nudges every tick. A "this thing has
// energy" texture without strong directional motion.
//
// Implementation matches the engine's shimmer force conceptually but applies
// per-tick directly (cross-backend — works on CPU and GPU world); the engine
// surface's shimmer is one of the standard forces, but adding a *temporary*
// force to the world's force list has no GPU surface, so we replicate
// in-effect.
//
// Determinism: per-particle phase via hash-from-index + frame counter, so
// the visual is reproducible. Velocity nudges average to zero over time.

import type { Effect } from '../effect';

export type ShimmerOpts = {
  // Per-tick velocity-nudge magnitude. Try 5–50.
  magnitude: number;
  duration: number;
};

const hash01 = (i: number, frame: number): number => {
  let x = ((i * 73856093) ^ (frame * 19349663)) | 0;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = (x >>> 16) ^ x;
  return (x >>> 0) / 0xffffffff;
};

export const shimmer = (opts: ShimmerOpts): Effect => ({
  scope: 'spatial',
  duration: opts.duration,
  tick: (indices, ctx) => {
    // Use ctx.t (ms) as the frame index — quantize to integers so identical
    // ticks at different sub-frame times give the same nudge pattern.
    const frame = Math.floor(ctx.t);
    for (const i of indices) {
      const p = ctx.particles[i];
      if (!p || p.life <= 0) continue;
      // Two hashes per particle, mapped to [-1, 1].
      const nx = hash01(i * 2, frame) * 2 - 1;
      const ny = hash01(i * 2 + 1, frame) * 2 - 1;
      p.vx += nx * opts.magnitude;
      p.vy += ny * opts.magnitude;
    }
  },
});
