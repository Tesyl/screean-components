// Pure, testable helpers for the html-interop demo.
//
// Kept out of main.tsx so they can run under vitest without a DOM / React
// / screean renderer context. The demo imports from here; so do the tests.

import type { Particle } from 'screean';

// Minimal subset of Particle we actually touch. Keeps the unit tests free
// of all the ambient fields (fieldId, age, life, color) that are irrelevant
// to the math.
export type JellyParticle = Pick<Particle, 'x' | 'y' | 'vx' | 'vy' | 'life'>;

export type JellyOpts = {
  // Click / button center in world coords.
  cx: number;
  cy: number;
  // Kick magnitude at the center. Falls off with distance.
  kick: number;
  // Softening factor on the 1/d falloff — prevents particles AT the center
  // from getting infinite velocity. Defaults to 0.1 world-units per distance.
  // Tuned so a radius of ~10 gets a full KICK, radius 100 gets KICK/10.
  softness?: number;
};

// Apply a radial impulsive velocity kick outward from (cx, cy).
// Mutates each particle's vx/vy in place. Particles with life <= 0 are
// skipped (dead / pending re-spawn).
//
// The 1/d falloff (softened by `softness`) is load-bearing for the feel:
// without it, far particles get almost-zero kick and the effect feels local;
// with pure 1/d, center particles explode. The softening term gives every
// particle *something* while keeping the center bounded.
export const applyJellyImpulse = <P extends JellyParticle>(
  particles: readonly P[],
  { cx, cy, kick, softness = 0.1 }: JellyOpts,
): void => {
  for (const p of particles) {
    if (p.life <= 0) continue;
    const dx = p.x - cx;
    const dy = p.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const mag = kick / Math.max(1, d * softness);
    p.vx += (dx / d) * mag;
    p.vy += (dy / d) * mag;
  }
};

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
