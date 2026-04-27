// Presets story group — five named feel bundles, same shape per tile.
//
// The same disc binding is used across all five tiles so the only variable
// is the preset itself. Reading the grid side-by-side makes each preset's
// motion personality unambiguous.

import type { ThemeId } from '../themes';
import { THEMES } from '../themes';
import { circle, node } from 'screean';
import { Reel } from '../lib/effects/Reel';
import { type TileGroup, tileStage } from './types';

const presetBlurbs: Record<'balanced' | 'calm' | 'crisp' | 'dreamy' | 'magnetic', string> = {
  balanced: 'The reference. Mid-stiffness, medium drag, light shimmer.',
  calm:     'Slow, heavy, underwater. Particles drift rather than snap.',
  crisp:    'Snappy, eager, clean. Fast settle.',
  dreamy:   'Loose. Lots of shimmer, weak spring.',
  magnetic: 'Strong cursor pull, small repulsion.',
};

// Names in the order the symphony reel cycles them. The order picks a
// progression of "energy" — balanced (warm idle) → calm (slow drift)
// → crisp (snap) → dreamy (loose breathing) → magnetic (tight pull),
// then loops. Reading transitions between adjacent presets is the
// pedagogy: how does the same shape behave when only the force
// constants change?
const PRESET_ORDER = ['balanced', 'calm', 'crisp', 'dreamy', 'magnetic'] as const;

export const presetsGroup = (themeId: ThemeId): TileGroup => ({
  title: 'Feel presets',
  blurb: 'Five named bundles of force constants. Same shape, five personalities — laid out side-by-side AND cycling on a reel.',
  tiles: [
    // Static side-by-side tiles (one per preset). Reading the grid
    // simultaneously makes each preset's signature unambiguous.
    //
    // Click any tile to retrigger the spawn → bind → settle cycle —
    // re-watch the preset's full motion personality from frame zero.
    // This is more useful than it sounds: the most distinctive moment
    // of `crisp` is the snap into place; `dreamy` is the lazy drift;
    // `calm` is the underwater settle. Side-by-side they're easy to
    // miss because the eye gets stuck on the active one.
    ...PRESET_ORDER.map((name) => ({
      name,
      blurb: `${presetBlurbs[name]} Click to retrigger.`,
      code: `feels.${name}`,
      mount: (c: HTMLCanvasElement, w: number, h: number) => {
        const stage = tileStage(c, w, h, themeId, { feel: name });
        const build = () => node(circle({ r: Math.min(w, h) * 0.32 }));
        stage.setScene(build);

        // Click → wipe + respawn. Stage.setScene with an empty world
        // fresh-spawns from the configured origin (center for tiles),
        // re-binds, recolors. The preset's full signature plays from
        // frame zero. Re-entrancy is fine: the second spawn just
        // clobbers any in-flight particles.
        const retrigger = () => {
          stage.world.particles.length = 0;
          stage.setScene(build);
        };
        c.addEventListener('pointerdown', retrigger);
        c.style.cursor = 'pointer';

        return { stage };
      },
    })),

    // ---- Force Symphony reel ---------------------------------------
    // Same disc, cycle through every preset on a 2.2s timer via
    // Stage.retheme. The bound shape doesn't change — only the force
    // stack does. Reads as "watch the personality shift in time."
    {
      name: 'symphony · reel',
      blurb: 'One disc, five personalities cycling on a 2.2s loop. Stage.retheme rebuilds the force stack between steps; the bound shape stays.',
      code: `new Reel({
  steps: PRESETS.map(name => ({
    enter: () => stage.retheme(palette, name),
  })),
}).play();`,
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, { feel: PRESET_ORDER[0] });
        stage.setScene(() => node(circle({ r: Math.min(w, h) * 0.32 })));

        // The palette stays Acid for visual coherence — only the FEEL
        // changes between steps. (A future variant could rotate hues
        // alongside the feel for an even more dramatic transition.)
        const palette = THEMES[themeId].palette;

        const reel = new Reel({
          steps: PRESET_ORDER.map((name) => ({
            label: name.toUpperCase(),
            hint: presetBlurbs[name],
            ms: 2200,
            // retheme replaces the force stack but leaves the bound
            // scene + particles intact — the disc keeps its shape, only
            // its motion personality changes.
            enter: () => stage.retheme(palette, name),
          })),
          ctx: undefined,
          loop: true,
          // Step 0 is already applied via tileStage's initial feel,
          // so start the reel at step 1 (calm) for the first
          // visible transition.
          startAt: 1,
        });
        reel.play();

        return { stage, dispose: () => reel.dispose() };
      },
    },
  ],
});
