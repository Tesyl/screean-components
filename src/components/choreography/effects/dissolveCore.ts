// Pure per-frame body of the dissolve cycle. Shared between:
//   - the new pipeline-friendly `dissolve()` Effect (effects/dissolve.ts)
//   - the legacy `createDissolve()` shim (dom/dissolveAndReform.ts)
//
// Extracted so both consumers run the same particle math byte-identically.
// No DOM, no callbacks, no time-source — just per-particle writes given a
// local time. The caller owns the state object across frames.

import type { Particle, Easing } from 'screean';

export type DissolveCycleState = {
  // Snapshot of (x, y) at the moment the returning phase starts. Captured
  // lazily on first tick of that phase. Lengths == indices.length.
  startsX: Float32Array | null;
  startsY: Float32Array | null;
};

export type DissolveCycleConfig = {
  particlePhaseMs: number;
  returnMs: number;
  fadeMs: number;
  returnEasing: Easing;
};

// Phase derivation: phases are deterministic functions of `t`. Returns one
// of 'particles' | 'returning' | 'reforming' | 'done'.
export type DissolvePhase = 'particles' | 'returning' | 'reforming' | 'done';

export const phaseAt = (t: number, cfg: DissolveCycleConfig): DissolvePhase => {
  if (t < cfg.particlePhaseMs) return 'particles';
  if (t < cfg.particlePhaseMs + cfg.returnMs) return 'returning';
  if (t < cfg.particlePhaseMs + cfg.returnMs + cfg.fadeMs) return 'reforming';
  return 'done';
};

// Apply one frame of the dissolve to the particles at `indices`. Mutates
// state.startsX/Y on first frame of the returning phase (lazy capture).
// During the reforming phase, particles stay pinned at their targets so
// the mirror crossfade can land cleanly over the silhouette.
export const dissolveStep = (
  indices: readonly number[],
  particles: Particle[],
  t: number,
  cfg: DissolveCycleConfig,
  state: DissolveCycleState,
): void => {
  const phase = phaseAt(t, cfg);

  if (phase === 'particles') {
    // Free-physics phase: nothing to do. Forces from the world's force stack
    // continue to act normally.
    return;
  }

  if (phase === 'returning') {
    // Lazy capture on first tick in this phase.
    if (state.startsX === null || state.startsY === null) {
      state.startsX = new Float32Array(indices.length);
      state.startsY = new Float32Array(indices.length);
      for (let k = 0; k < indices.length; k++) {
        const p = particles[indices[k]];
        if (!p || p.life <= 0) continue;
        state.startsX[k] = p.x;
        state.startsY[k] = p.y;
      }
    }
    const lerp = (t - cfg.particlePhaseMs) / cfg.returnMs;
    // Hoist the easing call: same value for every particle this frame.
    const k = cfg.returnEasing(lerp);
    const sx = state.startsX;
    const sy = state.startsY;
    for (let idx = 0; idx < indices.length; idx++) {
      const p = particles[indices[idx]];
      if (!p || p.life <= 0) continue;
      p.x = sx[idx] + (p.tx - sx[idx]) * k;
      p.y = sy[idx] + (p.ty - sy[idx]) * k;
      p.vx = 0;
      p.vy = 0;
    }
    return;
  }

  // Reforming or done: pin to targets so mirror crossfade has a stable
  // silhouette underneath. Final-snap covers any overshoot residual from
  // back/elastic curves.
  for (const i of indices) {
    const p = particles[i];
    if (!p || p.life <= 0) continue;
    p.x = p.tx;
    p.y = p.ty;
  }
};
