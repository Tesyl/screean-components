// captureStarts — snapshot per-particle (x, y) into ctx.state[key] as
// Float32Arrays. Pairs with easeToTargets({fromKey: key}) so the lerp
// originates from a deterministic moment.
//
// Allocates two Float32Arrays sized to indices.length. Length-parallel,
// not index-parallel — index k in the snapshot corresponds to indices[k],
// not particle index k. easeToTargets reads them with the same parallelism.
//
// Subsequent invocations with the same key overwrite. Idempotent within
// a single tick (only the first call's snapshot survives the frame).

import type { Effect } from '../effect';

export type CaptureStartsOpts = {
  key: string;
};

export type CapturedStarts = {
  startsX: Float32Array;
  startsY: Float32Array;
};

export const captureStarts = (opts: CaptureStartsOpts): Effect => ({
  scope: 'particle',
  duration: 0,
  tick: (indices, ctx) => {
    const startsX = new Float32Array(indices.length);
    const startsY = new Float32Array(indices.length);
    for (let k = 0; k < indices.length; k++) {
      const p = ctx.particles[indices[k]];
      if (!p || p.life <= 0) continue;
      startsX[k] = p.x;
      startsY[k] = p.y;
    }
    (ctx.state as Record<string, CapturedStarts>)[opts.key] = {
      startsX,
      startsY,
    };
  },
});
