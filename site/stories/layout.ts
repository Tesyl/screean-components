// Layout story group — scene-graph positioning primitives (row, column).
//
// Each tile builds N children of the same shape and lets the layout
// container handle main-axis spacing + cross-axis alignment.

import type { ThemeId } from '../themes';
import { circle, rect, polygon, row, column, stack, node } from 'screean';
import type { SceneNode } from 'screean';
import { starVerts } from '../embed';
import { Reel } from '../lib/Reel';
import { type TileGroup, tileStage } from './types';

export const layoutGroup = (themeId: ThemeId): TileGroup => ({
  title: 'Layout',
  blurb: 'Scene-graph positioning. Auto-pack along an axis with gap & alignment.',
  tiles: [
    {
      name: 'row',
      blurb: 'Three discs auto-spaced along the x axis.',
      code: 'row({ gap: 12, align: "center" }, [a, b, c])',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        stage.setScene(() => {
          const r = Math.min(w, h) * 0.18;
          const mk = (): SceneNode => node(circle({ r }));
          return row({ gap: r * 0.6, align: 'center' }, [mk(), mk(), mk()]);
        });
        return { stage };
      },
    },
    {
      name: 'column',
      blurb: 'Three pills stacked. Same layout primitive, different axis.',
      code: 'column({ gap: 12, align: "center" }, [a, b, c])',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        stage.setScene(() => {
          const W = w * 0.55;
          const H = h * 0.18;
          const mk = (): SceneNode => node(rect({ w: W, h: H, radius: H / 2 }));
          return column({ gap: H * 0.4, align: 'center' }, [mk(), mk(), mk()]);
        });
        return { stage };
      },
    },
    {
      name: 'row · stars',
      blurb: 'Mixed: layout primitives nest.',
      code: 'row({ gap, align }, [star, star, star])',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        stage.setScene(() => {
          const r = Math.min(w, h) * 0.16;
          const mk = (): SceneNode => node(polygon({ vertices: starVerts(r, 5, 0.4) }));
          return row({ gap: r * 0.6, align: 'center' }, [mk(), mk(), mk()]);
        });
        return { stage };
      },
    },

    // ---- Layout Migration reel ----------------------------------------
    // Three discs migrate through layout primitives: row → column →
    // stack → row → loop. Each step is a soft rebind: the same particles
    // flow between containers, demonstrating that re-layout is ~free
    // (no respawn, no flicker — just a new bind target per leaf).
    {
      name: 'migration · reel',
      blurb: 'Three discs cycle through row → column → stack → row. Soft rebind per step; particles flow between layouts.',
      code: `new Reel({
  steps: [
    { enter: () => stage.setScene(() =>
        row({ gap, align: 'center' }, [a, b, c])) },
    { enter: () => stage.setScene(() =>
        column({ gap, align: 'center' }, [a, b, c])) },
    { enter: () => stage.setScene(() => stack([a, b, c])) },
  ],
}).play();`,
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, { particleCount: 1300 });

        // Three discs sized so all three layouts (row, column, stack)
        // fit inside the canvas without clipping. r = min(w, h) * 0.14
        // gives ~28px discs at 320×200 — three across in a row leaves
        // breathing room.
        const r = Math.min(w, h) * 0.14;
        const mk = (): SceneNode => node(circle({ r }));

        // Each builder makes FRESH children every call. SceneNodes
        // can't be reused across scenes — `parent` would be set to the
        // last container on rebind. Throwaway children are cheap.
        const buildRow    = () => row(   { gap: r * 0.7, align: 'center' }, [mk(), mk(), mk()]);
        const buildColumn = () => column({ gap: r * 0.7, align: 'center' }, [mk(), mk(), mk()]);
        const buildStack  = () => stack([mk(), mk(), mk()]);

        stage.setScene(buildRow);

        const reel = new Reel({
          steps: [
            { label: 'ROW',    hint: 'main-axis x', ms: 1700, enter: () => stage.setScene(buildRow) },
            { label: 'COLUMN', hint: 'main-axis y', ms: 1700, enter: () => stage.setScene(buildColumn) },
            { label: 'STACK',  hint: 'overlapped',  ms: 1700, enter: () => stage.setScene(buildStack) },
          ],
          ctx: undefined,
          loop: true,
          startAt: 1, // step 0 set above
        });
        reel.play();

        return { stage, dispose: () => reel.dispose() };
      },
    },
  ],
});
