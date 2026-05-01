// Dissolve — pipeline-friendly Effect that turns the component's particles
// into a radial burst, lets them roam, eases them back to their targets,
// and crossfades the DOM mirror back in.
//
// Pure factory: takes timing/feel opts, returns an Effect. State for each
// active cycle lives in ctx.state (allocated per handle by the runner), so
// concurrent runs of the same pipeline are independent.
//
// What this does NOT do (intentionally):
//   - Color paint. Compose with setColor before/after if you want particles
//     visible during the cycle.
//   - Trigger glue. Use onEvent / applyDefaultChoreography to fire the
//     pipeline; this is the motion primitive only.
//
// Relationship to dom/dissolveAndReform.ts (legacy createDissolve):
// Two parallel implementations of the same conceptual primitive. The legacy
// shim's per-frame body uses transition-relative timing (`since` resets at
// each phase change); this Effect uses cycle-relative time (t from runner).
// They produce the same end-state but differ in exact lerp values during
// the returning phase under irregular tick cadences. The legacy's 14 tests
// assert specific tick boundary behavior that is incompatible with the
// cleaner t-relative model — they stay untouched. The dissolveCore helpers
// live so a future v1.5 can unify, but for v1 the duplication is intentional.

import { easing as curves, radialImpulse, type Easing } from 'screean';
import type { Effect } from '../effect';
import {
  dissolveStep,
  phaseAt,
  type DissolveCycleState,
  type DissolveCycleConfig,
} from './dissolveCore';

export type DissolveOpts = {
  particlePhaseMs?: number;
  returnMs?: number;
  fadeMs?: number;
  returnEasing?: Easing;
  burstKick?: number;
  burstSoftness?: number;
};

// Internal state shape kept in ctx.state. Augments DissolveCycleState with
// DOM mirror handles + initialization flags. Cast on every read.
type State = DissolveCycleState & {
  initialized: boolean;
  div: HTMLDivElement | null;
};

const findMirrorDiv = (
  host: HTMLElement,
  componentId: string | undefined,
): HTMLDivElement | null => {
  if (!componentId) return null;
  return host.querySelector<HTMLDivElement>(
    `[data-component-id="${componentId}"]`,
  );
};

export const dissolve = (opts: DissolveOpts = {}): Effect => {
  const cfg: DissolveCycleConfig = {
    particlePhaseMs: opts.particlePhaseMs ?? 1500,
    returnMs: opts.returnMs ?? 500,
    fadeMs: opts.fadeMs ?? 220,
    returnEasing: opts.returnEasing ?? curves.outCubic,
  };
  const burstKick = opts.burstKick ?? 420;
  const burstSoftness = opts.burstSoftness ?? 0.12;
  const total = cfg.particlePhaseMs + cfg.returnMs + cfg.fadeMs;

  return {
    duration: total,
    tick: (indices, ctx) => {
      const state = ctx.state as unknown as State;

      // First-tick init: locate mirror div, hide it, fire the burst kick.
      if (!state.initialized) {
        state.initialized = true;
        state.startsX = null;
        state.startsY = null;
        state.div = findMirrorDiv(
          ctx.mirrorHost,
          ctx.component?._component.id,
        );
        if (state.div) {
          state.div.style.opacity = '0';
          state.div.style.pointerEvents = 'none';
        }
        const rect = state.div?.getBoundingClientRect();
        const origin = rect
          ? { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }
          : { x: 0, y: 0 };
        radialImpulse(ctx.particles, {
          origin,
          kick: burstKick,
          softness: burstSoftness,
          indices,
        });
      }

      // Run the pure per-frame body.
      dissolveStep(indices, ctx.particles, ctx.t, cfg, state);

      // Crossfade mirror back in once we cross into the reforming phase.
      const phase = phaseAt(ctx.t, cfg);
      if (phase === 'reforming' || phase === 'done') {
        if (state.div && state.div.style.opacity !== '1') {
          state.div.style.opacity = '1';
          state.div.style.pointerEvents = 'auto';
        }
      }
    },
    onEnd: (_indices, ctx) => {
      // Cancellation safety: if we never made it to the reforming phase, the
      // mirror would otherwise stay invisible. Restore unconditionally.
      const state = ctx.state as unknown as State;
      if (state.div) {
        state.div.style.opacity = '1';
        state.div.style.pointerEvents = 'auto';
      }
    },
  };
};
