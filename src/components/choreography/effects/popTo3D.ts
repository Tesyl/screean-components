// popTo3D — z-axis lift recipe. Decomposes to: setTz(target) + wait(holdMs)
// + setTz(restTz). The engine's z-spring drives the in-between motion;
// this effect just owns the target-write timing.

import type { Effect } from '../effect';
import { pipe } from '../pipeline';
import { collapsePipelineToEffect } from './_recipe';
import { setTz } from './setTz';
import { wait } from './wait';

export type PopTo3DEffectOpts = {
  // Target depth (positive = toward camera). ±3 is subtle, ±8 dramatic.
  tz: number;
  // Hold duration before snap-back.
  holdMs: number;
  // Rest depth to snap back to. Defaults to 0 (screen plane).
  restTz?: number;
};

export const popTo3D = (opts: PopTo3DEffectOpts): Effect => {
  const restTz = opts.restTz ?? 0;
  const recipe = pipe(
    setTz({ to: opts.tz }),
    wait(opts.holdMs),
    setTz({ to: restTz }),
  );
  return collapsePipelineToEffect(recipe, 'particle');
};
