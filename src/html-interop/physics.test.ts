import { describe, it, expect } from 'vitest';
import {
  applyJellyImpulse,
  parseCssColorToRgba,
  type JellyParticle,
} from './physics';

// Minimal particle factory — only the fields applyJellyImpulse touches.
const p = (x: number, y: number, life = 1): JellyParticle => ({
  x, y, vx: 0, vy: 0, life,
});

describe('applyJellyImpulse', () => {
  it('kicks particles outward from the center along the radial direction', () => {
    // Three particles placed cardinally around the center.
    const right = p(110, 100);
    const up = p(100, 90);
    const left = p(90, 100);

    applyJellyImpulse([right, up, left], { cx: 100, cy: 100, kick: 100 });

    // Right particle → positive vx, zero vy.
    expect(right.vx).toBeGreaterThan(0);
    expect(Math.abs(right.vy)).toBeLessThan(1e-9);
    // Left particle → negative vx, zero vy (equal magnitude to right).
    expect(left.vx).toBeLessThan(0);
    expect(Math.abs(left.vx)).toBeCloseTo(right.vx);
    // Up particle (y=90, so dy=-10) → negative vy, zero vx.
    expect(up.vy).toBeLessThan(0);
    expect(Math.abs(up.vx)).toBeLessThan(1e-9);
  });

  it('skips dead particles (life <= 0)', () => {
    const alive = p(110, 100);
    const dead = p(110, 100, 0);
    const dying = p(110, 100, -0.5);

    applyJellyImpulse([alive, dead, dying], { cx: 100, cy: 100, kick: 100 });

    expect(alive.vx).toBeGreaterThan(0);
    expect(dead.vx).toBe(0);
    expect(dead.vy).toBe(0);
    expect(dying.vx).toBe(0);
  });

  it('falls off with distance (softened 1/d)', () => {
    // Two particles both to the right of center, one close, one far.
    const near = p(110, 100);   // d=10
    const far = p(200, 100);    // d=100

    applyJellyImpulse([near, far], { cx: 100, cy: 100, kick: 100 });

    // Near gets a larger kick than far.
    expect(near.vx).toBeGreaterThan(far.vx);
    // With softness=0.1: near mag = 100/max(1, 1) = 100; far mag = 100/max(1, 10) = 10.
    expect(near.vx).toBeCloseTo(100);
    expect(far.vx).toBeCloseTo(10);
  });

  it('does not produce NaN for a particle exactly at the center', () => {
    // d=0 would divide by zero without the guard. Our guard substitutes d=1,
    // so direction is arbitrary but finite. The key invariant is "no NaN".
    const atCenter = p(100, 100);

    applyJellyImpulse([atCenter], { cx: 100, cy: 100, kick: 100 });

    expect(Number.isFinite(atCenter.vx)).toBe(true);
    expect(Number.isFinite(atCenter.vy)).toBe(true);
  });

  it('accumulates velocity across repeated impulses', () => {
    const particle = p(110, 100);

    applyJellyImpulse([particle], { cx: 100, cy: 100, kick: 100 });
    const afterFirst = particle.vx;
    applyJellyImpulse([particle], { cx: 100, cy: 100, kick: 100 });

    expect(particle.vx).toBeCloseTo(afterFirst * 2);
  });

  it('honors custom softness: smaller softness → stronger center kick', () => {
    const soft = p(110, 100);
    const sharp = p(110, 100);

    applyJellyImpulse([soft], { cx: 100, cy: 100, kick: 100, softness: 1 });
    applyJellyImpulse([sharp], { cx: 100, cy: 100, kick: 100, softness: 0.01 });

    expect(sharp.vx).toBeGreaterThan(soft.vx);
  });
});

describe('parseCssColorToRgba', () => {
  // Stub canvas that supports a minimal set of CSS color strings.
  // Good enough for the demo's palette extraction — the real thing uses
  // the browser's native CSS parser via a real <canvas>.
  const stubFactory = () => {
    let currentFill: [number, number, number, number] = [0, 0, 0, 0];
    return {
      width: 0,
      height: 0,
      getContext: () => ({
        set fillStyle(css: string) {
          if (css === 'rgb(255, 0, 0)') currentFill = [255, 0, 0, 255];
          else if (css === 'rgba(0, 128, 0, 0.5)') currentFill = [0, 128, 0, 128];
          else if (css === 'black') currentFill = [0, 0, 0, 255];
          else currentFill = [0, 0, 0, 0];
        },
        get fillStyle() { return ''; },
        fillRect: () => {},
        getImageData: () => ({
          data: new Uint8ClampedArray(currentFill),
        }),
      }),
    };
  };

  it('parses rgb() strings', () => {
    expect(parseCssColorToRgba('rgb(255, 0, 0)', stubFactory)).toEqual([255, 0, 0, 255]);
  });

  it('parses rgba() strings with alpha', () => {
    expect(parseCssColorToRgba('rgba(0, 128, 0, 0.5)', stubFactory)).toEqual([0, 128, 0, 128]);
  });

  it('parses named colors', () => {
    expect(parseCssColorToRgba('black', stubFactory)).toEqual([0, 0, 0, 255]);
  });

  it('returns null when canvas context is unavailable', () => {
    const noCtxFactory = () => ({
      width: 0,
      height: 0,
      getContext: () => null,
    });
    expect(parseCssColorToRgba('rgb(1,2,3)', noCtxFactory)).toBeNull();
  });
});
