// setTz — instant write of the z-axis target on every live particle in the
// group. The engine's z-spring then pulls each particle's `z` toward `tz`
// over subsequent frames — the integrator owns the in-between motion.
//
// Decomposes popTo3D: setTz(N) at the start, setTz(0) at the end (or via
// onEnd of a temporal wrapper).

import type { Effect } from '../effect';

export type SetTzOpts = {
  to: number;
};

export const setTz = (opts: SetTzOpts): Effect => ({
  scope: 'particle',
  duration: 0,
  tick: (indices, ctx) => {
    for (const i of indices) {
      const p = ctx.particles[i];
      if (p && p.life > 0) p.tz = opts.to;
    }
  },
});
