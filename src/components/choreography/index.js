// Choreography — composable particle-motion behaviors for components.
//
// Conceptual model:
//   Group     — selects particle indices (logical or geometric)
//   Effect    — pure-function tick that mutates particles for a duration
//   Pipeline  — ordered, timed composition of effects (built via pipe + at)
//   Trigger   — wires a pipeline to an event source (onEvent or onState)
//   Runner    — owns live pipelines + the trigger registry; ticks per frame
export { setPart, getPart, findPart } from './parts';
export { groupOfComponent, groupOfPart, groupAll, groupWhere, } from './group';
export { makeInstantEffect } from './effect';
export { pipe, at } from './pipeline';
export { createChoreoRunner } from './runner';
export { onEvent, onState } from './trigger';
// ─── Effect primitives ─────────────────────────────────────────────────────
// Atomic primitives — small, single-responsibility, scope-typed.
export { wait } from './effects/wait';
export { setColor } from './effects/setColor';
export { setTz } from './effects/setTz';
export { setMirrorOpacity, setMirrorPointerEvents, } from './effects/setMirror';
export { captureStarts } from './effects/captureStarts';
export { easeToTargets } from './effects/easeToTargets';
export { pinToTargets } from './effects/pinToTargets';
// Spatial primitives.
export { kick } from './effects/kick';
export { pop } from './effects/pop';
// World primitives.
export { perlinGlitch } from './effects/perlinGlitch';
// Compound recipes (built on top of atoms via collapsePipelineToEffect).
export { dissolve } from './effects/dissolve';
export { popTo3D } from './effects/popTo3D';
// Recipe builder — exported so user-defined recipes can use it too.
export { collapsePipelineToEffect } from './effects/_recipe';
// ─── Default choreography ──────────────────────────────────────────────────
export { defaultChoreography } from './defaults';
export { applyDefaultChoreography } from './apply';
