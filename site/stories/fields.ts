// Fields story group — atomic SDF primitives.
//
// One tile per shape factory, all rendered with the page's theme palette
// + a small particle count so the grid stays cheap.

import { THEMES, type ThemeId } from '../themes';
import { circle, rect, polygon, text, node } from 'screean';
import { nGon, starVerts } from '../embed';
import { type TileGroup, tileStage } from './types';

export const fieldsGroup = (themeId: ThemeId): TileGroup => ({
  title: 'Fields',
  blurb: 'Atomic SDF primitives — the shape vocabulary of the engine.',
  tiles: [
    {
      name: 'circle',
      blurb: 'Disc field with a single radius.',
      code: 'node(circle({ r: 60 }))',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        stage.setScene(() => node(circle({ r: Math.min(w, h) * 0.32 })));
        return { stage };
      },
    },
    {
      name: 'rect',
      blurb: 'Rounded rectangle with author-controlled corner radius.',
      code: 'node(rect({ w: 220, h: 100, radius: 16 }))',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        stage.setScene(() => node(rect({ w: w * 0.7, h: h * 0.45, radius: Math.min(w, h) * 0.06 })));
        return { stage };
      },
    },
    {
      name: 'polygon · hex',
      blurb: 'Arbitrary convex/concave polygon from a vertex ring.',
      code: 'node(polygon({ vertices: nGon(R, 6) }))',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        stage.setScene(() => node(polygon({ vertices: nGon(Math.min(w, h) * 0.36, 6) })));
        return { stage };
      },
    },
    {
      name: 'polygon · star',
      blurb: 'Same primitive, alternating inner/outer radii.',
      code: 'node(polygon({ vertices: starVerts(R, 5, 0.4) }))',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        stage.setScene(() => node(polygon({ vertices: starVerts(Math.min(w, h) * 0.36, 5, 0.4) })));
        return { stage };
      },
    },
    {
      name: 'text',
      blurb: 'Rasterized glyph contours from any system font.',
      code: 'node(text({ text: "screean", font }))',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, { particleCount: 1400 });
        const t = THEMES[themeId];
        const font = `${t.fontWeight} ${Math.round(Math.min(w, h) * 0.36)}px ${t.tokens.fontHead}`;
        stage.setScene(() => {
          if (typeof OffscreenCanvas === 'undefined') {
            return node(circle({ r: Math.min(w, h) * 0.3 }));
          }
          return node(text({ text: 'screean', font }));
        });
        return { stage };
      },
    },
    {
      name: 'rect · pill',
      blurb: 'rect with radius = h/2 yields a pill — composition for free.',
      code: 'node(rect({ w: 220, h: 60, radius: 30 }))',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId);
        const W = w * 0.7;
        const H = h * 0.32;
        stage.setScene(() => node(rect({ w: W, h: H, radius: H / 2 })));
        return { stage };
      },
    },
  ],
});
