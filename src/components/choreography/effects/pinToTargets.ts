// pinToTargets — instant snap. x = tx, y = ty, vx = vy = 0. Used as the final
// stage of dissolve-style recipes to land particles pixel-exactly on their
// scene targets, regardless of what the easing curve overshot to.
//
// Velocity zero is critical: without it, the next physics tick re-launches
// the particles and the silhouette breaks under the mirror crossfade.

import type { Effect } from '../effect';

export const pinToTargets = (): Effect => ({
  scope: 'particle',
  duration: 0,
  tick: (indices, ctx) => {
    for (const i of indices) {
      const p = ctx.particles[i];
      if (!p || p.life <= 0) continue;
      p.x = p.tx;
      p.y = p.ty;
      p.vx = 0;
      p.vy = 0;
    }
  },
});
