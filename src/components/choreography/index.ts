// Choreography — composable particle-motion behaviors for components.
//
// Conceptual model:
//   Group     — selects particle indices (logical or geometric)
//   Effect    — pure-function tick that mutates particles for a duration
//   Pipeline  — ordered, timed composition of effects (built via pipe + at)
//   Trigger   — wires a pipeline to an event source (onEvent or onState)
//   Runner    — owns live pipelines + the trigger registry; ticks per frame

export { setPart, getPart, findPart } from './parts';

export type { Group, GroupCtx } from './group';
export {
  groupOfComponent,
  groupOfSubtree,
  groupOfPart,
  groupAll,
  groupWhere,
} from './group';

export type {
  Effect,
  EffectCtx,
  EffectScope,
  EffectState,
  EffectImpl,
  ChoreoWorld,
} from './effect';
export { defineEffect, makeInstantEffect } from './effect';

export type { Pipeline, PipelineStage } from './pipeline';
export { pipe, at } from './pipeline';

export type { ChoreoRunner, ChoreoRunnerDeps, PipelineHandle, TriggerHandle } from './runner';
export { createChoreoRunner } from './runner';

export { onEvent, onState } from './trigger';

// ─── Effect primitives ─────────────────────────────────────────────────────
// Atomic primitives — small, single-responsibility, scope-typed.
export { wait } from './effects/wait';
export { setColor, type SetColorOpts } from './effects/setColor';
export { setTz, type SetTzOpts } from './effects/setTz';
export {
  setMirrorOpacity,
  setMirrorPointerEvents,
  type SetMirrorOpacityOpts,
  type SetMirrorPointerEventsOpts,
} from './effects/setMirror';
export { captureStarts, type CaptureStartsOpts, type CapturedStarts } from './effects/captureStarts';
export { easeToTargets, type EaseToTargetsOpts } from './effects/easeToTargets';
export { pinToTargets } from './effects/pinToTargets';
// Spatial primitives.
export { kick, type KickOpts } from './effects/kick';
export { scatter, type ScatterOpts } from './effects/scatter';
export { pop, type PopOpts } from './effects/pop';
// Spatial transforms.
export { gather, type GatherOpts, type GatherTo } from './effects/gather';
export { spread, type SpreadOpts } from './effects/spread';
export { rotate, type RotateOpts, type RotateAround } from './effects/rotate';
export { scale, type ScaleOpts, type ScaleAround } from './effects/scale';
export { teleport, type TeleportOpts } from './effects/teleport';
// Forces & textures (temporal velocity injection).
export { gravity, type GravityOpts } from './effects/gravity';
export { magnetize, type MagnetizeOpts, type MagnetizeTo } from './effects/magnetize';
export { vibrate, type VibrateOpts } from './effects/vibrate';
export { shake, type ShakeOpts } from './effects/shake';
export { shimmer, type ShimmerOpts } from './effects/shimmer';
// Visual.
export { pulse, type PulseOpts } from './effects/pulse';
export { flash, type FlashOpts } from './effects/flash';
export { fade, type FadeOpts } from './effects/fade';
// World primitives.
export { animate, type AnimateOpts } from './effects/animate';
// (perlinGlitch effect retired in Phase 4 — perlin is now a regular force
//  on the world. Use animate({param: 'perlinStrength', ...}) for ramps.)
// Compound recipes (built on top of atoms via collapsePipelineToEffect).
export { dissolve, type DissolveOpts } from './effects/dissolve';
export { popTo3D, type PopTo3DEffectOpts } from './effects/popTo3D';
// Visual recipes (depth-as-illusion, distinct from physical depth).
// Composes scale + fade — works on every backend, no z-axis required.
export {
  visual,
  fallAway,
  riseUp,
  type FallAwayOpts,
  type RiseUpOpts,
} from './effects/visual';
// Recipe builder — exported so user-defined recipes can use it too.
export { collapsePipelineToEffect } from './effects/_recipe';

// ─── Combinators ───────────────────────────────────────────────────────────
export {
  parallel,
  narrow,
  loop,
  when,
  stretch,
  type LoopOpts,
} from './combinators';

// ─── Default choreography ──────────────────────────────────────────────────
export { defaultChoreography, type ChoreoMap, type StatePair } from './defaults';
export { applyDefaultChoreography } from './apply';
