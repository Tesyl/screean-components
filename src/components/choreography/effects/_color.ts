// Shared color helpers for visual effects (pulse / flash / fade). Lerp
// between two packed RGBA colors per channel, then repack. The alternative
// — lerping packed integers directly — is wrong (channels overflow into
// each other).

import { packRGBA, unpackA, unpackB, unpackG, unpackR, type Color } from '@tesyl/screean';

export const lerpColor = (from: Color, to: Color, t: number): Color => {
  const fr = unpackR(from);
  const fg = unpackG(from);
  const fb = unpackB(from);
  const fa = unpackA(from);
  const tr = unpackR(to);
  const tg = unpackG(to);
  const tb = unpackB(to);
  const ta = unpackA(to);
  return packRGBA(
    Math.round(fr + (tr - fr) * t),
    Math.round(fg + (tg - fg) * t),
    Math.round(fb + (tb - fb) * t),
    Math.round(fa + (ta - fa) * t),
  );
};

// Lerp only the alpha channel — used by fade(). Cheaper than full RGBA
// lerp and keeps tint preserved when only opacity changes.
export const setAlpha = (c: Color, alpha: number): Color => {
  const r = unpackR(c);
  const g = unpackG(c);
  const b = unpackB(c);
  return packRGBA(r, g, b, Math.round(alpha));
};
