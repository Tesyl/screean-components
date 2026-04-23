import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNodeIds, node, rect, scene } from 'screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../testing/offscreenCanvasStub';
import { __resetComponentIds, component } from './component';
import { createFocusTracker, type FocusTracker } from './focusTracker';
import {
  routeKeyboardEvent,
  type RoutableKeyboardEvent,
} from './routeKeyboardEvent';

beforeAll(installOffscreenCanvasStub);
afterAll(uninstallOffscreenCanvasStub);
beforeEach(() => {
  __resetNodeIds();
  __resetComponentIds();
});

// Shorthand for building minimum-viable event objects.
const key = (
  k: string,
  mods: Partial<{ alt: boolean; ctrl: boolean; meta: boolean; shift: boolean }> = {},
): RoutableKeyboardEvent => ({
  key: k,
  altKey: mods.alt ?? false,
  ctrlKey: mods.ctrl ?? false,
  metaKey: mods.meta ?? false,
  shiftKey: mods.shift ?? false,
});

const setup = () => {
  const onClick = vi.fn();
  const btn = component(node(rect({ w: 100, h: 40, radius: 0 })), {
    id: 'b', ariaRole: 'button', onClick,
  });
  const s = scene({ particleCount: 1 }, btn);
  s.tick(0);
  const tracker = createFocusTracker();
  return { btn, onClick, tracker };
};

describe('routeKeyboardEvent', () => {
  it('fires onClick on Enter when a component is focused', () => {
    const { btn, onClick, tracker } = setup();
    tracker.setFocus(btn);
    const fired = routeKeyboardEvent(tracker, key('Enter'));
    expect(fired).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('fires onClick on Space when a component is focused', () => {
    const { btn, onClick, tracker } = setup();
    tracker.setFocus(btn);
    expect(routeKeyboardEvent(tracker, key(' '))).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('returns false and fires nothing when no component is focused', () => {
    const { onClick, tracker } = setup();
    // Focus intentionally not set.
    expect(routeKeyboardEvent(tracker, key('Enter'))).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('returns false for non-activation keys', () => {
    const { btn, onClick, tracker } = setup();
    tracker.setFocus(btn);
    for (const k of ['a', 'Tab', 'ArrowRight', 'Escape']) {
      expect(routeKeyboardEvent(tracker, key(k))).toBe(false);
    }
    expect(onClick).not.toHaveBeenCalled();
  });

  it('ignores Enter/Space when a modifier is held (lets browser shortcuts win)', () => {
    const { btn, onClick, tracker } = setup();
    tracker.setFocus(btn);
    expect(routeKeyboardEvent(tracker, key('Enter', { meta: true }))).toBe(false);
    expect(routeKeyboardEvent(tracker, key('Enter', { ctrl: true }))).toBe(false);
    expect(routeKeyboardEvent(tracker, key(' ', { alt: true }))).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('shift+Enter still activates (shift is not a shortcut modifier)', () => {
    const { btn, onClick, tracker } = setup();
    tracker.setFocus(btn);
    expect(routeKeyboardEvent(tracker, key('Enter', { shift: true }))).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('silently skips disabled focused component (defense in depth)', () => {
    // Focus tracker refuses to focus disabled components, but routeKeyboardEvent
    // has its own guard. Build a hand-rolled tracker that exposes a disabled
    // component as focused to verify the router's independent check.
    const onClick = vi.fn();
    const btn = component(node(rect({ w: 100, h: 40, radius: 0 })), {
      id: 'b', ariaRole: 'button', disabled: true, onClick,
    });
    const s = scene({ particleCount: 1 }, btn);
    s.tick(0);
    const fakeTracker: FocusTracker = {
      focused: btn,
      setFocus: () => {},
      onFocusChange: () => () => {},
    };
    expect(routeKeyboardEvent(fakeTracker, key('Enter'))).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('returns false if focused component has no onClick', () => {
    const btn = component(node(rect({ w: 100, h: 40, radius: 0 })), {
      id: 'label', ariaRole: 'text',
      // no onClick
    });
    const s = scene({ particleCount: 1 }, btn);
    s.tick(0);
    const tracker = createFocusTracker();
    tracker.setFocus(btn);
    expect(routeKeyboardEvent(tracker, key('Enter'))).toBe(false);
  });

  it('event passed to handler has type:click and a component reference', () => {
    const onClick = vi.fn();
    const btn = component(node(rect({ w: 100, h: 40, radius: 0 })), {
      id: 'b', ariaRole: 'button', onClick,
    });
    const s = scene({ particleCount: 1 }, btn);
    s.tick(0);
    const tracker = createFocusTracker();
    tracker.setFocus(btn);
    routeKeyboardEvent(tracker, key('Enter'));
    const e = onClick.mock.calls[0][0];
    expect(e.type).toBe('click');
    expect(e.component).toBe(btn);
    // Keyboard activation has no screen/world coords — NaN is the sentinel.
    expect(Number.isNaN(e.x)).toBe(true);
    expect(Number.isNaN(e.y)).toBe(true);
  });
});
