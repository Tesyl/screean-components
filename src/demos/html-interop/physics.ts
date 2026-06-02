// Pure, testable helpers for the html-interop demo.
//
// Kept out of main.tsx so they can run under vitest without a DOM / React
// / screean renderer context. The demo imports from here; so do the tests.
//
// Note: the radial-impulse function that used to live here as
// `applyJellyImpulse` is now `radialImpulse` in the `screean` engine.
// Callers import it directly from '@tesyl/screean'. Same math, better home — see
// `screean/src/choreography/radialImpulse.ts`.

// Parse an arbitrary CSS color string into [r, g, b, a] (0-255) by bouncing
// off a throwaway 1×1 canvas. This is the simplest cross-browser way to
// resolve oklch(...), hsl(...), rgba(...), named colors, etc. Returns null
// if parsing fails (browserless test env, invalid CSS).
//
// Extracted so tests can inject a stub canvas and verify palette extraction
// logic without a full DOM.
// Structurally compatible with real HTMLCanvasElement (fillStyle widened to
// the browser's actual `string | CanvasGradient | CanvasPattern` union) and
// with test stubs that fake the same shape.
export type MinimalCanvas2DContext = {
  fillStyle: unknown;
  fillRect: (x: number, y: number, w: number, h: number) => void;
  getImageData: (x: number, y: number, w: number, h: number) => { data: Uint8ClampedArray };
};

export type CanvasFactory = () => {
  width: number;
  height: number;
  getContext: (id: '2d') => MinimalCanvas2DContext | null;
};

export const parseCssColorToRgba = (
  css: string,
  factory: CanvasFactory,
): [number, number, number, number] | null => {
  const scratch = factory();
  scratch.width = 1;
  scratch.height = 1;
  const ctx = scratch.getContext('2d');
  if (!ctx) return null;
  try {
    ctx.fillStyle = css;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  } catch {
    return null;
  }
};
