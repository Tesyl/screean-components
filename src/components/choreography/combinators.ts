// Combinators — operators that take effects/pipelines and return new ones.
// Distinct from primitives, which write to particles/world/mirror directly;
// combinators are pure pipeline transformations.
//
//   parallel(...effects)        — run concurrently (sugar for at(0, ...))
//   narrow(part, effect)         — scope to a named subpart
//   loop({times, gap}, effect)   — repeat N times sequentially
//   when(predicate, effect)      — guard at start
//   stretch(factor, effect)      — scale the effect's duration

import type { Effect } from './effect';
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

const narrowEffect = (part: string, inner: Effect): Effect => ({
  scope: inner.scope,
  duration: inner.duration,
  tick: (indices, ctx) => {
    const narrowed = resolveNarrow(part, indices, ctx);
    inner.tick(narrowed, ctx);
  },
  onEnd: inner.onEnd
    ? (indices, ctx) => {
        const narrowed = resolveNarrow(part, indices, ctx);
        inner.onEnd!(narrowed, ctx);
      }
    : undefined,
});

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

export const loop = (
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

const loopGapEffect = (ms: number): Effect => ({
  scope: 'particle',
  duration: ms,
  tick: () => {},
});

// when — guard. Predicate is evaluated ONCE at t=0; effect runs only if
// predicate returned true. Otherwise no-op for effect.duration ms.
//
// State changes mid-effect don't cancel — same one-shot semantics as
// onEvent. For "watch this state and react," use onState at the trigger
// level.
export const when = (
  predicate: (ctx: Parameters<Effect['tick']>[1]) => boolean,
  effect: Effect,
): Effect => ({
  scope: effect.scope,
  duration: effect.duration,
  tick: (indices, ctx) => {
    const stateMap = ctx.state as { __whenChecked?: boolean; __whenAllow?: boolean };
    if (!stateMap.__whenChecked) {
      stateMap.__whenChecked = true;
      stateMap.__whenAllow = predicate(ctx);
    }
    if (stateMap.__whenAllow) effect.tick(indices, ctx);
  },
  onEnd: effect.onEnd
    ? (indices, ctx) => {
        const stateMap = ctx.state as { __whenAllow?: boolean };
        if (stateMap.__whenAllow) effect.onEnd!(indices, ctx);
      }
    : undefined,
});

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
