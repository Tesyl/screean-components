// Triggers — wire pipelines to real event sources. Two flavors:
//
//   onEvent   — fires a pipeline once per event. Wraps the component's
//               existing handler so the consumer's business logic still runs.
//               Multiple onEvents on the same key chain (don't reject).
//
//   onState   — paired enter/exit pipelines synchronized to a boolean
//               predicate. The runner samples the predicate each tick;
//               on transition, the corresponding pipeline runs.
//
// Both register with the runner so dispose() unwinds them wholesale.
//
// Implementation note: `_component` and its `handlers` are deep-frozen for
// safety. We can't mutate the bag in place, but we CAN reassign `_component`
// itself on the SceneNode — the SceneNode reference is unfrozen and routing
// reads `c._component.handlers.x` fresh each dispatch. So we build a new
// frozen `_component` with one wrapped handler and swap the reference.

import type { Handler, Component, ComponentHandlers, ComponentInternals } from '../types';
import type { ChoreoRunner, TriggerHandle } from './runner';
import type { Pipeline } from './pipeline';
import { groupOfComponent } from './group';

const swapInternals = (
  c: Component,
  newHandlers: ComponentInternals['handlers'],
): void => {
  const next: ComponentInternals = Object.freeze({
    ...c._component,
    handlers: newHandlers,
  });
  c._component = next;
};

const withHandler = (
  base: ComponentInternals['handlers'],
  eventName: keyof ComponentHandlers,
  handler: Handler | undefined,
): ComponentInternals['handlers'] =>
  Object.freeze({ ...base, [eventName]: handler });

// Wrap the component's existing handler for `eventName` so any incoming event
// fires both the original AND the pipeline. Dispose restores the original.
//
// Stacking: two onEvents on the same (component, key) chain naturally — each
// wrap replaces the previous internals with a new frozen version. Disposal
// works cleanly in LIFO order (newest first) — runner.dispose() guarantees
// this. Disposing out-of-order leaves earlier wrappers active until the most
// recent wrapper is also disposed.
export const onEvent = (
  runner: ChoreoRunner,
  c: Component,
  eventName: keyof ComponentHandlers,
  pipeline: Pipeline,
): TriggerHandle => {
  const original = c._component.handlers[eventName];
  const internalsBeforeWrap = c._component;

  const wrapped: Handler = (e) => {
    if (original) original(e);
    runner.run(pipeline, groupOfComponent(c), c);
  };

  swapInternals(c, withHandler(c._component.handlers, eventName, wrapped));

  const handle: TriggerHandle = {
    dispose: () => {
      // Only restore if we're still the topmost wrapper for this key —
      // otherwise a later wrap is on top and ITS dispose will pick up
      // when it unwinds.
      if (c._component.handlers[eventName] === wrapped) {
        c._component = internalsBeforeWrap;
      }
    },
  };
  runner.attachTrigger(handle);
  return handle;
};

// State trigger. Predicate is sampled per runner.tick; transitions fire the
// matching pipeline. No fire on initial sample — only on transition. Both
// pipelines run against groupOfComponent(c).
export const onState = (
  runner: ChoreoRunner,
  c: Component,
  predicate: () => boolean,
  paired: { enter: Pipeline; exit: Pipeline },
): TriggerHandle => {
  let last = predicate();

  const handle: TriggerHandle = {
    dispose: () => {
      // No state to restore; the polling hook is removed by the runner's
      // trigger registry on dispose.
    },
    pollState: (_now) => {
      const current = predicate();
      if (current === last) return;
      const pipeline = current ? paired.enter : paired.exit;
      runner.run(pipeline, groupOfComponent(c), c);
      last = current;
    },
  };
  runner.attachTrigger(handle);
  return handle;
};
