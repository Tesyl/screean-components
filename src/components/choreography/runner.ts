// ChoreoRunner — owns live PipelineHandles and the trigger registry. The
// consumer creates one runner per runtime (lab, SPA, demo page) and calls
// runner.tick(now) from their existing rAF. Effects don't own clocks; the
// runner translates wall-clock → pipeline-time → stage-local time and
// builds the EffectCtx fresh per tick.
//
// Lifecycle: every PipelineHandle.run() result is tracked here; tick()
// advances all live handles and prunes done ones. dispose() cancels every
// live handle (running their onEnds) and clears the trigger registry.

import type { Particle, Scene } from 'screean';
import type { Component } from '../types';
import type { ChoreoWorld, Effect, EffectCtx } from './effect';
import type { Group, GroupCtx } from './group';
import type { Pipeline } from './pipeline';

// Returned by runner.run(). The consumer rarely interacts with the handle
// directly — typical use is fire-and-forget through a trigger. Cancel runs
// onEnd on every started stage so transient world state is restored.
export type PipelineHandle = {
  tick: (now: number) => void;
  done: () => boolean;
  cancel: () => void;
};

// Triggers register here so dispose() can clean them up wholesale, and so
// state-trigger predicates get sampled on the same clock as pipelines.
export type TriggerHandle = {
  dispose: () => void;
  // Optional polling hook for state triggers — runner.tick calls this for
  // every registered trigger to sample state predicates and fire enter/exit.
  // The runner passes its tick `now` so the pipeline starts on the same
  // clock as the rest of the runtime.
  pollState?: (now: number) => void;
};

export type ChoreoRunner = {
  // Start a pipeline against a group. Uses the runner's current wall clock
  // (set by the most recent tick). Triggers fire from event handlers between
  // frames; the runner's clock stays at the previous frame's now until the
  // next tick — at most ~16ms stale in production. Tests should call tick()
  // before firing events to make timing deterministic.
  run: (
    pipeline: Pipeline,
    group: Group,
    component?: Component,
  ) => PipelineHandle;
  tick: (now: number) => void;
  attachTrigger: (h: TriggerHandle) => void;
  // Read the runner's current wall-clock (last tick's now, or 0 if untouched).
  // Mostly useful for triggers that want to log or report timing.
  now: () => number;
  getParticles: () => Particle[];
  dispose: () => void;
};

export type ChoreoRunnerDeps = {
  scene: Scene;
  world: ChoreoWorld;
  particles: Particle[];
  mirrorHost: HTMLElement;
};

// Per-stage state tracked inside a handle. A stage is "started" once
// runner-time crosses its startMs; "ended" once runner-time exceeds
// startMs + effect.duration OR the handle is cancelled. onEnd runs exactly
// once; the started/ended booleans guard against double-fire.
type StageRuntime = {
  effect: Effect;
  startMs: number;
  started: boolean;
  ended: boolean;
  lastTickAt: number;  // pipeline-time of previous tick — used for dt math
  indices: readonly number[];
};

