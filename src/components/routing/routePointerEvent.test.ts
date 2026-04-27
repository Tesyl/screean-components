import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNodeIds, node, rect, scene } from 'screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../../testing/offscreenCanvasStub';
import { __resetComponentIds } from '../component';
import { button } from '../factories/button';
import { routePointerEvent } from './routePointerEvent';

beforeAll(installOffscreenCanvasStub);
afterAll(uninstallOffscreenCanvasStub);
beforeEach(() => {
  __resetNodeIds();
  __resetComponentIds();
});

describe('routePointerEvent — hit-test → handler dispatch', () => {
  it('fires onClick when world point is inside a component', () => {
    const onClick = vi.fn();
    const btn = button({
      label: 'Go',
      onClick,
      width: 100,
      height: 40,
      radius: 0,
    });
    const s = scene({ particleCount: 10 }, btn);
    s.tick(0);
    const fired = routePointerEvent(s, 'click', [50, 20]);
    expect(fired).toBe(true);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('returns false (and does not throw) on empty space', () => {
    const onClick = vi.fn();
    const btn = button({ label: 'X', onClick, width: 50, height: 50, radius: 0 });
    const s = scene({ particleCount: 10 }, btn);
    s.tick(0);
    const fired = routePointerEvent(s, 'click', [500, 500]);
    expect(fired).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('passes world-space coords on the event object', () => {
    const handler = vi.fn();
    const btn = button({
      label: 'Y',
      onClick: handler,
      width: 100,
      height: 40,
      radius: 0,
    });
    const s = scene({ particleCount: 10 }, btn);
    s.tick(0);
    routePointerEvent(s, 'click', [30, 10], [130, 110]);
    const e = handler.mock.calls[0][0];
    expect(e.type).toBe('click');
    expect(e.x).toBe(30);
    expect(e.y).toBe(10);
    expect(e.world).toEqual([30, 10]);
    expect(e.screen).toEqual([130, 110]);
    expect(e.component).toBe(btn);
  });

  it('defaults screen to world when not supplied (identity camera case)', () => {
    const handler = vi.fn();
    const btn = button({
      label: 'Y',
      onClick: handler,
      width: 100,
      height: 40,
      radius: 0,
    });
    const s = scene({ particleCount: 10 }, btn);
    s.tick(0);
    routePointerEvent(s, 'click', [30, 10]);
    const e = handler.mock.calls[0][0];
    expect(e.screen).toEqual([30, 10]);
  });

  it('routes a hit on a child leaf up to its component ancestor', () => {
    // Click near the center of the button — falls on text or rect; either
    // way the handler fires.
    const handler = vi.fn();
    const btn = button({
      label: 'Click me',
      onClick: handler,
      width: 200,
      height: 60,
      radius: 0,
    });
    const s = scene({ particleCount: 10 }, btn);
    s.tick(0);
    routePointerEvent(s, 'click', [100, 30]);
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('skips disabled components silently (returns false)', () => {
    const onClick = vi.fn();
    const btn = button({
      label: 'No',
      onClick,
      width: 100,
      height: 40,
      radius: 0,
      disabled: true,
    });
    const s = scene({ particleCount: 10 }, btn);
    s.tick(0);
    const fired = routePointerEvent(s, 'click', [50, 20]);
    expect(fired).toBe(false);
    expect(onClick).not.toHaveBeenCalled();
  });

  it('returns false when the hit leaf has no component ancestor', () => {
    // A plain rect node — no component() wrap. hitTest finds it, but there's
    // nothing to dispatch to.
    const leaf = node(rect({ w: 50, h: 50, radius: 0 }));
    const s = scene({ particleCount: 5 }, leaf);
    s.tick(0);
    expect(routePointerEvent(s, 'click', [25, 25])).toBe(false);
  });

  it('ignores event types with no matching handler (returns false)', () => {
    const onClick = vi.fn();
    const btn = button({
      label: 'Z',
      onClick,
      width: 100,
      height: 40,
      radius: 0,
    });
    const s = scene({ particleCount: 5 }, btn);
    s.tick(0);
    // pointermove has no handler today — routing should return false, not throw.
    expect(routePointerEvent(s, 'pointermove', [50, 20])).toBe(false);
  });

  it('under multiple overlapping components, the higher-z button wins', () => {
    // Two buttons at the same location with different z. The higher-z one
    // should be the one whose onClick fires.
    const onA = vi.fn();
    const onB = vi.fn();
    const a = button({
      label: 'A',
      onClick: onA,
      width: 100,
      height: 40,
      radius: 0,
      z: 0,
    });
    const b = button({
      label: 'B',
      onClick: onB,
      width: 100,
      height: 40,
      radius: 0,
      z: 5,
    });
    // Stack them under a plain container so both sit at world (0..100, 0..40).
    const root = node(null);
    root.children.push(a, b);
    a.parent = root;
    b.parent = root;
    const s = scene({ particleCount: 10 }, root);
    s.tick(0);
    routePointerEvent(s, 'click', [50, 20]);
    expect(onB).toHaveBeenCalledTimes(1);
    expect(onA).not.toHaveBeenCalled();
  });
});
