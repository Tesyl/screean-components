// perlinGlitch — fires the engine's GPU Perlin-noise burst.
//
// Caveats:
//  - GPU-only. CPU world has no perlinGlitch kernel; this effect no-ops on
//    CPU after a one-line dev warning.
//  - Spatial. Affects every live particle inside the kernel's reach,
//    regardless of group indices — same as kick / radialImpulse.
//  - Single active burst at the engine level. Two perlinGlitch effects
//    triggered in close succession diverge from the rest of the stacking
//    contract: the second burst overwrites the first.

import type { Effect } from '../effect';

export type PerlinGlitchOpts = {
  amplitude: number;
  frequency: number;
  octaves?: 1 | 2 | 3;
  durationMs: number;
  seed?: number;
};

// Type guard for the WorldGPU surface. The engine doesn't put applyPerlinGlitch
// on IWorld since it's GPU-specific; we duck-type the method.
type GpuWorld = {
  applyPerlinGlitch: (opts: {
    amplitude: number;
    frequency: number;
    octaves?: number;
    durationMs: number;
    seed?: number;
  }) => void;
};

const hasPerlinGlitch = (w: unknown): w is GpuWorld =>
  typeof w === 'object' &&
  w !== null &&
  'applyPerlinGlitch' in w &&
  typeof (w as GpuWorld).applyPerlinGlitch === 'function';

export const perlinGlitch = (opts: PerlinGlitchOpts): Effect => ({
  scope: 'world',
  duration: opts.durationMs,
  tick: (_indices, ctx) => {
    // Fire once at t=0; the engine drives the rest of the burst across its
    // own internal frame pump. Subsequent ticks are no-ops.
    if (ctx.t !== 0) return;
    if (!hasPerlinGlitch(ctx.world)) {
      // CPU world or other backend without the kernel — silent no-op.
      // Don't throw; the registry default for slider/button might compose
      // perlinGlitch and consumers on CPU should still get the rest of the
      // pipeline working.
      return;
    }
    ctx.world.applyPerlinGlitch({
      amplitude: opts.amplitude,
      frequency: opts.frequency,
      octaves: opts.octaves ?? 2,
      durationMs: opts.durationMs,
      seed: opts.seed,
    });
  },
});
