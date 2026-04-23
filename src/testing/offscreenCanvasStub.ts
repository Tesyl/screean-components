// Deterministic OffscreenCanvas stub for Node-based test runs. Vitest has no
// browser canvas; text field rasterization still needs to go through its full
// code path so tests see realistic bounds and sampling. This stub produces
// length-driven metrics (not real font metrics) so assertions stay stable
// across machines.

const FONT_PX_REGEX = /(\d+(?:\.\d+)?)px/;
const CHAR_W_RATIO = 0.6;
const ASCENT_RATIO = 0.8;
const DESCENT_RATIO = 0.2;

const fontPxSize = (fontStr: string): number => {
  const m = FONT_PX_REGEX.exec(fontStr);
  return m ? parseFloat(m[1]) : 16;
};

class OffscreenCanvasStub {
  width: number;
  height: number;
  constructor(w: number, h: number) {
    this.width = w;
    this.height = h;
  }
  getContext(kind: string) {
    if (kind !== '2d') return null;
    const ctx: {
      font: string;
      textAlign: CanvasTextAlign;
      textBaseline: CanvasTextBaseline;
      fillStyle: string;
      measureText: (s: string) => TextMetrics;
      fillText: (s: string, x: number, y: number) => void;
      getImageData: (x: number, y: number, w: number, h: number) => ImageData;
    } = {
      font: '16px sans-serif',
      textAlign: 'left' as CanvasTextAlign,
      textBaseline: 'alphabetic' as CanvasTextBaseline,
      fillStyle: '#000',
      measureText: (s: string) => {
        const px = fontPxSize(ctx.font);
        return {
          width: s.length * px * CHAR_W_RATIO,
          actualBoundingBoxAscent: px * ASCENT_RATIO,
          actualBoundingBoxDescent: px * DESCENT_RATIO,
        } as TextMetrics;
      },
      fillText: () => {
        // Recorder not needed for component tests; overridable per-test file
        // if anyone ever needs it.
      },
      getImageData: (_x: number, _y: number, w: number, h: number) => {
        // All pixels opaque — the stub exists to produce correct bounds and a
        // non-empty sampler, not to verify glyph rendering.
        const data = new Uint8ClampedArray(w * h * 4);
        for (let i = 3; i < data.length; i += 4) data[i] = 255;
        return { data, width: w, height: h, colorSpace: 'srgb' } as ImageData;
      },
    };
    return ctx;
  }
}

// Install/uninstall helpers for Vitest before/afterAll hooks.
export const installOffscreenCanvasStub = (): void => {
  (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas =
    OffscreenCanvasStub;
};

export const uninstallOffscreenCanvasStub = (): void => {
  delete (globalThis as unknown as { OffscreenCanvas?: unknown }).OffscreenCanvas;
};
