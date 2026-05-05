// Combinators — operators that take effects/pipelines and return new ones.
// Distinct from primitives, which write to particles/world/mirror directly;
// combinators are pure pipeline transformations.
//
//   parallel(...effects)        — run concurrently (sugar for at(0, ...))
//   narrow(part, effect)         — scope to a named subpart
//   loop({times, gap}, effect)   — repeat N times sequentially
//   when(predicate, effect)      — guard at start
//   stretch(factor, effect)      — scale the effect's duration

import { defineEffect, type Effect, type EffectCtx, type EffectState } from './effect';
import type { Pipeline } from './pipeline';
import { pipe, at } from './pipeline';
import { groupOfPart } from './group';

const isPipeline = (x: Effect | Pipeline): x is Pipeline =>
  'stages' in x && 'duration' in x;

// parallel — run multiple effects/pipelines concurrently. Each starts at
// pipeline-time 0; the resulting Pipeline.duration = max of inner durations.
//
// Equivalent to `pipe(at(0, a), at(0, b), at(0, c))` but reads more
// naturally at call sites.
export const parallel = (
  ...stages: Array<Effect | Pipeline>
): Pipeline => pipe(...stages.map((s) => at(0, s)));

// narrow — scope an effect or pipeline to a named subpart of the current
// component. The resulting effect/pipeline re-resolves indices to the
// subpart inside its own tick. Falls back to the original indices when
// ctx.component is missing or the part isn't found (silent — no crash).
//
// Replaces the per-effect `part?: string` opt pattern. After this lands,
// `pop({part: 'thumb'})` is just `narrow('thumb', pop({...}))`.
export function narrow(part: string, effect: Effect): Effect;
export function narrow(part: string, pipeline: Pipeline): Pipeline;
export function narrow(part: string, target: Effect | Pipeline): Effect | Pipeline {
  if (isPipeline(target)) {
    // Wrap every stage with a narrowed effect so each tick re-resolves.
    return {
      stages: target.stages.map((s) => ({
        effect: narrowEffect(part, s.effect),
        startMs: s.startMs,
      })),
      duration: target.duration,
    };
  }
  return narrowEffect(part, target);
}

// Each narrow() instance gets a unique cache key — same module-local seq
// pattern as when() / animate() / recipes. Without this, two narrows of
// different parts in the same pipeline would share `__narrow` and the
// second narrow would use the first narrow's cached subset.
let _narrowSeq = 0;

const narrowEffect = (part: string, inner: Effect): Effect => {
  const key = `__narrow_${_narrowSeq++}` as const;
  return {
    scope: inner.scope,
    duration: inner.duration,
    tick: (indices, ctx) => {
      let cached = (ctx.state as Record<string, unknown>)[key] as
        | readonly number[]
        | undefined;
      if (cached === undefined) {
        cached = resolveNarrow(part, indices, ctx);
        (ctx.state as Record<string, unknown>)[key] = cached;
      }
      inner.tick(cached, ctx);
    },
    onEnd: inner.onEnd
      ? (indices, ctx) => {
          // Reuse the cached subset if present (fast path); otherwise
          // resolve once. onEnd may fire on cancel BEFORE any tick, so
          // we can't assume the cache exists.
          let cached = (ctx.state as Record<string, unknown>)[key] as
            | readonly number[]
            | undefined;
          if (cached === undefined) {
            cached = resolveNarrow(part, indices, ctx);
            (ctx.state as Record<string, unknown>)[key] = cached;
          }
          inner.onEnd!(cached, ctx);
        }
      : undefined,
  };
};

const resolveNarrow = (
  part: string,
  fallback: readonly number[],
  ctx: Parameters<Effect['tick']>[1],
): readonly number[] => {
  if (!ctx.component) return fallback;
  const partGroup = groupOfPart(ctx.component, part);
  const subset = partGroup.resolve({
    scene: ctx.scene,
    particles: ctx.particles,
  });
  return subset.length > 0 ? subset : fallback;
};

