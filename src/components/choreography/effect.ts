// Effect — the unit of motion. A pure data structure: a tick function plus a
// duration plus an optional cleanup. Effects don't own lifecycle; the runner
// does. This keeps the entire choreography surface composable as plain values.
//
// Two flavors share one shape:
//   instant  — duration === 0, tick fires once, no t/dt math needed
//   temporal — duration  >  0, tick fires every frame, t = local stage time
//
// onEnd runs exactly once per stage, whether the stage completed naturally
// or was cancelled mid-flight. Effects that hold transient world state
// (setForceConstant, setTrail) MUST restore it in onEnd.

import type { Particle, Scene, IWorld, World } from 'screean';
import type { Component } from '../types';

// Either backend works. The runner doesn't call any world method itself —
// effects duck-type for the surface they need (e.g. perlinGlitch checks
// for applyPerlinGlitch). This avoids forcing every demo to go through
// createWorld() (which adds the `backend` field) just to use choreography.
export type ChoreoWorld = IWorld | World;

// Default state shape. Effects with private state declare a richer type via
// defineEffect<S>; the runner stores everything as Record<string, unknown>
// at runtime so heterogeneous pipelines compose freely.
export type EffectState = Record<string, unknown>;

export type EffectCtx<S extends EffectState = EffectState> = {
  particles: Particle[];
  world: ChoreoWorld;
  scene: Scene;
  // Optional: only present when the calling pipeline was triggered against a
  // component (i.e. via groupOfComponent or groupOfPart). Effects that need
  // to re-resolve a subpart at tick time read this — `pop({ part: 'thumb' })`
  // is the canonical case.
  component?: Component;
  // Pre-built host element for DOM-side effects (dissolve fade-in mirror
  // opacity, popTo3D z-projection writes). The runner constructs this once
  // at createChoreoRunner time from the consumer's mirrorHost dep.
  mirrorHost: HTMLElement;
  // Local time within the stage: 0 at activation, `effect.duration` at end.
  // Pipeline-time → stage-time translation is the runner's job.
  t: number;
  // Milliseconds since the previous frame for this stage.
  dt: number;
  // Per-handle scratch space (shared across stages of one pipeline run).
  // Default type is the loose Record<string, unknown>; effects authored via
  // defineEffect<S> see this typed as S inside their tick body.
  state: S;
};

// What an effect touches. Runtime metadata only — pipelines stay polymorphic
// and the runner ignores scope. Used by the lab UI, documentation generators,
// and static analyzers to surface "this effect ignores group indices" or
// "this effect needs ctx.component" without an out-of-band convention.
//
//   particle  — per-index writes (color, position, target, life). NEEDS group.
//   spatial   — geometric pass; indices act as a filter. Reads centroid.
//   world     — global state / engine-level pass. Indices typically ignored.
//   mirror    — DOM mirror element write; reads ctx.component for the target.
export type EffectScope = 'particle' | 'spatial' | 'world' | 'mirror';

export type Effect = {
  scope: EffectScope;
  tick: (indices: readonly number[], ctx: EffectCtx) => void;
  // Called exactly once per stage at end-of-life. Optional — most effects
  // don't need to restore anything.
  onEnd?: (indices: readonly number[], ctx: EffectCtx) => void;
  duration: number;
};

// Typed implementation shape — what defineEffect<S> accepts. The widening
// to non-generic Effect happens inside defineEffect so heterogeneous
// pipelines don't need variance gymnastics.
export type EffectImpl<S extends EffectState> = {
  scope: EffectScope;
  duration: number;
  tick: (indices: readonly number[], ctx: EffectCtx<S>) => void;
  onEnd?: (indices: readonly number[], ctx: EffectCtx<S>) => void;
};

// defineEffect<S>(impl) — type-safe authoring of an effect with private
// state shape S. Inside `tick` and `onEnd`, ctx.state is typed as S; outside,
// the returned Effect is the loose runtime type so pipelines compose freely.
//
// Usage:
//   type DissolveState = { startsX: Float32Array | null; ... };
//   export const dissolve = (opts) => defineEffect<DissolveState>({
//     scope: 'particle',
//     duration: ...,
//     tick: (indices, ctx) => { if (!ctx.state.startsX) {...} },
//   });
export const defineEffect = <S extends EffectState>(
  impl: EffectImpl<S>,
): Effect => impl as unknown as Effect;

// Tiny helper for consumers building one-off instant effects inline.
// Returns a fresh Effect; pure factory. Defaults to particle scope; pass an
// explicit scope when the inline body touches anything else.
export const makeInstantEffect = (
  tick: Effect['tick'],
  scope: EffectScope = 'particle',
): Effect => ({ tick, duration: 0, scope });
