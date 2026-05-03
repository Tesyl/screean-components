// fade — alpha-only animation. Lerps the alpha channel of each particle's
// color from `from` (or captured) to `to` over duration. RGB preserved.
//
// Use cases: post-dissolve cleanup, "ghost mode" where a component goes
// translucent under the mirror, smooth particle removal.

import type { Color, Easing } from 'screean';
import { easing as curves, unpackA } from 'screean';
import { defineEffect, type Effect, type EffectState } from '../effect';
import { setAlpha } from './_color';

export type FadeOpts = {
  // Starting alpha (0..255). If omitted, captures per-particle alpha at
  // first tick.
  from?: number;
  to: number;
  duration: number;
  easing?: Easing;
};

type FadeState = EffectState & {
  __fade?: { starts: Uint8Array; originals: Uint32Array };
};

export const fade = (opts: FadeOpts): Effect => {
  const ease = opts.easing ?? curves.outCubic;
  return defineEffect<FadeState>({
    scope: 'particle',
    duration: opts.duration,
    tick: (indices, ctx) => {
      let state = ctx.state.__fade;
      if (!state) {
        const starts = new Uint8Array(indices.length);
        const originals = new Uint32Array(indices.length);
        for (let k = 0; k < indices.length; k++) {
          const p = ctx.particles[indices[k]];
          if (!p || p.life <= 0) continue;
          originals[k] = p.color as unknown as number;
          starts[k] = opts.from !== undefined ? opts.from : unpackA(p.color);
        }
        state = { starts, originals };
        ctx.state.__fade = state;
      }
      const lerp = ctx.t / opts.duration;
      const k = ease(lerp >= 1 ? 1 : lerp);
      for (let i = 0; i < indices.length; i++) {
        const p = ctx.particles[indices[i]];
        if (!p || p.life <= 0) continue;
        const a = state.starts[i] + (opts.to - state.starts[i]) * k;
        p.color = setAlpha(state.originals[i] as unknown as Color, a);
      }
    },
  });
};
