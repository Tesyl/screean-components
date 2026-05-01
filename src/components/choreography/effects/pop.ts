// pop — a "click feedback" effect. Outward radial impulse + brief settling
// window where the engine's spring physics pulls particles back toward
// targets. Compose into pipelines via pipe(pop({...}), at(120, dissolve(...))).
//
// Honors a `part` opt that re-resolves the group to a named subpart of the
// component at tick time — enables `pop({ part: 'thumb' })` against a slider
// without the call site knowing the slider's particle indices.

import { radialImpulse } from 'screean';
import type { Effect } from '../effect';
import { groupOfPart } from '../group';
import { centroidOf } from './_geom';

export type PopOpts = {
  // Peak impulse magnitude. 0–1 is "subtle"; 0.5+ is "punchy". Default 0.4.
  intensity?: number;
  // Optional subpart name to re-resolve inside tick (slider.thumb,
  // button.chrome). When omitted, operates on the indices passed in.
  part?: string;
  // Falloff softness (passed to radialImpulse). Smaller = harder.
  softness?: number;
};

const POP_DURATION_MS = 400;
const STRENGTH_BASE = 350;

export const pop = (opts: PopOpts = {}): Effect => ({
  scope: 'spatial',
  duration: POP_DURATION_MS,
  tick: (indices, ctx) => {
    // Apply impulse only on first tick — subsequent frames let the spring
    // physics handle the settle, so we don't keep re-kicking.
    if (ctx.t !== 0) return;

    // Re-resolve to subpart if requested. Falls back to the original indices
    // when no component is in ctx (e.g. groupAll triggered) or the part is
    // missing.
    let resolved: readonly number[] = indices;
    if (opts.part && ctx.component) {
      const partGroup = groupOfPart(ctx.component, opts.part);
      const subset = partGroup.resolve({
        scene: ctx.scene,
        particles: ctx.particles,
      });
      if (subset.length > 0) resolved = subset;
    }

    if (resolved.length === 0) return;
    const origin = centroidOf(resolved, ctx.particles);
    const intensity = opts.intensity ?? 0.4;
    radialImpulse(ctx.particles, {
      origin,
      kick: STRENGTH_BASE * intensity,
      softness: opts.softness ?? 0.1,
      indices: resolved,
    });
  },
});
