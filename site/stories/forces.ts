// Forces story group — individual kernels in isolation.
//
// Each tile minimizes every force EXCEPT the one being demonstrated. This
// makes the visual signature of that single force unambiguous: stiff
// spring snaps, soft spring oscillates, shimmer breathes, repel spaces.

import type { ThemeId } from '../themes';
import { circle, node } from 'screean';
import { type TileGroup, tileStage } from './types';

export const forcesGroup = (themeId: ThemeId): TileGroup => ({
  title: 'Forces',
  blurb: 'Individual kernels — isolated, with everything else minimized.',
  tiles: [
    {
      name: 'spring · stiff',
      blurb: 'High K + high C: snaps and locks. Crisp, no overshoot.',
      code: 'spring(120, 18)',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, {
          feel: 'crisp',
          feelOverrides: { springK: 120, springC: 18, shimmerAmp: 0 },
        });
        stage.setScene(() => node(circle({ r: Math.min(w, h) * 0.3 })));
        return { stage };
      },
    },
    {
      name: 'spring · soft',
      blurb: 'Low K, light damping: jelly settle, oscillates.',
      code: 'spring(14, 4)',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, {
          feel: 'calm',
          feelOverrides: { springK: 14, springC: 4, shimmerAmp: 0 },
        });
        stage.setScene(() => node(circle({ r: Math.min(w, h) * 0.3 })));
        return { stage };
      },
    },
    {
      name: 'shimmer',
      blurb: 'Per-particle breathing. The "alive" tell.',
      code: 'shimmer(20, 3)',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, {
          feel: 'balanced',
          feelOverrides: { shimmerAmp: 22, shimmerFreq: 2.5 },
        });
        stage.setScene(() => node(circle({ r: Math.min(w, h) * 0.3 })));
        return { stage };
      },
    },
    {
      name: 'neighborRepel',
      blurb: 'Short-range collision. Particles space themselves.',
      code: 'neighborRepel(10, 1500)',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, {
          feel: 'balanced',
          feelOverrides: { repelRadius: 10, repelStrength: 1500, shimmerAmp: 0 },
        });
        stage.setScene(() => node(circle({ r: Math.min(w, h) * 0.3 })));
        return { stage };
      },
    },
  ],
});
