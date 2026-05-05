// scatter — instant per-particle independent velocity impulse.
//
// Distinct from `kick` (radial-from-origin, all particles move outward
// from a shared point) and `spread` (destination-based animation): every
// particle in the group picks its OWN angle and magnitude. The result
// reads as chaotic energy — when the group is bound to a target shape,
// the spring pulls every particle back along its own crooked path,
// producing the "dancing" feel you get in the P24 binding-parity demo.
//
// Routed through `world.binding().setVelocityImpulse` so it runs on both
// CPU and GPU worlds. The binding is fetched once per tick (it's cached
// at the world level — cheap).
//
// Usage:
//   scatter({ magMin: 220, magMax: 400 })             // one-shot disturbance
//   loop({ times: 8, gap: 220 }, scatter({...}))       // dance on a beat
//   onEvent('onClick', pipe(scatter({ magMin: 600 }))) // burst on click
//
// Determinism: by default uses Math.random per call. Pass `seed` for
// reproducible patterns (mulberry32-equivalent local PRNG).

import type { Effect } from '../effect';

export type ScatterOpts = {
  // Lower bound of velocity magnitude (px/s). Default 200.
  magMin?: number;
  // Upper bound of velocity magnitude (px/s). Default magMin + 180.
  magMax?: number;
  // When set, the angle distribution narrows to [angleCenter ± angleSpread/2]
  // (radians). Default: full circle (uniform 0..2π).
  angleCenter?: number;
  angleSpread?: number;
  // Optional 32-bit seed for deterministic patterns. Same seed →
  // same per-particle directions across runs. Default: Math.random.
  seed?: number;
};

// mulberry32 — 32-bit deterministic PRNG. Tiny, no allocations, good
// enough distribution for visual choreography. Inline'd here to avoid
// pulling in screean's RNG (this file should be importable in isolation
// for tests).
const mulberry32 = (seed: number): (() => number) => {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d_2b_79_f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return (((t ^ (t >>> 14)) >>> 0) / 4_294_967_296);
  };
};

export const scatter = (opts: ScatterOpts = {}): Effect => {
  const magMin = opts.magMin ?? 200;
  const magMax = opts.magMax ?? magMin + 180;
  const angleCenter = opts.angleCenter;
  const angleSpread = opts.angleSpread;
  const useFullCircle = angleCenter === undefined || angleSpread === undefined;

  return {
    scope: 'particle',
    duration: 0,
    tick: (indices, ctx) => {
      if (indices.length === 0) return;
      const rng = opts.seed !== undefined ? mulberry32(opts.seed) : Math.random;
      const n = indices.length;
      const vxs = new Float32Array(n);
      const vys = new Float32Array(n);
      for (let k = 0; k < n; k++) {
        const angle = useFullCircle
          ? rng() * Math.PI * 2
          : angleCenter! + (rng() - 0.5) * angleSpread!;
        const mag = magMin + rng() * (magMax - magMin);
        vxs[k] = Math.cos(angle) * mag;
        vys[k] = Math.sin(angle) * mag;
      }
      // Convert readonly indices to mutable for binding.setVelocityImpulse.
      // Sliced (cheap) so the binding doesn't see a structurally-shared array.
      const idxArr = indices.slice() as number[];
      // Both backends support the binding; on CPU world this becomes
      // direct vx/vy mutation. On GPU it queues sparse writes.
      const w = ctx.world as { binding?: () => { setVelocityImpulse: (idx: readonly number[], vxs: Float32Array, vys: Float32Array) => void } };
      if (w.binding) {
        w.binding().setVelocityImpulse(idxArr, vxs, vys);
      } else {
        // Older CPU-only world without the binding factory — fall back to
        // direct particle mutation. Keeps demos that never call createWorld
        // working unchanged.
        for (let k = 0; k < n; k++) {
          const p = ctx.particles[idxArr[k]];
          if (p && p.life > 0) {
            p.vx = vxs[k];
            p.vy = vys[k];
          }
        }
      }
    },
  };
};
