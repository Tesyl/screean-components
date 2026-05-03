// _recipe — collapse a built Pipeline back into a single Effect so compound
// presets (dissolve, popTo3D, future user recipes) can be exposed as drop-in
// Effects while their internals are pipeline-composed.
//
// State note: pipeline stages share state per handle (runner-level contract),
// so the wrapper can pass ctx.state straight through to inner stages — they
// can communicate via well-known keys (captureStarts → easeToTargets) just
// like any other shared-state pipeline.
//
// The wrapper Effect:
//   - duration = pipeline.duration
//   - scope = the supplied "dominant" scope
//   - tick: dispatches to whichever stages are active at ctx.t
//   - onEnd: walks any started-but-not-ended stages, calling each onEnd
//
// Per-stage activation tracking lives on a private key inside the shared
// ctx.state — it's the only piece of recipe-internal bookkeeping that
// doesn't belong to a user-named state slot.

import type { Effect, EffectCtx, EffectScope } from '../effect';
import type { Pipeline } from '../pipeline';

// Unique-per-recipe key — prevents nested recipes from clobbering each
// other's stage-runtime tracking. Module-local counter; deterministic across
// a single process run.
let _recipeSeq = 0;

type StageRuntime = {
  started: boolean;
  ended: boolean;
};

const getOrCreateRuntimes = (
  ctx: EffectCtx,
  pipeline: Pipeline,
  key: string,
): StageRuntime[] => {
  const stateMap = ctx.state as Record<string, unknown>;
  let rts = stateMap[key] as StageRuntime[] | undefined;
  if (!rts) {
    rts = pipeline.stages.map(() => ({ started: false, ended: false }));
    stateMap[key] = rts;
  }
  return rts;
};

// Build an inner ctx for a stage's tick. Same shared state, same surface,
// just with the stage's local time. Cheap object spread (4 fields).
const innerCtx = (outer: EffectCtx, stageT: number): EffectCtx => ({
  ...outer,
  t: stageT,
});

export const collapsePipelineToEffect = (
  pipeline: Pipeline,
  scope: EffectScope = 'particle',
): Effect => {
  // One key per recipe instance — nested recipes (recipe inside recipe) get
  // distinct slots so their runtime tracking doesn't collide.
  const runtimesKey = `__recipeRuntimes_${_recipeSeq++}`;
  return {
  scope,
  duration: pipeline.duration,
  tick: (indices, ctx) => {
    const runtimes = getOrCreateRuntimes(ctx, pipeline, runtimesKey);
    for (let i = 0; i < pipeline.stages.length; i++) {
      const stage = pipeline.stages[i];
      const rt = runtimes[i];
      if (rt.ended) continue;
      const stageT = ctx.t - stage.startMs;
      if (stageT < 0) continue;

      if (stage.effect.duration === 0) {
        const inner = innerCtx(ctx, 0);
        stage.effect.tick(indices, inner);
        rt.ended = true;
        if (stage.effect.onEnd) stage.effect.onEnd(indices, inner);
        continue;
      }

      rt.started = true;
      const clampedT = stageT >= stage.effect.duration ? stage.effect.duration : stageT;
      const inner = innerCtx(ctx, clampedT);
      stage.effect.tick(indices, inner);

      if (stageT >= stage.effect.duration) {
        rt.ended = true;
        if (stage.effect.onEnd) stage.effect.onEnd(indices, inner);
      }
    }
  },
  onEnd: (indices, ctx) => {
    // Cancel = "fast-forward to end state." Every stage that hasn't already
    // ended runs its tick at its final t (so cleanup writes like setTz(0)
    // or setMirrorOpacity(1) actually fire), then its onEnd.
    //
    // This includes stages that never started — important when cancel happens
    // before the cleanup-tail of a recipe is reached. Without this, e.g.
    // popTo3D cancelled mid-hold leaves tz at the active value instead of
    // restoring it.
    let runtimes = (ctx.state as Record<string, unknown>)[runtimesKey] as
      | StageRuntime[]
      | undefined;
    if (!runtimes) {
      // Cancel fired before any tick — synthesize empty runtimes.
      runtimes = pipeline.stages.map(() => ({ started: false, ended: false }));
      (ctx.state as Record<string, unknown>)[runtimesKey] = runtimes;
    }
    for (let i = 0; i < pipeline.stages.length; i++) {
      const stage = pipeline.stages[i];
      const rt = runtimes[i];
      if (rt.ended) continue;
      const finalT = stage.effect.duration;
      const inner = innerCtx(ctx, finalT);
      stage.effect.tick(indices, inner);
      rt.ended = true;
      if (stage.effect.onEnd) stage.effect.onEnd(indices, inner);
    }
  },
  };
};
