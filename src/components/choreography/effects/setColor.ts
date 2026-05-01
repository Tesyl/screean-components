// setColor — instant color write across the group. Pairs with dissolve in
// the canonical "make particles visible / hide them again" pattern:
//
//   pipe(
//     setColor({ to: yellow }),
//     dissolve({...}),
//     setColor({ to: TRANSPARENT }),
//   );

import type { Color } from 'screean';
import type { Effect } from '../effect';

export type SetColorOpts = {
  to: Color;
};

export const setColor = (opts: SetColorOpts): Effect => ({
  duration: 0,
  tick: (indices, ctx) => {
    for (const i of indices) {
      const p = ctx.particles[i];
      if (p && p.life > 0) p.color = opts.to;
    }
  },
});
