// rotate — rotate the group around a pivot by `radians` over duration.
// Captures per-particle offset from pivot at first tick; each frame
// applies the rotation matrix at angle = ease(t/duration) * radians to
// the captured offset.

import { easing as curves, type Easing } from 'screean';
import { defineEffect, type Effect, type EffectState } from '../effect';
import { centroidOf } from './_geom';

export type RotateAround = { x: number; y: number } | 'centroid';

export type RotateOpts = {
  radians: number;
  around?: RotateAround;
  duration: number;
  easing?: Easing;
};

type RotateState = EffectState & {
  __rotate?: {
    pivotX: number;
    pivotY: number;
    offX: Float32Array;
    offY: Float32Array;
  };
};

export const rotate = (opts: RotateOpts): Effect => {
  const ease = opts.easing ?? curves.outCubic;
  const around: RotateAround = opts.around ?? 'centroid';
  return defineEffect<RotateState>({
    scope: 'spatial',
    duration: opts.duration,
    tick: (indices, ctx) => {
      let state = ctx.state.__rotate;
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
        ctx.state.__rotate = state;
      }

      const lerp = ctx.t / opts.duration;
      const k = ease(lerp >= 1 ? 1 : lerp);
      const angle = opts.radians * k;
      const cosA = Math.cos(angle);
      const sinA = Math.sin(angle);
      for (let i = 0; i < indices.length; i++) {
        const p = ctx.particles[indices[i]];
        if (!p || p.life <= 0) continue;
        const ox = state.offX[i];
        const oy = state.offY[i];
        p.x = state.pivotX + ox * cosA - oy * sinA;
        p.y = state.pivotY + ox * sinA + oy * cosA;
        p.vx = 0;
        p.vy = 0;
      }
    },
  });
};
