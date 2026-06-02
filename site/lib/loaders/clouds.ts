// clouds.ts — anchor-cloud sources for the GPU engine's setAnchors3D.
//
// Each function returns a flat Float32Array of `n × 3` mesh-local floats
// (x, y, z interleaved) — exactly the layout WorldGPU.setAnchors3D
// expects. All clouds are normalised to the same target radius so they
// transition cleanly between one another (no surprise scale jumps when
// the showcase swaps models).
//
// Design notes:
//  - Determinism: every cloud takes a screean Rng so a given seed
//    reproduces the exact point set. Useful for visual debugging.
//  - Y convention: canvas-space y-down for text (so glyphs read upright
//    when projected with an identity matrix); math-space y-up for sphere
//    + heart (rotates symmetrically with the logo's shared transform).
//  - Even distribution beats uniform random for visual quality:
//      * sphere → Fibonacci/golden-angle (no equator clusters)
//      * text   → reservoir sample from thresholded canvas pixels
//      * heart  → parametric outline + interior fill via barycentric
//                 sampling of fan triangles

import type { Rng } from '@tesyl/screean';

// ─── Sphere ────────────────────────────────────────────────────────────
// Fibonacci sphere — places N points on a unit sphere at the golden-
// angle increment. Each point is roughly equidistant from its neighbors;
// no clustering at the poles or equator. Constant-time per point, no
// rejection sampling.
//
// `targetRadius` is the radius the points sit on. The output is centered
// at the origin.
export const sampleSphere = (n: number, targetRadius: number): Float32Array => {
  const out = new Float32Array(n * 3);
  if (n <= 0) return out;
  // Golden angle in radians. Reed's formulation: phi = π × (3 − √5).
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const denom = Math.max(1, n - 1);
  for (let i = 0; i < n; i++) {
    // y from +1 down to −1; r is the radius of the slice at that y.
    const y = 1 - (i / denom) * 2;
    const sliceR = Math.sqrt(Math.max(0, 1 - y * y));
    const theta = goldenAngle * i;
    const x = Math.cos(theta) * sliceR;
    const z = Math.sin(theta) * sliceR;
    out[i * 3] = x * targetRadius;
    out[i * 3 + 1] = y * targetRadius;
    out[i * 3 + 2] = z * targetRadius;
  }
  return out;
};

// ─── Text ──────────────────────────────────────────────────────────────
// Sample N points from the painted region of a text rendered into an
// offscreen canvas. White pixels (luminance ≥ threshold) are eligible;
// each output point is a uniformly-random sample from the eligible set.
//
// Why an offscreen canvas instead of font path data: browsers don't
// expose glyph outlines; a Canvas2D pass is the universal fallback.
// We oversample at 2× DPR and threshold high (160) so antialiased
// glyph edges become hard outlines — without that the cloud feathers
// out and reads as a smudge instead of letters.
//
// y-down convention: canvas pixel (px, py) maps to mesh (px, py, 0).
// When projected with identity matrix and screen Y-down, glyphs render
// upright. Don't flip Y here.
export const sampleText = (opts: {
  text: string;
  font: string; // CSS font shorthand, e.g. "bold 220px Inter, sans-serif"
  n: number;
  rng: Rng;
  targetRadius: number;
  threshold?: number; // 0..255, default 160
  letterSpacing?: number; // px, default 0
}): Float32Array => {
  const { text, font, n, rng, targetRadius } = opts;
  const threshold = opts.threshold ?? 160;
  const out = new Float32Array(n * 3);
  if (n <= 0) return out;

  const dpr = 2; // oversample for crisp threshold edges
  // Measure first to size the canvas — pad generously so descenders +
  // wide font variants don't get clipped.
  const measure = document.createElement('canvas');
  const mctx = measure.getContext('2d')!;
  mctx.font = font;
  if (opts.letterSpacing !== undefined) {
    measure.style.letterSpacing = `${opts.letterSpacing}px`;
  }
  const metrics = mctx.measureText(text);
  // Prefer actualBoundingBox metrics when available (Chrome, modern
  // Safari); fall back to width + a generous height ratio.
  const ascent = metrics.actualBoundingBoxAscent ?? 80;
  const descent = metrics.actualBoundingBoxDescent ?? 30;
  const width = Math.ceil(metrics.width + 32);
  const height = Math.ceil(ascent + descent + 32);

  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
  ctx.scale(dpr, dpr);
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#fff';
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'center';
  ctx.fillText(text, width * 0.5, height * 0.5);

  const imgW = canvas.width;
  const imgH = canvas.height;
  const data = ctx.getImageData(0, 0, imgW, imgH).data;
  // Collect eligible pixel indices (just the linear index — coords are
  // recoverable as ix = i % imgW, iy = Math.floor(i / imgW)).
  // Each eligible pixel is a unit-area sample candidate. With glyphs at
  // 220px font on a 1024-wide canvas, ~30k–80k pixels are typically lit.
  const eligible: number[] = [];
  for (let p = 0; p < imgW * imgH; p++) {
    if (data[p * 4]! >= threshold) eligible.push(p);
  }
  if (eligible.length === 0) return out;

  // Compute extent for centering + scaling. Iterate eligible only —
  // skips the dark margin.
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 0; i < eligible.length; i++) {
    const p = eligible[i]!;
    const px = (p % imgW) / dpr;
    const py = Math.floor(p / imgW) / dpr;
    if (px < minX) minX = px;
    if (px > maxX) maxX = px;
    if (py < minY) minY = py;
    if (py > maxY) maxY = py;
  }
  const cx = (minX + maxX) * 0.5;
  const cy = (minY + maxY) * 0.5;
  const dx = maxX - minX;
  const dy = maxY - minY;
  // Half-diagonal as the extent — same as gltf's centerAndScale so
  // visual radius matches across cloud sources.
  const extent = 0.5 * Math.sqrt(dx * dx + dy * dy);
  const scale = targetRadius / Math.max(extent, 1e-6);

  for (let s = 0; s < n; s++) {
    const p = eligible[(rng() * eligible.length) | 0]!;
    const px = (p % imgW) / dpr;
    const py = Math.floor(p / imgW) / dpr;
    out[s * 3] = (px - cx) * scale;
    out[s * 3 + 1] = (py - cy) * scale;
    out[s * 3 + 2] = 0;
  }
  return out;
};