// loop — sequence the effect N times with `gap` ms between iterations.
// Total duration = times * effect.duration + (times - 1) * gap.
export type LoopOpts = {
  times: number;
  gap?: number;
};

type LoopFn = ((opts: LoopOpts, target: Effect | Pipeline) => Pipeline) & {
  streaming: (opts: LoopStreamingOpts, inner: Effect) => Effect;
};

const loopBase = (
  opts: LoopOpts,
  target: Effect | Pipeline,
): Pipeline => {
  const gap = opts.gap ?? 0;
  const times = Math.max(1, Math.floor(opts.times));
  const stages: Array<Effect | Pipeline> = [];
  for (let i = 0; i < times; i++) {
    stages.push(target);
    if (i < times - 1 && gap > 0) {
      stages.push(loopGapEffect(gap));
    }
  }
  return pipe(...stages);
};
export const loop = loopBase as LoopFn;

const loopGapEffect = (ms: number): Effect => ({
  scope: 'particle',
  duration: ms,
  tick: () => {},
});

// loop.streaming — single Effect that runs the inner effect N times via
// internal iteration counter, optionally short-circuiting on a predicate.
// Cheaper than `loop({times: N})` at high N (no pre-materialized stages).
//
// Each iteration replays the inner effect with reset stage-time, in its
// own per-iteration sub-state slot — `__animateFrom` and similar lazy
// snapshots reset cleanly between iterations.
//
//   loop.streaming({ times: 1000 }, kick({...}))      // bounded
//   loop.streaming({ predicate: (n) => n < 5 }, fx)   // break-style
//
// Total duration = times * inner.duration + (times - 1) * gap (or
// Infinity when predicate is provided without times — runner won't
// auto-mark-done, caller must dispose).
export type LoopStreamingOpts = {
  times?: number;
  gap?: number;
  // Stops after the iteration index where this returns false.
  // Evaluated AT THE START of each iteration. Without `times`, this is
  // the only thing that ends the loop.
  predicate?: (iteration: number) => boolean;
};

let _loopSeq = 0;

const loopStreaming = (
  opts: LoopStreamingOpts,
  inner: Effect,
): Effect => {
  const innerDur = inner.duration;
  const gap = opts.gap ?? 0;
  // When `times` is set, total duration is bounded — runner will end
  // the stage when t >= duration. When predicate-only, duration is
  // effectively unbounded; we use Number.POSITIVE_INFINITY so the
  // runner never auto-ends.
  const duration = opts.times !== undefined
    ? Math.max(1, Math.floor(opts.times)) * innerDur +
      Math.max(0, Math.floor(opts.times) - 1) * gap
    : Number.POSITIVE_INFINITY;

  const stateKey = `__loopStreaming_${_loopSeq++}` as const;

  type LoopState = {
    iteration: number;          // current 0-based index
    iterStartT: number;         // stage-t when current iteration started
    innerSubState: Record<string, unknown>;  // per-iter scratch for `inner`
    done: boolean;              // predicate short-circuited or times reached
  };

  return defineEffect<EffectState>({
    scope: inner.scope,
    duration,
    tick: (indices, ctx) => {
      const stateMap = ctx.state as Record<string, unknown>;
      let s = stateMap[stateKey] as LoopState | undefined;
      if (!s) {
        s = {
          iteration: 0,
          iterStartT: 0,
          innerSubState: {},
          done: false,
        };
        stateMap[stateKey] = s;
      }
      if (s.done) return;

      // Predicate gate at iteration boundaries.
      if (opts.predicate && !opts.predicate(s.iteration)) {
        s.done = true;
        return;
      }

      // Stage-local time for the current iteration.
      const localT = ctx.t - s.iterStartT;

      // If the iteration's inner.duration is 0 (instant): tick once
      // immediately, advance to next iter.
      if (innerDur === 0) {
        const innerCtx: EffectCtx = { ...ctx, t: 0, state: s.innerSubState };
        inner.tick(indices, innerCtx);
        if (inner.onEnd) inner.onEnd(indices, innerCtx);
        s.iteration++;
        s.innerSubState = {};
        s.iterStartT = ctx.t;
        if (opts.times !== undefined && s.iteration >= opts.times) s.done = true;
        return;
      }

      if (localT < innerDur) {
        const innerCtx: EffectCtx = { ...ctx, t: localT, state: s.innerSubState };
        inner.tick(indices, innerCtx);
        return;
      }

      // Crossed the iteration boundary. Fire the final tick + onEnd at
      // exactly t=innerDur so the inner effect lands cleanly.
      const finalCtx: EffectCtx = { ...ctx, t: innerDur, state: s.innerSubState };
      inner.tick(indices, finalCtx);
      if (inner.onEnd) inner.onEnd(indices, finalCtx);

      // Advance iteration.
      s.iteration++;
      s.innerSubState = {};
      s.iterStartT = ctx.t + (gap > 0 ? gap : 0);
      if (opts.times !== undefined && s.iteration >= opts.times) {
        s.done = true;
        return;
      }
      // Fire the new iteration's t=0 tick within the same outer tick so
      // start-of-iteration logic (lazy snapshots, color writes, etc.)
      // takes effect immediately rather than waiting one frame.
      if (gap === 0 && (!opts.predicate || opts.predicate(s.iteration))) {
        const startCtx: EffectCtx = { ...ctx, t: 0, state: s.innerSubState };
        inner.tick(indices, startCtx);
      }
    },
  });
};

