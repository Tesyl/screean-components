// scale — expand or contract the group from a pivot. factor=2 doubles
// distances from pivot at end; factor=0.5 halves. The scaling itself is
// eased: scale_t = lerp(1, factor, ease(t/duration)). At t=0 every
// particle stays put; at t=duration it sits at startPos remapped by
// factor relative to the pivot.

import { easing as curves, type Easing } from 'screean';
import type { Effect } from '../effect';
import { centroidOf } from './_geom';

export type ScaleAround = { x: number; y: number } | 'centroid';

export type ScaleOpts = {
  factor: number;
  around?: ScaleAround;
  duration: number;
  easing?: Easing;
};

type State = {
  pivotX: number;
  pivotY: number;
  offX: Float32Array;
  offY: Float32Array;
};

export const scale = (opts: ScaleOpts): Effect => {
  const ease = opts.easing ?? curves.outCubic;
  const around: ScaleAround = opts.around ?? 'centroid';
  return {
    scope: 'spatial',
    duration: opts.duration,
    tick: (indices, ctx) => {
      const stateMap = ctx.state as Record<string, State>;
      let state = stateMap.__scale;
      if (!state) {
        const pivot =
          around === 'centroid'
            ? centroidOf(indices, ctx.particles)
            : around;
        const offX = new Float32Array(indices.length);
        const offY = new Float32Array(indices.length);
        for (let k = 0; k < indices.length; k++) {
          const p = ctx.particles[indices[k]];
          if (!p || p.life <= 0) continue;
          offX[k] = p.x - pivot.x;
          offY[k] = p.y - pivot.y;
        }
        state = { pivotX: pivot.x, pivotY: pivot.y, offX, offY };
        stateMap.__scale = state;
      }

      const lerp = ctx.t / opts.duration;
      const k = ease(lerp >= 1 ? 1 : lerp);
      const factorAtT = 1 + (opts.factor - 1) * k;
      for (let i = 0; i < indices.length; i++) {
        const p = ctx.particles[indices[i]];
        if (!p || p.life <= 0) continue;
        p.x = state.pivotX + state.offX[i] * factorAtT;
        p.y = state.pivotY + state.offY[i] * factorAtT;
        p.vx = 0;
        p.vy = 0;
      }
    },
  };
};
