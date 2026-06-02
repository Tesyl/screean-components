// image — non-interactive component that materializes a bitmap as
// particles. The consumer pre-loads an HTMLImageElement (or any image-like
// source); the factory rasterizes it once via OffscreenCanvas and builds a
// BitmapField from the resulting pixel data. Particles are then sampled by
// the field, weighted by alpha — bright/opaque pixels get more particles.
//
// Why pre-loaded image instead of URL: keeps the factory synchronous and
// matches the pattern of every other factory in this directory. Loading is
// the consumer's concern (they own when to await new Image() / fetch /
// decoded ImageBitmap). The factory just turns pixels into a Field.
//
// ARIA: role=img + ariaLabel (required — alt text equivalent). The DOM
// mirror writes both. Decorative-only images can pass ariaRole='none' to
// suppress; consumers who need that should also pass ariaLabel for
// debugging affordance.

import { node, bitmapField, type BitmapSource, type SceneNode } from '@tesyl/screean';
import { component } from '../component';
import { setPart } from '../choreography/parts';
import type { BaseComponentOpts, Component, SizedOpts } from '../types';

export type ImageSource =
  | HTMLImageElement
  | ImageBitmap
  | HTMLCanvasElement
  | OffscreenCanvas;

export type ImageOpts = BaseComponentOpts &
  Pick<SizedOpts, 'width' | 'height' | 'z'> & {
    // Pre-loaded image source. The factory rasterizes it once at construction.
    source: ImageSource;
    // ariaLabel is REQUIRED for image — it's the screen-reader equivalent
    // of HTML `<img alt="...">`. Pass empty string for purely decorative
    // images (matches HTML's `alt=""` convention).
    ariaLabel: string;
    // Pixels with alpha strictly greater than this are particle targets.
    // Default 32 (~12% opacity) keeps anti-aliased edges in the cloud.
    alphaThreshold?: number;
  };

// Rasterize the image source into a BitmapSource (RGBA pixel buffer +
// width/height). One-shot: a single OffscreenCanvas draw, then getImageData.
// No retries — if drawing fails (e.g. CORS-tainted image), the caller sees
// a thrown error from the field constructor and can pre-validate.
const rasterize = (
  source: ImageSource,
  targetW: number,
  targetH: number,
): BitmapSource => {
  const canvas = new OffscreenCanvas(targetW, targetH);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('image: 2d context unavailable for rasterize');
  ctx.drawImage(source, 0, 0, targetW, targetH);
  const imageData = ctx.getImageData(0, 0, targetW, targetH);
  return {
    data: imageData.data,
    width: targetW,
    height: targetH,
  };
};

const intrinsicSize = (source: ImageSource): { w: number; h: number } => {
  if (source instanceof HTMLImageElement) {
    return { w: source.naturalWidth || source.width, h: source.naturalHeight || source.height };
  }
  // ImageBitmap / Canvas types all expose .width / .height directly.
  return { w: source.width, h: source.height };
};

export const image = (opts: ImageOpts): Component => {
  const intrinsic = intrinsicSize(opts.source);
  const w = opts.width ?? intrinsic.w;
  const h = opts.height ?? intrinsic.h;

  const bitmap = rasterize(opts.source, w, h);
  const field = bitmapField({
    source: bitmap,
    origin: { x: 0, y: 0 },
    scale: { x: 1, y: 1 },
    alphaThreshold: opts.alphaThreshold ?? 32,
  });

  // Wrap the field in a node with intrinsic bounds matching the image — the
  // DOM mirror reads this for hit-area sizing.
  const leaf: SceneNode = setPart(node(field, { z: opts.z ?? 0 }), 'chrome');
  leaf.intrinsic = { x: 0, y: 0, w, h };

  return component(leaf, {
    id: opts.id,
    ariaRole: opts.ariaRole ?? 'img',
    ariaLabel: opts.ariaLabel,
  });
};
