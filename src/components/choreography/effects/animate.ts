// animate — generic param-ramper. Writes a force constant via
// `world.setForceConstants({[param]: lerp(from, to, ease(t/duration))})`
// every tick. Replaces every "Category-B" engine-config effect (perlin
// glitch, gravity ramp, drag ramp) with one composable primitive.
//
// Usage:
//   pipe(
//     animate({ param: 'perlinStrength', to: 0.8, duration: 200 }),
//     animate({ param: 'perlinStrength', to: 0,   duration: 200 }),
//   )
//
// `from` lazy-resolves at the first tick when omitted: reads the current
// value via `world.getForceConstants()`. Pass an explicit `from` to start
// the ramp from a known value regardless of current state.
//
// scope: 'world' — the runner doesn't filter or read indices; the write
// is global. The lab UI / static analyzers can show this effect doesn't
// care about group selection.

import type { Easing } from '@tesyl/screean';
import { easing as curves } from '@tesyl/screean';
import { defineEffect, type Effect, type EffectState } from '../effect';

export type AnimateOpts = {
  // Flat key from the world's ForceConstants (e.g. 'perlinStrength',
  // 'springK', 'drag'). Not validated at construction time — the world
  // ignores unknown keys.
  param: string;
  // Starting value. Defaults to a snapshot of the current value at first
  // tick. Pass explicitly to ramp from a known starting point regardless
  // of current state.
  from?: number;
  to: number;
  duration: number;
  easing?: Easing;
};

// Module-local seq counter generates a unique state key per animate() call.
// Without this, two animate stages in the same pipeline share `__animateFrom`
// and step on each other's lazy snapshots.
let _animateSeq = 0;

export const animate = (opts: AnimateOpts): Effect => {
  const ease = opts.easing ?? curves.outCubic;
  const key = `__animateFrom_${_animateSeq++}` as const;
  return defineEffect<EffectState>({
    scope: 'world',
    duration: opts.duration,
    tick: (_indices, ctx) => {
      // Snapshot the starting value on the first tick. Lazy so the snapshot
      // is taken at activation time, not at pipeline-build time — the
      // intervening physics may have already moved the world's value.
      let from = ctx.state[key] as number | undefined;
      if (from === undefined) {
        from = opts.from ?? readForceConstant(ctx.world, opts.param);
        ctx.state[key] = from;
      }
      const lerp = ctx.t / opts.duration;
      const k = ease(lerp >= 1 ? 1 : lerp);
      const value = from + (opts.to - from) * k;
      writeForceConstant(ctx.world, opts.param, value);
    },
    onEnd: (_indices, ctx) => {
      // Snap to the exact target on end so floating-point lerp drift
      // doesn't leave the value at, say, 0.0001 when the intent was 0.
      writeForceConstant(ctx.world, opts.param, opts.to);
    },
  });
};

// Duck-typed helpers — World + WorldGPU both expose setForceConstants /
// getForceConstants per the IWorld surface added in Phase 1, but ChoreoWorld
// is a union type. Cast through to the read/write surface.
type ForceConstantsRW = {
  getForceConstants: () => Record<string, number>;
  setForceConstants: (next: Record<string, number>) => void;
};

const readForceConstant = (world: unknown, param: string): number => {
  const w = world as ForceConstantsRW;
  return w.getForceConstants()[param] ?? 0;
};

const writeForceConstant = (world: unknown, param: string, value: number): void => {
  const w = world as ForceConstantsRW;
  w.setForceConstants({ [param]: value });
};
