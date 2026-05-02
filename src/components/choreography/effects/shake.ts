// shake — high-frequency 2D vibration. Per-particle phase offset (hashed
// from index) so neighbouring particles don't all move in lockstep —
// reads as energetic chaos, not a coordinated wave.

import type { Effect } from '../effect';

export type ShakeOpts = {
  amplitude: number;
  freq: number;
  duration: number;
};

// Cheap deterministic hash → [0, 2π). Keeps tests reproducible without
// dragging in PCG32; for choreography-scale randomness this is plenty.
const phaseFromIndex = (i: number): number => {
  let x = (i + 1) | 0;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = ((x >>> 16) ^ x) * 0x45d9f3b;
  x = (x >>> 16) ^ x;
  return ((x >>> 0) / 0xffffffff) * Math.PI * 2;
};

export const shake = (opts: ShakeOpts): Effect => ({
  scope: 'spatial',
  duration: opts.duration,
  tick: (indices, ctx) => {
    const omega = 2 * Math.PI * opts.freq;
    const tSec = ctx.t / 1000;
    for (const i of indices) {
      const p = ctx.particles[i];
      if (!p || p.life <= 0) continue;
      const phaseX = phaseFromIndex(i * 2);
      const phaseY = phaseFromIndex(i * 2 + 1);
      p.vx += opts.amplitude * Math.sin(omega * tSec + phaseX);
      p.vy += opts.amplitude * Math.sin(omega * tSec + phaseY);
    }
  },
});
