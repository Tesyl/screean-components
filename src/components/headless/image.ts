// headless image — discrete, rasterize at edges (Pattern A).
//
// A real <img>. The one image-specific concern is readiness: rasterizing
// before the bitmap is decoded samples an empty silhouette (the same class
// of bug as rasterizing before document.fonts.ready — which the core
// already awaits). `dissolve` here awaits decode() first.
//
// Cross-origin note: a tainting-prone src (foreign origin without CORS)
// breaks getImageData inside the rasterizer. Same-origin or data: URLs are
// the safe inputs — see the rasterizer input contract in the DECISION doc.

import type { ElementComponent, HeadlessBaseOpts } from './types';
import type { Prettify } from '../transition';
import { applyBaseOpts, applyStyles, toElementComponent } from './element';

export type HeadlessImageOpts = Prettify<
  HeadlessBaseOpts & {
    src: string;
    alt: string; // mandatory — decorative images should say alt: ''
    width?: number;
    height?: number;
  }
>;

export const headlessImage = (
  opts: HeadlessImageOpts,
): ElementComponent<HTMLImageElement, 'img'> => {
  const el = document.createElement('img');
  el.src = opts.src;
  el.alt = opts.alt;
  if (opts.width !== undefined) el.width = opts.width;
  if (opts.height !== undefined) el.height = opts.height;

  if (!opts.unstyled) applyStyles(el, { borderRadius: '10px', display: 'block' });
  applyBaseOpts(el, opts);

  const base = toElementComponent({ el, role: 'img', screen: opts.screen });
  return {
    ...base,
    dissolve: async () => {
      // Decode failures fall through to the base dissolve — the rasterizer
      // then captures whatever the element actually paints (alt text /
      // broken-image glyph), which is the honest visual.
      await el.decode().catch(() => {});
      return base.dissolve();
    },
  };
};
