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

import type { Particle, Scene, IWorld } from 'screean';
import type { Component } from '../types';

export type EffectCtx = {
  particles: Particle[];
  world: IWorld;
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
};

export type Effect = {
  tick: (indices: readonly number[], ctx: EffectCtx) => void;
  // Called exactly once per stage at end-of-life. Optional — most effects
  // don't need to restore anything.
  onEnd?: (indices: readonly number[], ctx: EffectCtx) => void;
  duration: number;
};

// Tiny helper for consumers building one-off instant effects inline.
// Returns a fresh Effect; pure factory.
export const makeInstantEffect = (
  tick: Effect['tick'],
): Effect => ({ tick, duration: 0 });
