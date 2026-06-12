// Particle palette resolution — pure given an injected canvas factory.
//
// Promoted from src/demos/html-interop-2/{physics,constant}.ts into the
// library proper (audit §4 Step 2: "reuse the --screean-particle* theme
// tokens + resolveParticlePalette so rasterized clouds inherit themeable
// color with per-component override").
//
// Resolution order, first non-empty wins per slot:
//   1. --screean-particle{,-2,-3} custom properties (component → theme cascade)
//   2. the element's computed background-color, then color
//   3. DEFAULT_PARTICLE_PALETTE
//
// Color parsing bounces off a 1×1 canvas — the simplest cross-browser way to
// resolve oklch(...), hsl(...), named colors, etc. (Tailwind v4 emits oklch,
// so a regex-on-rgba parser would silently drop themed palettes.)

import { packRGBA, type Color } from '@tesyl/screean';
import {
  DEFAULT_PARTICLE_PALETTE,
  PARTICLE_COLOR_VARS,
} from './constant';
import type { Palette } from './types';

// Structurally compatible with real HTMLCanvasElement (fillStyle widened to
// the browser's actual union) and with test stubs that fake the same shape.
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

const DOM_CANVAS_FACTORY: CanvasFactory = () =>
  document.createElement('canvas') as ReturnType<CanvasFactory>;

// Map a CSS color string to a packed opaque Color, or null when the string
// is empty/unparseable/fully transparent.
const packCssColor = (
  css: string,
  factory: CanvasFactory,
): Color | null => {
  const trimmed = css.trim();
  if (trimmed === '') return null;
  const rgba = parseCssColorToRgba(trimmed, factory);
  if (!rgba || rgba[3] === 0) return null;
  return packRGBA(rgba[0], rgba[1], rgba[2], 255);
};

// Resolve the particle palette for an element. See module header for the
// resolution order. Reads computed styles (not pure); parsing is injectable
// for tests via `factory`.
export const resolveParticlePalette = (
  el: HTMLElement,
  factory: CanvasFactory = DOM_CANVAS_FACTORY,
): Palette => {
  const cs = window.getComputedStyle(el);

  const fromVars = PARTICLE_COLOR_VARS
    .map((v) => cs.getPropertyValue(v))
    .map((raw) => packCssColor(raw, factory))
    .filter((c): c is Color => c !== null);
  if (fromVars.length) return fromVars;

  // Fall back to the element's own rendered colors so particles read AS the
  // component, not just at its position.
  const fromComputed = [cs.backgroundColor, cs.color]
    .map((raw) => packCssColor(raw, factory))
    .filter((c): c is Color => c !== null);
  if (fromComputed.length) return fromComputed;

  return DEFAULT_PARTICLE_PALETTE;
};

// Uniform random pick — the per-particle color assignment used by the core.
export const pickFromPalette = (palette: Palette): Color =>
  palette[(Math.random() * palette.length) | 0];
