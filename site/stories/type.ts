// Type story group — text fields as living matter.
//
// Every other story group teaches a primitive (a field, a force, a
// transition). Type teaches what *happens* when the engine's text-rasterized
// fields are swapped on a timer: particles flow letter-to-letter, glyph-to-
// glyph, like the cloud is reading.
//
// First (and currently only) tile: the **Text Morph** reel — a 5-word
// sequence cycling on a soft swap. No respawn, just rebind. Watch
// individual particles trace from one glyph's contour to the next.

import type { ThemeId } from '../themes';
import { THEMES } from '../themes';
import { circle, text, node } from 'screean';
import type { SceneNode } from 'screean';
import { Reel } from '../lib/effects/Reel';
import { type TileGroup, tileStage } from './types';

// 5 words. Brutalist-styled: short, declarative, all-caps. Text fields
// don't care about case — caps look bigger and read at this canvas size.
const WORDS = ['SCREEAN', 'PARTICLES', 'MATTER', 'LIVING', 'UI'] as const;

// Step duration: long enough that the morph finishes and the word is
// readable, short enough that the loop feels alive. Mirrors the
// CHOREOGRAPHY reel's BIND step (1.6s).
const STEP_MS = 1600;

// Build a text scene-node at the given dimensions. Falls back to a circle
// in environments without OffscreenCanvas (some test runners).
const buildText = (word: string, font: string, fallbackR: number): SceneNode => {
  if (typeof OffscreenCanvas === 'undefined' || !word) {
    return node(circle({ r: fallbackR }));
  }
  return node(text({ text: word, font }));
};

export const typeGroup = (themeId: ThemeId): TileGroup => ({
  title: 'Type',
  blurb: 'Text rendered as a particle cloud. Soft-swap a textField between words and watch the matter flow letter-to-letter.',
  tiles: [
    {
      name: 'text · morph reel',
      blurb: 'Five words cycle on a 1.6s loop. Each transition is a soft rebind — same particles, new glyph contours.',
      code: `new Reel({
  steps: WORDS.map(word => ({
    enter: () => stage.setScene(
      () => node(text({ text: word, font })),
    ),
  })),
}).play();`,
      mount: (c, w, h) => {
        const t = THEMES[themeId];
        // Bigger particle count than the default tile — text fields are
        // contour-heavy and need enough particles to read at this size.
        const stage = tileStage(c, w, h, themeId, {
          particleCount: 1600,
          // Magnetic feel keeps the morph snappy; particles want to
          // settle on their new bound positions quickly when the word
          // changes.
          feel: 'magnetic',
        });
        // Font size: ~32% of canvas's smaller dim. At 320×200 → ~64px.
        const fontSize = Math.round(Math.min(w, h) * 0.32);
        const font = `${t.fontWeight} ${fontSize}px ${t.tokens.fontHead}`;
        const fallback = Math.min(w, h) * 0.3;

        // Initial scene = first word. Reel will swap from here onward.
        stage.setScene(() => buildText(WORDS[0], font, fallback));

        const reel = new Reel({
          steps: WORDS.map((word) => ({
            label: word,
            hint: 'soft swap to next word',
            ms: STEP_MS,
            // Reel's `enter` fires every step. setScene with no particle
            // wipe = soft swap (auto mode); particles flow from previous
            // word's contour to next.
            enter: () => stage.setScene(() => buildText(word, font, fallback)),
          })),
          ctx: undefined,
          loop: true,
          // Start at index 1 — the first reel transition leaves WORDS[0]
          // (which was set above as the initial scene). Without this, the
          // first STEP_MS would re-bind to the same word and waste the
          // visual budget.
          startAt: 1,
        });
        reel.play();

        return {
          stage,
          dispose: () => reel.dispose(),
        };
      },
    },
  ],
});
