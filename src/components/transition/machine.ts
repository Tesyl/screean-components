// The four-frame transition machine — one frame of phase advance.
//
// Extracted verbatim-in-spirit from screean/react ScreenProvider.tick (the
// proven implementation; see types.ts header for lineage). The dt clamp and
// phase ordering are LOAD-BEARING:
//
//   - Physics ticks ONLY in idle/dissolving/particles. `returning` is a
//     deterministic lerp with velocities zeroed so the cursor (pointForce)
//     cannot pull particles off-target during the snap-back.
//   - `reforming` pins particles to targets every frame while the real DOM
//     element fades in ON TOP of them — the crossfade is particles-under-DOM,
//     not a handoff, which is why there is no visible pop.
//
// `applyTransitionFrame` MUTATES world particles and the into-element's
// opacity (the name says so); the returned value is the next phase plus a
// `settled` flag the controller uses to resolve awaiting callers.

import type { World } from '@tesyl/screean';
import {
  DISSOLVE_HANDOFF_MS,
  RETURN_LERP_K,
  RETURN_MS,
} from './constant';
import type { Prettify, TransitionPhase, TransitionTuning } from './types';

export type TransitionFrameResult = Prettify<{
  phase: TransitionPhase;
  // True on the single frame the cycle settles back to idle.
  settled: boolean;
}>;

// Whether physics (world.tick) runs for a given phase. Type-coupled: a new
// phase kind fails compilation here until classified.
export const PHYSICS_ACTIVE: Record<TransitionPhase['kind'], boolean> = {
  idle: true,
  dissolving: true,
  particles: true,
  returning: false,
  reforming: false,
};

export const applyTransitionFrame = (
  phase: TransitionPhase,
  world: World,
  now: number,
  tuning: Pick<TransitionTuning, 'particlePhaseMs' | 'fadeMs'>,
): TransitionFrameResult => {
  if (phase.kind === 'idle') return { phase, settled: false };

  if (phase.kind === 'dissolving') {
    return now - phase.since > DISSOLVE_HANDOFF_MS
      ? { phase: { ...phase, kind: 'particles', since: now }, settled: false }
      : { phase, settled: false };
  }

  if (phase.kind === 'particles') {
    return now - phase.since > tuning.particlePhaseMs
      ? { phase: { ...phase, kind: 'returning', since: now }, settled: false }
      : { phase, settled: false };
  }

  if (phase.kind === 'returning') {
    for (const p of world.particles) {
      p.x += (p.tx - p.x) * RETURN_LERP_K;
      p.y += (p.ty - p.y) * RETURN_LERP_K;
      p.vx = 0;
      p.vy = 0;
    }
    if (now - phase.since >= RETURN_MS) {
      for (const p of world.particles) {
        p.x = p.tx;
        p.y = p.ty;
      }
      return { phase: { ...phase, kind: 'reforming', since: now }, settled: false };
    }
    return { phase, settled: false };
  }

  // reforming
  const t = Math.min(1, (now - phase.since) / tuning.fadeMs);
  phase.into.style.opacity = String(t);
  for (const p of world.particles) {
    p.x = p.tx;
    p.y = p.ty;
  }
  if (t >= 1) {
    world.particles.length = 0;
    phase.into.style.opacity = '1';
    phase.into.style.pointerEvents = 'auto';
    return { phase: { kind: 'idle' }, settled: true };
  }
  return { phase, settled: false };
};
