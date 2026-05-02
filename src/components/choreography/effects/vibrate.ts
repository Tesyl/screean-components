// vibrate — sinusoidal velocity injection along an axis. Different from
// position-override: writes to vx/vy so the engine integrator and drag
// behave naturally.
//
// freq in Hz; amplitude in px/s (peak velocity at sine maxima).

import type { Effect } from '../effect';

export type VibrateOpts = {
  axis: 'x' | 'y';
  freq: number;
  amplitude: number;
  duration: number;
};

export const vibrate = (opts: VibrateOpts): Effect => ({
  scope: 'spatial',
  duration: opts.duration,
  tick: (indices, ctx) => {
    const omega = 2 * Math.PI * opts.freq;
    const tSec = ctx.t / 1000;
    const v = opts.amplitude * Math.sin(omega * tSec);
    if (v === 0) return;
    if (opts.axis === 'x') {
      for (const i of indices) {
        const p = ctx.particles[i];
        if (!p || p.life <= 0) continue;
        p.vx += v;
      }
    } else {
      for (const i of indices) {
        const p = ctx.particles[i];
        if (!p || p.life <= 0) continue;
        p.vy += v;
      }
    }
  },
});
