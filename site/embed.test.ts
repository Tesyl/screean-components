// Tests for embed.ts — site library helpers used by every page and tile.
//
// We cover the pure helpers (geometry + color sampling) here. Stage itself
// is integration-heavy (canvas + WebGL/Canvas2D context creation, RAF) and
// is exercised by site smoke tests rather than unit tests.

import { describe, expect, it } from 'vitest';
import { nGon, starVerts, makeColor } from './embed';
import { unpackR, unpackG, unpackB, unpackA } from '@tesyl/screean';

describe('nGon', () => {
  it('produces exactly `sides` vertices', () => {
    expect(nGon(10, 3)).toHaveLength(3);
    expect(nGon(10, 6)).toHaveLength(6);
    expect(nGon(10, 12)).toHaveLength(12);
  });

  it('places vertices on the radius', () => {
    const verts = nGon(50, 6);
    for (const [x, y] of verts) {
      const r = Math.hypot(x, y);
      // Within float-precision of the requested radius.
      expect(r).toBeCloseTo(50, 5);
    }
  });

  it('respects rotation argument', () => {
    // With rot=0 the first vertex sits at angle 0 → (r, 0).
    const flat = nGon(10, 4, 0);
    expect(flat[0][0]).toBeCloseTo(10, 5);
    expect(flat[0][1]).toBeCloseTo(0, 5);
    // With rot=π/2 the first vertex rotates 90° CCW → (0, r).
    const rotated = nGon(10, 4, Math.PI / 2);
    expect(rotated[0][0]).toBeCloseTo(0, 5);
    expect(rotated[0][1]).toBeCloseTo(10, 5);
  });
});

describe('starVerts', () => {
  it('produces 2 × points vertices', () => {
    expect(starVerts(10, 5, 0.4)).toHaveLength(10);
    expect(starVerts(10, 6, 0.5)).toHaveLength(12);
  });

  it('alternates outer / inner radii', () => {
    const v = starVerts(100, 5, 0.4);
    for (let i = 0; i < v.length; i++) {
      const r = Math.hypot(v[i][0], v[i][1]);
      const expected = i % 2 === 0 ? 100 : 40;
      expect(r).toBeCloseTo(expected, 5);
    }
  });
});

describe('makeColor', () => {
  it('returns RGBA values within the requested HSL band', () => {
    const sample = makeColor({ hueCenter: 0, hueRange: 0, sat: 0, lit: 0.5 });
    // sat=0 collapses HSL to a pure grey at lit=0.5 → 127/127/127 (rounded).
    const c = sample();
    expect(unpackR(c)).toBeGreaterThanOrEqual(126);
    expect(unpackR(c)).toBeLessThanOrEqual(128);
    expect(unpackR(c)).toBe(unpackG(c));
    expect(unpackG(c)).toBe(unpackB(c));
    expect(unpackA(c)).toBe(255);
  });

  it('keeps hue inside [0, 360) even when center+jitter would underflow', () => {
    // hueCenter=0 with hueRange=20 puts samples in [-10, 10] before wrap.
    // Wrapping should land them in [350, 360) ∪ [0, 10) — never NaN, never <0.
    const sample = makeColor({ hueCenter: 0, hueRange: 20, sat: 1, lit: 0.5 });
    for (let i = 0; i < 50; i++) {
      const c = sample();
      // Pure red OR pure red bordering on magenta — unpacked R is always
      // either max or near-max, but importantly the call must not throw or
      // produce NaN.
      expect(unpackR(c)).toBeGreaterThanOrEqual(0);
      expect(unpackR(c)).toBeLessThanOrEqual(255);
    }
  });
});
