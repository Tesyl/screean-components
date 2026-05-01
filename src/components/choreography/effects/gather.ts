// gather — pull every particle in the group toward a single shared target
// over duration. Like easeToTargets but with one destination instead of
// per-particle (tx, ty).
//
// `to: 'centroid'` resolves the centroid AT FIRST TICK (when particles
// are at their pre-gather positions) and freezes it. Re-resolving per
// tick would create a moving target as particles converge — feedback
// loop that looks weird.

import { easing as curves, type Easing } from 'screean';
import type { Effect } from '../effect';
import { centroidOf } from './_geom';

export type GatherTo = { x: number; y: number } | 'centroid';

export type GatherOpts = {
  to: GatherTo;
  duration: number;
  easing?: Easing;
};

type State = {
  startsX: Float32Array;
  startsY: Float32Array;
  destX: number;
  destY: number;
  initialized: boolean;
};

export const gather = (opts: GatherOpts): Effect => {
  const ease = opts.easing ?? curves.outCubic;
  return {
    scope: 'spatial',
    duration: opts.duration,
    tick: (indices, ctx) => {
      const stateMap = ctx.state as Record<string, State>;
      let state = stateMap.__gather;
      if (!state) {
        const startsX = new Float32Array(indices.length);
        const startsY = new Float32Array(indices.length);
        for (let k = 0; k < indices.length; k++) {
          const p = ctx.particles[indices[k]];
          if (!p || p.life <= 0) continue;
          startsX[k] = p.x;
          startsY[k] = p.y;
        }
        const dest =
          opts.to === 'centroid'
            ? centroidOf(indices, ctx.particles)
            : opts.to;
        state = {
          startsX,
          startsY,
          destX: dest.x,
          destY: dest.y,
          initialized: true,
        };
        stateMap.__gather = state;
      }

      const lerp = ctx.t / opts.duration;
      const k = ease(lerp >= 1 ? 1 : lerp);
      for (let i = 0; i < indices.length; i++) {
        const p = ctx.particles[indices[i]];
        if (!p || p.life <= 0) continue;
        p.x = state.startsX[i] + (state.destX - state.startsX[i]) * k;
        p.y = state.startsY[i] + (state.destY - state.startsY[i]) * k;
        p.vx = 0;
        p.vy = 0;
      }
    },
  };
};
