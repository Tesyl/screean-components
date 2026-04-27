import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNodeIds, node, rect, scene } from 'screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../../testing/offscreenCanvasStub';
import { __resetComponentIds, component } from '../component';
import { createFocusTracker } from './focusTracker';

beforeAll(installOffscreenCanvasStub);
afterAll(uninstallOffscreenCanvasStub);
beforeEach(() => {
  __resetNodeIds();
  __resetComponentIds();
});

// Minimal setup — two components we can focus between.
const setup = () => {
  const a = component(node(rect({ w: 100, h: 40, radius: 0 })), {
    id: 'a', ariaRole: 'button', onClick: () => {},
  });
  const b = component(node(rect({ w: 100, h: 40, radius: 0 })), {
    id: 'b', ariaRole: 'button', onClick: () => {},
  });
  const root = node(null);
  root.children.push(a, b);
  a.parent = root;
  b.parent = root;
  const s = scene({ particleCount: 1 }, root);
  s.tick(0);
  return { s, a, b };
};

describe('createFocusTracker', () => {
  it('starts with no focused component', () => {
    const t = createFocusTracker();
    expect(t.focused).toBeNull();
  });

  it('setFocus sets the focused component', () => {
    const { a } = setup();
    const t = createFocusTracker();
    t.setFocus(a);
    expect(t.focused).toBe(a);
  });

  it('setFocus(null) clears focus', () => {
    const { a } = setup();
    const t = createFocusTracker();
    t.setFocus(a);
    t.setFocus(null);
    expect(t.focused).toBeNull();
  });

  it('setFocus to the same component is idempotent (no listener notification)', () => {
    const { a } = setup();
    const t = createFocusTracker();
    const fn = vi.fn();
    t.onFocusChange(fn);
    t.setFocus(a);
    t.setFocus(a);
    t.setFocus(a);
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith(a);
  });

  it('onFocusChange fires on each actual change with the new focus', () => {
    const { a, b } = setup();
    const t = createFocusTracker();
    const log: Array<string | null> = [];
    t.onFocusChange((c) => log.push(c ? c._component.id : null));
    t.setFocus(a);
    t.setFocus(b);
    t.setFocus(null);
    t.setFocus(a);
    expect(log).toEqual(['a', 'b', null, 'a']);
  });

  it('onFocusChange returns an unsubscribe function', () => {
    const { a, b } = setup();
    const t = createFocusTracker();
    const fn = vi.fn();
    const unsub = t.onFocusChange(fn);
    t.setFocus(a);
    unsub();
    t.setFocus(b);
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('multiple listeners all fire on change', () => {
    const { a } = setup();
    const t = createFocusTracker();
    const fns = [vi.fn(), vi.fn(), vi.fn()];
    for (const fn of fns) t.onFocusChange(fn);
    t.setFocus(a);
    for (const fn of fns) expect(fn).toHaveBeenCalledWith(a);
  });

  it('refuses to focus a disabled component (and leaves focus unchanged)', () => {
    const disabled = component(node(rect({ w: 10, h: 10, radius: 0 })), {
      id: 'd', disabled: true, onClick: () => {},
    });
    const { a } = setup();
    const t = createFocusTracker();
    t.setFocus(a);
    t.setFocus(disabled);
    expect(t.focused).toBe(a);
  });

  it('focused getter is a live snapshot (no defensive copy needed)', () => {
    const { a, b } = setup();
    const t = createFocusTracker();
    t.setFocus(a);
    expect(t.focused).toBe(a);
    t.setFocus(b);
    expect(t.focused).toBe(b);
  });
});
