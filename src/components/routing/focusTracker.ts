// Focus tracker — which component is "focused" for keyboard input purposes.
//
// Minimal v1 semantics:
//   - setFocus(component | null) explicitly focuses a component (or clears focus).
//   - focused getter returns the currently-focused component, or null.
//   - onFocusChange listener fires when focus actually changes (not on
//     idempotent setFocus-to-same).
//
// Deliberately separate from the pointer tracker so a single app can have
// both (e.g. pointer hovers one button while keyboard focus sits on
// another). Consumer is responsible for deciding WHEN focus moves —
// typical wiring: pointerdown on a component calls setFocus(that
// component).
//
// Tab-order cycle, arrow-key lists, DOM-mirrored `tabindex` bridging etc.
// all build on top of this primitive. Not shipped yet; keeping v1 scope
// to "something has focus, handlers can react."

import type { Component } from '../types';

export type FocusTracker = {
  readonly focused: Component | null;
  // Move focus. No-op if passed the already-focused component. Pass null
  // to clear. Fires onFocusChange listeners iff focus actually changed.
  setFocus: (component: Component | null) => void;
  // Subscribe to focus changes. Returns an unsubscribe function. Listeners
  // fire after the focus state has updated, so `tracker.focused` inside
  // the callback reads the NEW value.
  onFocusChange: (listener: (focused: Component | null) => void) => () => void;
};

export const createFocusTracker = (): FocusTracker => {
  let focused: Component | null = null;
  const listeners = new Set<(focused: Component | null) => void>();

  const setFocus: FocusTracker['setFocus'] = (component) => {
    if (component === focused) return;
    // Disabled components can't receive focus — matches every native-DOM
    // focus semantic and keeps routePointerEvent/keyboard paths consistent.
    if (component && component._component.disabled) return;
    focused = component;
    for (const l of listeners) l(focused);
  };

  const onFocusChange: FocusTracker['onFocusChange'] = (listener) => {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  };

  return {
    get focused(): Component | null {
      return focused;
    },
    setFocus,
    onFocusChange,
  };
};
