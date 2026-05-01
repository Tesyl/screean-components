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

export type { Effect, EffectCtx } from './effect';
export { makeInstantEffect } from './effect';

export type { Pipeline, PipelineStage } from './pipeline';
export { pipe, at } from './pipeline';

export type { ChoreoRunner, ChoreoRunnerDeps, PipelineHandle, TriggerHandle } from './runner';
export { createChoreoRunner } from './runner';

export { onEvent, onState } from './trigger';