// ─── Peace sign ────────────────────────────────────────────────────────
// Classic CND peace symbol: circle outline (annulus) plus three internal
// strokes — a full vertical diameter (12 → 6 o'clock) and two half-radius
// diagonals running from center to 4 o'clock and 8 o'clock.
//
// Sampling is rejection-style with squared-distance tests so the inner
// loop has no sqrt. Acceptance rate ≈ 22 % within a 2R × 2R sample
// square — fine for 500 k points (~2.3 M tries, ~30–60 ms at boot).
//
// Strokes (not fill) is the right choice — the peace sign is a line
// design; a filled silhouette would just read as a disc.
export const samplePeace = (opts: {
  n: number;
  rng: Rng;
  targetRadius: number;
  // Stroke width as a fraction of `targetRadius`. 0.07 reads as a
  // slim line drawing; 0.18 reads as a chunky stencil. Default 0.07.
  strokeThickness?: number;
  // Z-extrusion thickness as a fraction of `targetRadius` — the symbol is a
  // flat 2D stencil swept along Z to give it volume. Points are spread
  // uniformly across ±depth/2, so the cloud reads as a solid extruded
  // medallion (not a paper wafer) when it rotates on the shared matrix.
  // 0.05 ≈ the original near-flat look; ~0.4 matches the heart's body.
  depth?: number;
}): Float32Array => {
  const { n, rng, targetRadius } = opts;
  const out = new Float32Array(n * 3);
  if (n <= 0) return out;

  const R = 1.0; // unit-disc sampling space; scaled to targetRadius at write time.
  const strokeThickness = opts.strokeThickness ?? 0.07;
  const depth = opts.depth ?? 0.05;
  const halfStroke = strokeThickness * 0.5;
  const halfStrokeSq = halfStroke * halfStroke;
  const ringInner = R - strokeThickness;
  const ringInnerSq = ringInner * ringInner;
  const Rsq = R * R;

  // Endpoints. +Y is down (canvas / engine screen-space), so the
  // vertical runs from "12" (top, y = -R) to "6" (bottom, y = +R) and
  // the diagonals run from center to 4 and 8 o'clock — both in the
  // lower half of the circle.
  const cos60 = 0.5;
  const sin60 = Math.sqrt(3) / 2; // 0.866…
  const verticalA = { x: 0, y: -R };
  const verticalB = { x: 0, y: R };
  // Left diagonal (8 o'clock): center → (-sin60·R, +cos60·R)
  const leftA = { x: 0, y: 0 };
  const leftB = { x: -sin60 * R, y: cos60 * R };
  // Right diagonal (4 o'clock): center → (+sin60·R, +cos60·R)
  const rightA = { x: 0, y: 0 };
  const rightB = { x: sin60 * R, y: cos60 * R };

  // Squared distance from point (px, py) to segment (ax, ay) → (bx, by).
  // No sqrt — caller compares to halfStrokeSq.
  const distToSegSq = (
    px: number, py: number,
    ax: number, ay: number,
    bx: number, by: number,
  ): number => {
    const dx = bx - ax;
    const dy = by - ay;
    const lenSq = dx * dx + dy * dy;
    let t = lenSq > 0 ? ((px - ax) * dx + (py - ay) * dy) / lenSq : 0;
    if (t < 0) t = 0; else if (t > 1) t = 1;
    const cx = ax + t * dx;
    const cy = ay + t * dy;
    const ex = px - cx;
    const ey = py - cy;
    return ex * ex + ey * ey;
  };

  const inSign = (x: number, y: number): boolean => {
    const r2 = x * x + y * y;
    if (r2 > Rsq) return false;             // Outside the circle entirely.
    if (r2 >= ringInnerSq) return true;     // Inside the outer ring.
    // In the disc interior — only accept if near one of the three strokes.
    if (distToSegSq(x, y, verticalA.x, verticalA.y, verticalB.x, verticalB.y) < halfStrokeSq) return true;
    if (distToSegSq(x, y, leftA.x, leftA.y, leftB.x, leftB.y) < halfStrokeSq) return true;
    if (distToSegSq(x, y, rightA.x, rightA.y, rightB.x, rightB.y) < halfStrokeSq) return true;
    return false;
  };

  const scale = targetRadius / R;
  let s = 0;
  // Bound attempts so a degenerate config can't infinite-loop.
  // 50× the request count at 22 % acceptance leaves > 10× headroom.
  const maxAttempts = n * 50;
  let attempts = 0;
  while (s < n && attempts < maxAttempts) {
    attempts++;
    const x = (rng() - 0.5) * 2 * R;
    const y = (rng() - 0.5) * 2 * R;
    if (!inSign(x, y)) continue;
    out[s * 3] = x * scale;
    out[s * 3 + 1] = y * scale;
    // Z-extrusion: sweep the flat stencil across ±depth/2 so the cloud has
    // real volume when rotated by the shared logo/peace/heart matrix.
    out[s * 3 + 2] = (rng() - 0.5) * depth * targetRadius;
    s++;
  }
  return out;
};

