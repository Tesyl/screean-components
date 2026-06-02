// flash — instant write of color, then linear fade back to original over
// decayMs. The first tick paints the color; subsequent ticks lerp back.
// onEnd restores originals for cancel safety.

import type { Color } from '@tesyl/screean';
import { defineEffect, type Effect, type EffectState } from '../effect';
import { lerpColor } from './_color';

export type FlashOpts = {
  color: Color;
  decayMs: number;
};

type FlashState = EffectState & {
  __flash?: { originals: Uint32Array };
};

export const flash = (opts: FlashOpts): Effect =>
  defineEffect<FlashState>({
    scope: 'particle',
    duration: opts.decayMs,
    tick: (indices, ctx) => {
      let state = ctx.state.__flash;
      if (!state) {
        const originals = new Uint32Array(indices.length);
        for (let k = 0; k < indices.length; k++) {
          const p = ctx.particles[indices[k]];
          if (!p || p.life <= 0) continue;
          originals[k] = p.color as unknown as number;
        }
        state = { originals };
        ctx.state.__flash = state;
      }
      const lerp = ctx.t / opts.decayMs;
      const k = 1 - (lerp >= 1 ? 1 : lerp);
      for (let i = 0; i < indices.length; i++) {
        const p = ctx.particles[indices[i]];
        if (!p || p.life <= 0) continue;
        const original = state.originals[i] as unknown as Color;
        p.color = lerpColor(original, opts.color, k);
      }
    },
    onEnd: (indices, ctx) => {
      const state = ctx.state.__flash;
      if (!state) return;
      for (let i = 0; i < indices.length; i++) {
        const p = ctx.particles[indices[i]];
        if (!p || p.life <= 0) continue;
        p.color = state.originals[i] as unknown as Color;
      }
    },
  });
