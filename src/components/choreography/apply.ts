// applyDefaultChoreography — installs registry-defined triggers on a
// component, with optional per-instance overrides.
//
// Resolution: per-event override > registry > nothing.
// Returns a single disposer that cleans up every installed trigger via the
// runner's LIFO unwind, restoring the component's handlers to pre-install
// state.

import type { ChoreoRunner, TriggerHandle } from './runner';
import type { ChoreoMap, StatePair } from './defaults';
import { defaultChoreography } from './defaults';
import type { Component, ComponentHandlers } from '../types';
import type { Pipeline } from './pipeline';
import { onEvent, onState } from './trigger';

// Predicate factory for state-trigger keys. State sources:
//   whilePressed / whileChecked  — read from component internals (always available)
//   whileDragging                — read from component internals (slider flips on pointerdown/up)
//   whileHovered                 — read from runner.getDeps().pointerTracker (opt-in)
//   whileFocused                 — read from runner.getDeps().focusTracker (opt-in)
//
// Predicates fall back to `() => false` when their source isn't wired up
// — the runner still polls each tick but the predicate never flips, so
// `onState` never fires. No errors, no surprises.
const predicateForStateKey = (
  runner: ChoreoRunner,
  c: Component,
  stateKey: string,
): (() => boolean) => {
  switch (stateKey) {
    case 'whilePressed':
      return () => Boolean(c._component.pressed);
    case 'whileChecked':
      return () => Boolean(c._component.checked);
    case 'whileDragging':
      return () => Boolean(c._component.dragging);
    case 'whileHovered':
      return () => runner.getDeps().pointerTracker?.hovered === c;
    case 'whileFocused':
      return () => runner.getDeps().focusTracker?.focused === c;
    default:
      return () => false;
  }
};

// Walks the component's role registry merged with `override`, installs an
// onEvent or onState trigger per entry, and returns a single disposer that
// fires every installed trigger's dispose() in registration order. The
// runner enforces LIFO disposal so chained handler wrappers unwind cleanly.
export const applyDefaultChoreography = (
  runner: ChoreoRunner,
  c: Component,
  override?: ChoreoMap,
): TriggerHandle => {
  const fromRegistry = defaultChoreography[c._component.role] ?? {};
  // Per-event override: opt's entry wins; absence falls back to registry.
  const merged: ChoreoMap = { ...fromRegistry, ...(override ?? {}) };

  const handles: TriggerHandle[] = [];
  for (const [key, value] of Object.entries(merged)) {
    if (key.startsWith('while')) {
      const paired = value as StatePair;
      const predicate = predicateForStateKey(runner, c, key);
      handles.push(onState(runner, c, predicate, paired));
    } else {
      handles.push(onEvent(runner, c, key as keyof ComponentHandlers, value as Pipeline));
    }
  }

  return {
    dispose: () => {
      // Local LIFO. Runner-level dispose also unwinds LIFO globally.
      for (let i = handles.length - 1; i >= 0; i--) handles[i].dispose();
    },
  };
};
