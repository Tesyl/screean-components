// teleport — instant position write. Two modes (xor):
//   { offset: {x, y} } — translate every particle by the offset
//   { to: {x, y} }     — collapse every particle to the same point
//
// Use `to` for "appear at cursor" then chain with spread/easeToTargets
// to rebuild form. Use `offset` for jump cuts.

import type { Effect } from '../effect';

export type TeleportOpts =
  | { offset: { x: number; y: number }; to?: never }
  | { to: { x: number; y: number }; offset?: never };

export const teleport = (opts: TeleportOpts): Effect => ({
  scope: 'particle',
  duration: 0,
  tick: (indices, ctx) => {
    if ('offset' in opts && opts.offset) {
      const { x: dx, y: dy } = opts.offset;
      for (const i of indices) {
        const p = ctx.particles[i];
        if (!p || p.life <= 0) continue;
        p.x += dx;
        p.y += dy;
      }
      return;
    }
    if ('to' in opts && opts.to) {
      const { x, y } = opts.to;
      for (const i of indices) {
        const p = ctx.particles[i];
        if (!p || p.life <= 0) continue;
        p.x = x;
        p.y = y;
      }
    }
  },
});
