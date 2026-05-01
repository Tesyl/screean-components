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
  groupOfPart,
  groupAll,
  groupWhere,
} from './group';

export type { Effect, EffectCtx, EffectScope } from './effect';
export { makeInstantEffect } from './effect';

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
export { pop, type PopOpts } from './effects/pop';
// World primitives.
export { perlinGlitch, type PerlinGlitchOpts } from './effects/perlinGlitch';
// Compound recipes (built on top of atoms via collapsePipelineToEffect).
export { dissolve, type DissolveOpts } from './effects/dissolve';
export { popTo3D, type PopTo3DEffectOpts } from './effects/popTo3D';
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
