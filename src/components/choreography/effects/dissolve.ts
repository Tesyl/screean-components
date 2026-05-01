// Dissolve — pipeline-friendly Effect. Now a RECIPE built from atomic
// primitives, not a monolith.
//
// Composition (P15.7.1 Phase A):
//   pipe(
//     setMirrorOpacity({ to: 0 }),
//     setMirrorPointerEvents({ to: 'none' }),
//     kick({ ... }),
//     wait(particlePhaseMs),
//     captureStarts({ key: 'dissolveStart' }),
//     easeToTargets({ duration: returnMs, easing, fromKey: 'dissolveStart' }),
//     pinToTargets(),
//     setMirrorOpacity({ to: 1 }),
//     setMirrorPointerEvents({ to: 'auto' }),
//     wait(fadeMs),
//   );
//
// Public surface unchanged: `dissolve(opts)` returns an Effect with the same
// opts shape as before. The wrapper Effect (collapsePipelineToEffect) is what
// makes the recipe addressable as a single drop-in pipeline stage.
//
// Relationship to dom/dissolveAndReform.ts (legacy createDissolve):
// Two parallel implementations of the same conceptual primitive — that file's
// 14 historical tests assert exact tick boundaries using transition-relative
// `since` timestamps which are incompatible with the cleaner cycle-elapsed
// model here. Untouched.

import { easing as curves, type Easing } from 'screean';
import type { Effect } from '../effect';
import { pipe } from '../pipeline';
import { collapsePipelineToEffect } from './_recipe';
import { kick } from './kick';
import { wait } from './wait';
import { captureStarts } from './captureStarts';
import { easeToTargets } from './easeToTargets';
import { pinToTargets } from './pinToTargets';
import { setMirrorOpacity, setMirrorPointerEvents } from './setMirror';

export type DissolveOpts = {
  particlePhaseMs?: number;
  returnMs?: number;
  fadeMs?: number;
  returnEasing?: Easing;
  burstKick?: number;
  burstSoftness?: number;
};

const DISSOLVE_STATE_KEY = 'dissolveStart';

export const dissolve = (opts: DissolveOpts = {}): Effect => {
  const particlePhaseMs = opts.particlePhaseMs ?? 1500;
  const returnMs = opts.returnMs ?? 500;
  const fadeMs = opts.fadeMs ?? 220;
  const returnEasing = opts.returnEasing ?? curves.outCubic;
  const burstKick = opts.burstKick ?? 420;
  const burstSoftness = opts.burstSoftness ?? 0.12;

  const recipe = pipe(
    setMirrorOpacity({ to: 0 }),
    setMirrorPointerEvents({ to: 'none' }),
    kick({ strength: burstKick, softness: burstSoftness }),
    wait(particlePhaseMs),
    captureStarts({ key: DISSOLVE_STATE_KEY }),
    easeToTargets({
      duration: returnMs,
      easing: returnEasing,
      fromKey: DISSOLVE_STATE_KEY,
    }),
    pinToTargets(),
    setMirrorOpacity({ to: 1 }),
    setMirrorPointerEvents({ to: 'auto' }),
    wait(fadeMs),
  );

  return collapsePipelineToEffect(recipe, 'particle');
};
