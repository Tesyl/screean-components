// pulse — color cycle: original → pulse-color → original over duration.
// Snapshot original color per-particle at first tick (Uint32Array). At end
// or on cancel, restore each particle's original color via onEnd.

import type { Color, Easing } from 'screean';
import { easing as curves } from 'screean';
import { defineEffect, type Effect, type EffectState } from '../effect';
import { lerpColor } from './_color';

export type PulseOpts = {
  color: Color;
  duration: number;
  easing?: Easing;
};

// Typed state. Authoring through defineEffect<PulseState> means ctx.state
// inside tick/onEnd is checked: ctx.state.__pulse autocompletes; reading
// ctx.state.startsX (a different effect's key) is a type error.
type PulseState = EffectState & {
  __pulse?: { originals: Uint32Array };
};

export const pulse = (opts: PulseOpts): Effect => {
  const ease = opts.easing ?? curves.outCubic;
  return defineEffect<PulseState>({
    scope: 'particle',
    duration: opts.duration,
    tick: (indices, ctx) => {
      let state = ctx.state.__pulse;
      if (!state) {
        const originals = new Uint32Array(indices.length);
        for (let k = 0; k < indices.length; k++) {
          const p = ctx.particles[indices[k]];
          if (!p || p.life <= 0) continue;
          originals[k] = p.color as unknown as number;
        }
        state = { originals };
        ctx.state.__pulse = state;
      }

      // 2-phase shape: 0..0.5 → forward, 0.5..1 → reverse. Halve the easing
      // input.
      const lerp = ctx.t / opts.duration;
      const halved = lerp < 0.5 ? lerp * 2 : (1 - lerp) * 2;
      const k = ease(halved);

      for (let i = 0; i < indices.length; i++) {
        const p = ctx.particles[indices[i]];
        if (!p || p.life <= 0) continue;
        const original = state.originals[i] as unknown as Color;
        p.color = lerpColor(original, opts.color, k);
      }
    },
    onEnd: (indices, ctx) => {
      const state = ctx.state.__pulse;
      if (!state) return;
      for (let i = 0; i < indices.length; i++) {
        const p = ctx.particles[indices[i]];
        if (!p || p.life <= 0) continue;
        p.color = state.originals[i] as unknown as Color;
      }
    },
  });
};