// Attach `streaming` as a method on `loop` so consumers can write
// `loop.streaming(...)` alongside `loop(...)`.
loop.streaming = loopStreaming;

// when — guard. Predicate is evaluated ONCE at t=0; effect runs only if
// predicate returned true. Otherwise no-op for effect.duration ms.
//
// Each when() call gets a unique state key so two when-wrapped effects in
// the same pipeline don't clobber each other.
//
// State changes mid-effect don't cancel — same one-shot semantics as
// onEvent. For "watch this state and react," use onState at the trigger
// level.
let _whenSeq = 0;

export const when = (
  predicate: (ctx: Parameters<Effect['tick']>[1]) => boolean,
  effect: Effect,
): Effect => {
  const key = `__when_${_whenSeq++}` as const;
  type WhenState = EffectState & {
    [k: string]: { checked: boolean; allow: boolean } | unknown;
  };
  return defineEffect<WhenState>({
    scope: effect.scope,
    duration: effect.duration,
    tick: (indices, ctx) => {
      let slot = ctx.state[key] as { checked: boolean; allow: boolean } | undefined;
      if (!slot || !slot.checked) {
        slot = { checked: true, allow: predicate(ctx) };
        ctx.state[key] = slot;
      }
      if (slot.allow) effect.tick(indices, ctx);
    },
    onEnd: effect.onEnd
      ? (indices, ctx) => {
          const slot = ctx.state[key] as { allow: boolean } | undefined;
          if (slot?.allow) effect.onEnd!(indices, ctx);
        }
      : undefined,
  });
};

// stretch — scale the wrapped effect's duration by `factor`. Same start
// time, scaled end. The inner effect's tick still sees its full
// [0, original_duration] t range — we remap to keep curves identical.
//
// Useful for "the same dissolve but 2x slower" without rebuilding opts.
//   stretch(2, dissolve({...}))   // duration doubled, motion unchanged
//   stretch(0.5, kick({...}))     // half-duration; for instants this is
//                                 // a no-op since duration=0
export const stretch = (factor: number, effect: Effect): Effect => {
  if (factor <= 0) {
    throw new Error(`stretch: factor must be > 0 (got ${factor})`);
  }
  if (effect.duration === 0) return effect; // instant: no time to scale
  const scaledDuration = effect.duration * factor;
  return {
    scope: effect.scope,
    duration: scaledDuration,
    tick: (indices, ctx) => {
      const remapped = { ...ctx, t: ctx.t / factor };
      effect.tick(indices, remapped);
    },
    onEnd: effect.onEnd
      ? (indices, ctx) => {
          const remapped = { ...ctx, t: ctx.t / factor };
          effect.onEnd!(indices, remapped);
        }
      : undefined,
  };
};
