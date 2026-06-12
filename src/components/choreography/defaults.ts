// Default choreography registry — the (role, eventName) → pipeline map
// that gives every component a "right-feeling" baseline motion. Consumers
// opt in via applyDefaultChoreography(c).
//
// Per-event overrides at the call site beat registry entries; missing
// registry keys are silently no-op (the resolver treats undefined and an
// empty pipe() as equivalent).

import type { AriaRole } from '../types';
import type { Pipeline } from './pipeline';
import { pipe } from './pipeline';
import { pop } from './effects/pop';
import { narrow } from './combinators';

// State-trigger keys are conventionally "while<Capitalized>". The resolver
// inspects keys for this prefix and routes them to onState; everything else
// goes to onEvent.
export type StatePair = { enter: Pipeline; exit: Pipeline };
export type ChoreoMap = Record<string, Pipeline | StatePair>;

// Top-level: only roles with canonical motion get entries. Roles not listed
// (text, link, heading, none, img, textbox) opt out of the system's defaults.
export const defaultChoreography: Partial<Record<AriaRole, ChoreoMap>> = {
  // Component DISSOLVES are no longer a choreography concern — they live in
  // the transition core (src/components/transition, Decision point 4). The
  // button default is the pop accent only.
  button: {
    onClick: pipe(pop({ intensity: 0.4 })),
  },
  switch: {
    onChange: pipe(narrow('knob', pop({ intensity: 0.6 }))),
  },
  slider: {
    onChange: pipe(narrow('thumb', pop({ intensity: 0.2 }))),
    // whileDragging: { enter, exit } would set/clear thumb trails, but slider
    // drag tracking is blocked on P14 — entry omitted from v1 so the runner
    // doesn't poll a predicate that always returns false. Re-add when the
    // dragging axis lands on ComponentInternals.
  },
  checkbox: {
    onChange: pipe(narrow('check', pop({ intensity: 0.5 }))),
  },
  radio: {
    onChange: pipe(narrow('dot', pop({ intensity: 0.5 }))),
  },
};
