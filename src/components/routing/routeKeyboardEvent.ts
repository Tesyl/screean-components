// Keyboard event router — counterpart to routePointerEvent.
//
// Given a KeyboardEvent-like object and a focused component, fires the
// component's onClick when the user activates it via Enter or Space
// (the web-standard button activation contract).
//
// Scope v1: activation only. Later: arrow-key navigation inside slider,
// Tab cycle, Escape for dismissable dialogs — all layer on top of this
// by subscribing to the same KeyboardEvent → component dispatch.
//
// Returns true iff the handler fired, so the consumer can conditionally
// preventDefault() or stopPropagation() on the native event.

import type { FocusTracker } from './focusTracker';
import type { ComponentEvent } from '../types';

export type RoutableKeyboardEvent = {
  // Just the subset we need — duck-typed so Node tests don't need jsdom.
  readonly key: string;
  readonly altKey: boolean;
  readonly ctrlKey: boolean;
  readonly metaKey: boolean;
  readonly shiftKey: boolean;
};

export const routeKeyboardEvent = (
  tracker: FocusTracker,
  event: RoutableKeyboardEvent,
): boolean => {
  // Modifier-held keys go to browser shortcuts (Cmd+K, Ctrl+R etc.), not
  // button activation. Match native `<button>` behavior.
  if (event.altKey || event.ctrlKey || event.metaKey) return false;

  const component = tracker.focused;
  if (!component) return false;
  if (component._component.disabled) return false;

  // Activation keys: Enter (all roles) and Space (button-like roles).
  // The Space mapping matches HTML's `<button>` and `<input type=checkbox>`
  // conventions; for role:'link' only Enter activates, which we can
  // refine once link components exist.
  const isActivator = event.key === 'Enter' || event.key === ' ';
  if (!isActivator) return false;

  const handler = component._component.handlers.onClick;
  if (!handler) return false;

  // Synthesize a ComponentEvent. world/screen coords are not meaningful
  // for keyboard activation — use NaN so consumers can detect the
  // keyboard path if they care. The `component` field carries the full
  // context for handlers that need it.
  const event_: ComponentEvent = {
    type: 'click',
    x: Number.NaN,
    y: Number.NaN,
    world: [Number.NaN, Number.NaN],
    screen: [Number.NaN, Number.NaN],
    get local() {
      return [Number.NaN, Number.NaN] as const;
    },
    component,
  };
  handler(event_);
  return true;
};
