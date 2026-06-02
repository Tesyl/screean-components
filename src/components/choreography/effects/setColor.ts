// setColor — instant color write across the group. Pairs with dissolve in
// the canonical "make particles visible / hide them again" pattern.
//
//   setColor({ to: yellow })       // uniform
//   setColor({ to: pickColor })    // per-particle (function called for each)

import type { Color } from '@tesyl/screean';
import type { Effect } from '../effect';

export type SetColorOpts = {
  to: Color | (() => Color);
};

export const setColor = (opts: SetColorOpts): Effect => ({
  scope: 'particle',
  duration: 0,
  tick: (indices, ctx) => {
    if (typeof opts.to === 'function') {
      const fn = opts.to;
      for (const i of indices) {
        const p = ctx.particles[i];
        if (p && p.life > 0) p.color = fn();
      }
    } else {
      const c = opts.to;
      for (const i of indices) {
        const p = ctx.particles[i];
        if (p && p.life > 0) p.color = c;
      }
    }
  },
});
