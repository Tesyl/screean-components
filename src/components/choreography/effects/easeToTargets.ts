// easeToTargets — eased lerp from each particle's start position to its
// scene-bound target (tx, ty). Replaces the dissolve return-phase math
// without owning a state machine.
//
// Sources of "start":
//   - opts.fromKey present: read snapshot from ctx.state[fromKey].
//     Pair with a prior captureStarts({key}) stage in the pipeline.
//   - opts.fromKey omitted: lazy-capture on first tick. Same data shape,
//     stored under a private key on ctx.state.
//
// Velocity is zeroed each frame so the integrator's drag/spring can't
// fight the lerp.

import type { Easing, Particle } from '@tesyl/screean';
import { easing as curves } from '@tesyl/screean';
import type { Effect } from '../effect';
import type { CapturedStarts } from './captureStarts';

export type EaseToTargetsOpts = {
  duration: number;
  easing?: Easing;
  fromKey?: string;
};

const PRIVATE_KEY = '__easeToTargetsAuto';

const captureLazy = (
  indices: readonly number[],
  particles: Particle[],
): CapturedStarts => {
  const startsX = new Float32Array(indices.length);
  const startsY = new Float32Array(indices.length);
  for (let k = 0; k < indices.length; k++) {
    const p = particles[indices[k]];
    if (!p || p.life <= 0) continue;
    startsX[k] = p.x;
    startsY[k] = p.y;
  }
  return { startsX, startsY };
};

export const easeToTargets = (opts: EaseToTargetsOpts): Effect => {
  const ease = opts.easing ?? curves.outCubic;
  return {
    scope: 'particle',
    duration: opts.duration,
    tick: (indices, ctx) => {
      const stateMap = ctx.state as Record<string, CapturedStarts>;
      let snap = stateMap[opts.fromKey ?? PRIVATE_KEY];
      if (!snap) {
        snap = captureLazy(indices, ctx.particles);
        stateMap[opts.fromKey ?? PRIVATE_KEY] = snap;
      }
      // Hoist the easing call: same value every particle this frame.
      const lerp = ctx.t / opts.duration;
      const k = ease(lerp >= 1 ? 1 : lerp);
      const sx = snap.startsX;
      const sy = snap.startsY;
      for (let idx = 0; idx < indices.length; idx++) {
        const p = ctx.particles[indices[idx]];
        if (!p || p.life <= 0) continue;
        p.x = sx[idx] + (p.tx - sx[idx]) * k;
        p.y = sy[idx] + (p.ty - sy[idx]) * k;
        p.vx = 0;
        p.vy = 0;
      }
    },
  };
};