const buildHandle = (
  pipeline: Pipeline,
  indices: readonly number[],
  startNow: number,
  buildCtx: (stageT: number, stageDt: number, state: Record<string, unknown>) => EffectCtx,
): PipelineHandle => {
  // Pipeline stages share one state object per handle. This lets the recipe
  // pattern work (captureStarts writes a key, easeToTargets reads the same
  // key from a later stage). Concurrent handles for the same pipeline get
  // independent shared-state objects, so cycles don't cross-contaminate.
  const handleState: Record<string, unknown> = {};
  const runtimes: StageRuntime[] = pipeline.stages.map((s) => ({
    effect: s.effect,
    startMs: s.startMs,
    started: false,
    ended: false,
    lastTickAt: 0,
    indices,
  }));
  let cancelled = false;

  const advance = (now: number): void => {
    if (cancelled) return;
    const elapsed = now - startNow;

    for (const r of runtimes) {
      if (r.ended) continue;

      // Pre-start window: ignore.
      if (elapsed < r.startMs) continue;

      const stageT = elapsed - r.startMs;
      const dtStage = r.started ? elapsed - r.lastTickAt : 0;
      r.lastTickAt = elapsed;

      if (!r.started) r.started = true;

      // Instant effects (duration 0): tick once at activation, then mark ended
      // so the runner stops calling them. onEnd still fires for symmetry.
      if (r.effect.duration === 0) {
        const ctx = buildCtx(0, 0, handleState);
        r.effect.tick(r.indices, ctx);
        r.ended = true;
        if (r.effect.onEnd) r.effect.onEnd(r.indices, ctx);
        continue;
      }

      // Temporal effects: tick with clamped t (so the last frame writes the
      // exact end-state at duration); fire onEnd when crossing the boundary.
      if (stageT >= r.effect.duration) {
        const ctxFinal = buildCtx(r.effect.duration, dtStage, handleState);
        r.effect.tick(r.indices, ctxFinal);
        r.ended = true;
        if (r.effect.onEnd) r.effect.onEnd(r.indices, ctxFinal);
      } else {
        const ctx = buildCtx(stageT, dtStage, handleState);
        r.effect.tick(r.indices, ctx);
      }
    }
  };

  const isDone = (): boolean => {
    if (cancelled) return true;
    return runtimes.every((r) => r.ended);
  };

  const cancel = (): void => {
    if (cancelled) return;
    cancelled = true;
    for (const r of runtimes) {
      if (r.started && !r.ended) {
        r.ended = true;
        if (r.effect.onEnd) {
          // Use a synthetic ctx — at-cancellation t is wherever the stage was
          // last ticked; dt is 0 because no frame elapsed since last advance.
          const ctx = buildCtx(0, 0, handleState);
          r.effect.onEnd(r.indices, ctx);
        }
      }
    }
  };

  return { tick: advance, done: isDone, cancel };
};

export const createChoreoRunner = (deps: ChoreoRunnerDeps): ChoreoRunner => {
  const liveHandles: PipelineHandle[] = [];
  const triggers: TriggerHandle[] = [];
  // Wall-clock state — set by tick(now). Triggers read this when they fire
  // pipelines between frames so the handle starts on the same clock as the
  // runner's last tick.
  let currentNow = 0;

  const run: ChoreoRunner['run'] = (pipeline, group, component) => {
    const groupCtx: GroupCtx = {
      scene: deps.scene,
      particles: deps.particles,
    };
    const indices = group.resolve(groupCtx);

    const buildCtx = (stageT: number, stageDt: number, state: Record<string, unknown>): EffectCtx => ({
      particles: deps.particles,
      world: deps.world,
      scene: deps.scene,
      component,
      mirrorHost: deps.mirrorHost,
      t: stageT,
      dt: stageDt,
      state,
    });

    const handle = buildHandle(pipeline, indices, currentNow, buildCtx);
    liveHandles.push(handle);
    return handle;
  };

  const tick: ChoreoRunner['tick'] = (now) => {
    currentNow = now;
    // Poll state triggers first so any flips fire pipelines THIS frame, and
    // the just-added handles get advanced by the loop below.
    for (const t of triggers) {
      if (t.pollState) t.pollState(now);
    }
    for (let i = liveHandles.length - 1; i >= 0; i--) {
      const h = liveHandles[i];
      h.tick(now);
      if (h.done()) liveHandles.splice(i, 1);
    }
  };

  const attachTrigger: ChoreoRunner['attachTrigger'] = (h) => {
    triggers.push(h);
  };

  const dispose: ChoreoRunner['dispose'] = () => {
    for (const h of liveHandles) h.cancel();
    liveHandles.length = 0;
    // LIFO so chained onEvent wrappers unwind in reverse-install order.
    for (let i = triggers.length - 1; i >= 0; i--) triggers[i].dispose();
    triggers.length = 0;
  };

  return {
    run,
    tick,
    attachTrigger,
    now: () => currentNow,
    getParticles: () => deps.particles,
    dispose,
  };
};
