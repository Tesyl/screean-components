// gravity — temporary directional force over a duration. Per tick, adds a
// fixed velocity delta to every particle in the group. Direction normalized
// at construction; strength is in px/s².
//
// Implementation choice: applies the velocity delta directly per tick rather
// than mutating the world's force list. Cross-backend (CPU + GPU worlds);
// avoids the "force-list mutation has no GPU surface" engine-debt issue.

import type { Effect } from '../effect';

export type GravityOpts = {
  // Direction vector. Will be normalized; (0, 1) = downward (px+y).
  direction: { x: number; y: number };
  // Acceleration magnitude in px/s². 1000 ≈ "gentle drag downward."
  strength: number;
  duration: number;
};

const normalize = (v: { x: number; y: number }): { x: number; y: number } => {
  const len = Math.hypot(v.x, v.y);
  if (len === 0) return { x: 0, y: 0 };
  return { x: v.x / len, y: v.y / len };
};

export const gravity = (opts: GravityOpts): Effect => {
  const dir = normalize(opts.direction);
  return {
    scope: 'spatial',
    duration: opts.duration,
    tick: (indices, ctx) => {
      // Cache the per-frame delta. dt is in ms; convert to seconds for
      // consistency with strength's px/s² unit.
      const dvX = dir.x * opts.strength * (ctx.dt / 1000);
      const dvY = dir.y * opts.strength * (ctx.dt / 1000);
      if (dvX === 0 && dvY === 0) return;
      for (const i of indices) {
        const p = ctx.particles[i];
        if (!p || p.life <= 0) continue;
        p.vx += dvX;
        p.vy += dvY;
      }
    },
  };
};
