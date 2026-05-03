// spread — radial outward displacement from group centroid over duration.
// Captures per-particle direction vector at first tick (so direction is
// stable even as particles move). Each particle's destination =
// startPos + direction * distance.

import { easing as curves, type Easing } from 'screean';
import { defineEffect, type Effect, type EffectState } from '../effect';
import { centroidOf } from './_geom';

export type SpreadOpts = {
  distance: number;
  duration: number;
  easing?: Easing;
};

type SpreadState = EffectState & {
  __spread?: {
    startsX: Float32Array;
    startsY: Float32Array;
    dx: Float32Array;
    dy: Float32Array;
  };
};

export const spread = (opts: SpreadOpts): Effect => {
  const ease = opts.easing ?? curves.outCubic;
  return defineEffect<SpreadState>({
    scope: 'spatial',
    duration: opts.duration,
    tick: (indices, ctx) => {
      let state = ctx.state.__spread;
      if (!state) {
        const startsX = new Float32Array(indices.length);
        const startsY = new Float32Array(indices.length);
        const dx = new Float32Array(indices.length);
        const dy = new Float32Array(indices.length);
        const c = centroidOf(indices, ctx.particles);
        for (let k = 0; k < indices.length; k++) {
          const p = ctx.particles[indices[k]];
          if (!p || p.life <= 0) continue;
          startsX[k] = p.x;
          startsY[k] = p.y;
          let vecX = p.x - c.x;
          let vecY = p.y - c.y;
          const len = Math.hypot(vecX, vecY);
          if (len > 0) {
            vecX /= len;
            vecY /= len;
          } else {
            // Particle exactly at centroid — pick a deterministic direction
            // (equal angular spread by index) so they don't all stay put.
            const angle = (k / indices.length) * Math.PI * 2;
            vecX = Math.cos(angle);
            vecY = Math.sin(angle);
          }
          dx[k] = vecX;
          dy[k] = vecY;
        }
        state = { startsX, startsY, dx, dy };
        ctx.state.__spread = state;
      }

      const lerp = ctx.t / opts.duration;
      const k = ease(lerp >= 1 ? 1 : lerp);
      const reach = opts.distance * k;
      for (let i = 0; i < indices.length; i++) {
        const p = ctx.particles[indices[i]];
        if (!p || p.life <= 0) continue;
        p.x = state.startsX[i] + state.dx[i] * reach;
        p.y = state.startsY[i] + state.dy[i] * reach;
        p.vx = 0;
        p.vy = 0;
      }
    },
  });
};