// ─── Heart (the surprise) ──────────────────────────────────────────────
// Surprise rare cloud. Uses the classic parametric heart curve from
// the 1989 paper "A Heart Curve" by Eugen Beutel:
//   x(t) = 16 sin³(t)
//   y(t) = -(13 cos(t) − 5 cos(2t) − 2 cos(3t) − cos(4t))
//
// We sample interior points by picking a point on the outline and a
// random barycentric blend toward the centroid — gives a filled heart
// silhouette without needing a polygon-clip routine. A small Z jitter
// gives the cloud some volume so neighborRepel + spring don't collapse
// it to a 2D plate when it gets clicked.
//
// Negate Y at the end to flip from math-space (heart points up) to
// canvas / engine screen-space (Y-down) so it renders upright when
// projected with the same matrix as the logo.
export const sampleHeart = (opts: {
  n: number;
  rng: Rng;
  targetRadius: number;
}): Float32Array => {
  const { n, rng, targetRadius } = opts;
  const out = new Float32Array(n * 3);
  if (n <= 0) return out;

  // The curve's bbox in mesh-local: roughly x ∈ [−16, 16], y ∈ [−17, 13].
  // Half-diagonal ≈ 25; scale that to the target radius.
  const HALF_DIAG = 0.5 * Math.sqrt(32 * 32 + 30 * 30);
  const scale = targetRadius / HALF_DIAG;

  for (let s = 0; s < n; s++) {
    const t = rng() * Math.PI * 2;
    const sint = Math.sin(t);
    const xCurve = 16 * sint * sint * sint;
    // Beutel's heart curve: y(t) = 13cos − 5cos2 − 2cos3 − cos4. In
    // math-space (Y up) the lobes are at +y and the point is at -y.
    const yCurve = (
      13 * Math.cos(t) -
      5 * Math.cos(2 * t) -
      2 * Math.cos(3 * t) -
      Math.cos(4 * t)
    );
    // Bias toward the interior with a softened sqrt so the cloud looks
    // FILLED, not a hollow outline.
    const r = Math.sqrt(rng());
    const x = xCurve * r;
    const y = yCurve * r;
    // Z jitter — small, just enough that depth-cued alpha + repel reads
    // as 3D when the cloud rotates with the logo's matrix.
    const z = (rng() - 0.5) * 4;
    out[s * 3] = x * scale;
    // Negate once to convert math-Y-up → canvas-Y-down: lobes end up
    // at the top of the screen, point at the bottom (right-side up).
    out[s * 3 + 1] = -y * scale;
    out[s * 3 + 2] = z * scale;
  }
  return out;
};
