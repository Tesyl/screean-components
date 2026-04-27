import { describe, it, expect } from 'vitest';
import { parseCssColorToRgba } from './physics';
// NOTE: the radial-impulse tests that used to live here moved into
// screean/src/choreography/radialImpulse.test.ts along with the function.

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
