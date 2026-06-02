// flowfield.ts — bounded 2D curl-like vector field for screean particles.
//
// Math: stacked sine layers per axis. Cheap, deterministic, no dependency
// on simplex/perlin. The result reads as a flowfield at normal viewing
// distance — eddies form, dissolve, and re-form on a slow time-axis drift.
//
// Drives screean particles by writing `tx`/`ty` as a small lookahead in
// the flow direction. The spring force then chases the moving target,
// producing continuous drift. Boundary wrap teleports particles across
// the canvas when they leave an edge; we shift `tx` and `ty` together
// with `x`/`y` so the spring doesn't yank the particle back across-screen.

import type { Particle } from '@tesyl/screean';

// Sample the flow vector at world coords (x, y) at time t into a 2-element
// output buffer. Allocation-free by design: the inner loop in
// `stepFlowfield` calls this 8K-20K times per frame, and returning `[fx, fy]`
// would produce ~500K array allocations per second at a normal particle
// count — enough to trigger major GC pauses every few seconds. The caller
// passes a reusable `out` buffer instead.
export const flowAt = (
  x: number,
  y: number,
  t: number,
  scale: number,
  out: [number, number],
): void => {
  out[0] =
    Math.sin(x * scale + t * 0.6) +
    0.6 * Math.cos(y * scale * 1.3 - t * 0.4);
  out[1] =
    Math.cos(x * scale * 1.1 - t * 0.3) -
    0.6 * Math.sin(y * scale + t * 0.5);
};

export type FlowOpts = {
  // Time in seconds. Advances the field's temporal axis.
  time: number;
  // Spatial frequency. ~0.005 = soft slow eddies; ~0.03 = tight churn.
  scale: number;
  // Pixel distance the spring target leads the particle in the flow
  // direction. Larger = faster drift (since spring force scales with
  // tx-x). 28 is a nice middle ground at default `speed=1`.
  lookahead: number;
  // Overall multiplier on the lookahead. The natural exposed control —
  // 0 freezes the field, 4 makes particles dart.
  speed: number;
  // Canvas extents. Particles outside [0, w) × [0, h) wrap to the
  // opposite edge. Both `x`/`y` and `tx`/`ty` are shifted together so
  // the wrap is invisible to the spring.
  bounds: { w: number; h: number };
};

// One step of the flowfield. Mutates particles' tx/ty (and x/y on wrap)
// in place. Pure data, no allocations per call. Skips dead particles.
//
// The inline math (rather than calling flowAt for each particle) avoids
// the function-call overhead of going through a hot loop 8K-20K times per
// frame. flowAt is exported for callers that need a one-off sample.
export const stepFlowfield = (
  particles: Particle[],
  opts: FlowOpts,
): void => {
  const { time, scale, lookahead, speed, bounds } = opts;
  const reach = lookahead * speed;
  const W = bounds.w;
  const H = bounds.h;
  // Pre-compute sin/cos coefficients of time so each particle only does
  // the spatial math, not the temporal mixing.
  const t06 = time * 0.6;
  const t04 = time * 0.4;
  const t03 = time * 0.3;
  const t05 = time * 0.5;
  for (const p of particles) {
    if (p.life <= 0) continue;
    const xs = p.x * scale;
    const ys = p.y * scale;
    const fx =
      Math.sin(xs + t06) +
      0.6 * Math.cos(ys * 1.3 - t04);
    const fy =
      Math.cos(xs * 1.1 - t03) -
      0.6 * Math.sin(ys + t05);
    p.tx = p.x + fx * reach;
    p.ty = p.y + fy * reach;
    // Wrap. Shifting tx with x keeps the spring aimed at the same
    // location relative to the wrapped particle — no across-screen yank.
    if (p.x > W) { p.x -= W; p.tx -= W; }
    else if (p.x < 0) { p.x += W; p.tx += W; }
    if (p.y > H) { p.y -= H; p.ty -= H; }
    else if (p.y < 0) { p.y += H; p.ty += H; }
  }
};
