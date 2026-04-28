// Composition story group — boolean field algebra.
//
// Demonstrates union/intersect/subtract operating on raw Field instances
// (not the scene shape sugar) because compose works on the Field type.
// The composed Field carries its own `_bounds`, so wrapping in `node(...)`
// gives the layout layer a meaningful intrinsic size for free.

import type { ThemeId } from '../themes';
import { node } from 'screean';
import { unionField, intersectField, subtractField } from 'screean';
import { circleField } from 'screean';
import { roundedRectField } from 'screean';
import type { Field } from 'screean';
import { Reel } from '../lib/effects/Reel';
import { type TileGroup, tileStage } from './types';

export const compositionGroup = (themeId: ThemeId): TileGroup => ({
  title: 'Composition',
  blurb: 'Boolean field algebra. Build complex shapes without leaving SDF land.',
  tiles: [
    {
      name: 'unionField',
      blurb: 'Two circles that read as one peanut shape.',
      code: 'unionField(circleA, circleB)',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        stage.setScene(() => {
          const r = Math.min(w, h) * 0.22;
          const a: Field = circleField({ cx: -r * 0.8, cy: 0, r });
          const b: Field = circleField({ cx: r * 0.8, cy: 0, r });
          return node(unionField(a, b));
        });
        return { stage };
      },
    },
    {
      name: 'intersectField',
      blurb: 'A vesica from a circle ∩ rect.',
      code: 'intersectField(circle, rect)',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        stage.setScene(() => {
          const r = Math.min(w, h) * 0.32;
          const a: Field = circleField({ cx: 0, cy: 0, r });
          const b: Field = roundedRectField({
            x: -r * 0.7, y: -r * 0.4, w: r * 1.4, h: r * 0.8, radius: 0,
          });
          return node(intersectField(a, b));
        });
        return { stage };
      },
    },
    {
      name: 'subtractField',
      blurb: 'A donut: rect minus a circular bite.',
      code: 'subtractField(rect, circle)',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        stage.setScene(() => {
          const r = Math.min(w, h) * 0.34;
          const a: Field = roundedRectField({
            x: -r, y: -r * 0.6, w: r * 2, h: r * 1.2, radius: r * 0.2,
          });
          const b: Field = circleField({ cx: 0, cy: 0, r: r * 0.55 });
          return node(subtractField(a, b));
        });
        return { stage };
      },
    },

    // ---- Field Algebra reel -------------------------------------------
    // Five steps cycle continuously: A → B → A∪B → A∩B → A−B. Each step
    // is a soft-swap of the bound field, so particles flow between
    // operator results rather than respawning. Reads as the boolean
    // algebra animating through its own truth table.
    {
      name: 'algebra · reel',
      blurb: 'A → B → A∪B → A∩B → A−B → loop. Each step is a soft rebind: same particles flow between operator results.',
      code: `new Reel({
  steps: [
    { enter: () => stage.setScene(() => node(A)) },
    { enter: () => stage.setScene(() => node(B)) },
    { enter: () => stage.setScene(() => node(unionField(A, B))) },
    { enter: () => stage.setScene(() => node(intersectField(A, B))) },
    { enter: () => stage.setScene(() => node(subtractField(A, B))) },
  ],
}).play();`,
      mount: (c, w, h) => {
        // Particle count tuned high so the thinnest operator result
        // (intersect's vesica) still reads with enough density.
        const stage = tileStage(c, w, h, themeId, { particleCount: 1500 });

        // Two source operands. Reused across every step so the boolean
        // operators compose against the same primitives.
        const r = Math.min(w, h) * 0.26;
        const A: Field = circleField({ cx: -r * 0.55, cy: 0, r });
        const B: Field = circleField({ cx:  r * 0.55, cy: 0, r });

        // Initial scene: just A. The first reel transition swaps to B,
        // so step 0 is the implicit baseline (set here, not in the
        // reel) and the reel covers steps 1..4 from B onward.
        stage.setScene(() => node(A));

        const STEP_COUNT = 5;
        let currentIdx = 1; // matches startAt below
        const reel = new Reel({
          steps: [
            { label: 'A',     hint: 'left disc',          ms: 1500, enter: () => stage.setScene(() => node(A)) },
            { label: 'B',     hint: 'right disc',         ms: 1500, enter: () => stage.setScene(() => node(B)) },
            { label: 'A ∪ B', hint: 'union — peanut',     ms: 1900, enter: () => stage.setScene(() => node(unionField(A, B))) },
            { label: 'A ∩ B', hint: 'intersect — vesica', ms: 1900, enter: () => stage.setScene(() => node(intersectField(A, B))) },
            { label: 'A − B', hint: 'subtract — crescent',ms: 1900, enter: () => stage.setScene(() => node(subtractField(A, B))) },
          ],
          ctx: undefined,
          loop: true,
          // Skip step 0 (already set above) on first play so the reel
          // starts with the visible transition A → B rather than A → A.
          startAt: 1,
          // Track the current step index so click-advance below knows
          // where it's jumping to. Reel's `onStep` arg order is (idx, step).
          onStep: (idx) => { currentIdx = idx; },
        });
        reel.play();

        // Click to skip to the next operator. The reel keeps playing
        // from the new index — same auto-loop behavior, just nudged.
        c.style.cursor = 'pointer';
        const onClick = (): void => {
          currentIdx = (currentIdx + 1) % STEP_COUNT;
          reel.scrub(currentIdx);
        };
        c.addEventListener('click', onClick);

        return {
          stage,
          dispose: () => {
            c.removeEventListener('click', onClick);
            c.style.cursor = '';
            reel.dispose();
          },
        };
      },
    },
  ],
});
