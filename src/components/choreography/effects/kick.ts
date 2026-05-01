// kick — instant radial velocity stomp. Thin wrapper over the engine's
// `radialImpulse`; origin defaults to the group centroid. Use as a pipeline
// stage to add a one-shot velocity nudge before / after another effect.
//
// Caveat: applyRadialImpulse is a SPATIAL pass — it affects every particle
// in `indices` regardless of distance from the centroid. The "radius" is
// implicit in the falloff curve. For tighter scoping, narrow the group
// (e.g. groupOfPart) before invoking.

import { radialImpulse } from 'screean';
import type { Effect } from '../effect';
import { centroidOf } from './_geom';

export type KickOpts = {
  // Peak impulse at the origin. Defaults to 200 — moderate visible kick.
  strength?: number;
  // Falloff softness; passed through to radialImpulse. Smaller = harder
  // 1/d falloff (hot center, soft edges).
  softness?: number;
  // Override the origin. Defaults to the group's centroid.
  origin?: { x: number; y: number };
};

export const kick = (opts: KickOpts = {}): Effect => ({
  duration: 0,
  tick: (indices, ctx) => {
    if (indices.length === 0) return;
    const origin = opts.origin ?? centroidOf(indices, ctx.particles);
    radialImpulse(ctx.particles, {
      origin,
      kick: opts.strength ?? 200,
      softness: opts.softness ?? 0.1,
      indices,
    });
  },
});
