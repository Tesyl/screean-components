import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNodeIds, node, rect, scene, TRANSPARENT } from 'screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../testing/offscreenCanvasStub';
import { button } from './button';
import { __resetComponentIds, component } from './component';
import {
  createPointerTracker,
  indicesUnderPointer,
} from './pointerTracker';

beforeAll(installOffscreenCanvasStub);
afterAll(uninstallOffscreenCanvasStub);
beforeEach(() => {
  __resetNodeIds();
  __resetComponentIds();
});

// Two non-overlapping buttons used in most of the tests: A at (0..100) × (0..40),
// B at (200..300) × (0..40). Fresh per test since factory closures hold state.
const makeTwoButtons = () => {
  const onEnterA = vi.fn();
  const onLeaveA = vi.fn();
  const onDownA = vi.fn();
  const onUpA = vi.fn();
  const onEnterB = vi.fn();
  const onLeaveB = vi.fn();

  const a = button({
    label: 'A',
    onClick: () => {},
    onPointerEnter: onEnterA,
    onPointerLeave: onLeaveA,
    onPointerDown: onDownA,
    onPointerUp: onUpA,
    width: 100,
    height: 40,
    radius: 0,
  });
  const b = button({
    label: 'B',
    onClick: () => {},
    onPointerEnter: onEnterB,
    onPointerLeave: onLeaveB,
    width: 100,
    height: 40,
    radius: 0,
    z: 0,
  });
  // Place B at x = 200 via node.transform. Parent container so both sit under
  // a shared root (scene.hitTest needs them reachable from the root).
  b.transform.x = 200;
  b.bounds = null; // stale after transform mutation
  const root = node(null);
  root.children.push(a, b);
  a.parent = root;
  b.parent = root;
  const s = scene({ particleCount: 1 }, root);
  s.tick(0);
  return { s, a, b, onEnterA, onLeaveA, onDownA, onUpA, onEnterB, onLeaveB };
};

describe('createPointerTracker — hover lifecycle', () => {
  it('starts with no hovered / pressed component', () => {
    const { s } = makeTwoButtons();
    const t = createPointerTracker(s);
    expect(t.hovered).toBeNull();
    expect(t.pressed).toBeNull();
  });

  it('onPointerMove over a component fires onPointerEnter exactly once', () => {
    const { s, a, onEnterA, onLeaveA } = makeTwoButtons();
    const t = createPointerTracker(s);
    t.onPointerMove([50, 20]);
    expect(onEnterA).toHaveBeenCalledTimes(1);
    expect(onLeaveA).not.toHaveBeenCalled();
    expect(t.hovered).toBe(a);
  });

  it('repeated moves within the same component do NOT re-fire enter', () => {
    const { s, onEnterA } = makeTwoButtons();
    const t = createPointerTracker(s);
    t.onPointerMove([30, 10]);
    t.onPointerMove([60, 30]);
    t.onPointerMove([80, 5]);
    expect(onEnterA).toHaveBeenCalledTimes(1);
  });

  it('moving from A to B fires onPointerLeave(A) then onPointerEnter(B)', () => {
    const { s, a, b, onEnterA, onLeaveA, onEnterB, onLeaveB } = makeTwoButtons();
    const t = createPointerTracker(s);
    t.onPointerMove([50, 20]); // over A
    t.onPointerMove([250, 20]); // over B
    expect(onEnterA).toHaveBeenCalledTimes(1);
    expect(onLeaveA).toHaveBeenCalledTimes(1);
    expect(onEnterB).toHaveBeenCalledTimes(1);
    expect(onLeaveB).not.toHaveBeenCalled();
    // Order matters — leave(A) must fire BEFORE enter(B).
    expect((onLeaveA.mock.invocationCallOrder[0] ?? Infinity))
      .toBeLessThan((onEnterB.mock.invocationCallOrder[0] ?? 0));
    expect(t.hovered).toBe(b);
    void a;
  });

  it('moving from a component to empty space fires leave with no matching enter', () => {
    const { s, onEnterA, onLeaveA } = makeTwoButtons();
    const t = createPointerTracker(s);
    t.onPointerMove([50, 20]); // over A
    t.onPointerMove([500, 500]); // empty space
    expect(onEnterA).toHaveBeenCalledTimes(1);
    expect(onLeaveA).toHaveBeenCalledTimes(1);
    expect(t.hovered).toBeNull();
  });

  it('onPointerLeaveCanvas fires leave on the currently-hovered component and clears state', () => {
    const { s, onEnterA, onLeaveA } = makeTwoButtons();
    const t = createPointerTracker(s);
    t.onPointerMove([50, 20]);
    t.onPointerLeaveCanvas();
    expect(onEnterA).toHaveBeenCalledTimes(1);
    expect(onLeaveA).toHaveBeenCalledTimes(1);
    expect(t.hovered).toBeNull();
  });

  it('reset() clears state without firing any handler', () => {
    const { s, onLeaveA } = makeTwoButtons();
    const t = createPointerTracker(s);
    t.onPointerMove([50, 20]);
    t.reset();
    expect(onLeaveA).not.toHaveBeenCalled();
    expect(t.hovered).toBeNull();
  });

  it('skips disabled components — they never enter hover state', () => {
    const onEnter = vi.fn();
    const btn = button({
      label: 'disabled',
      onClick: () => {},
      onPointerEnter: onEnter,
      disabled: true,
      width: 100,
      height: 40,
      radius: 0,
    });
    const s = scene({ particleCount: 1 }, btn);
    s.tick(0);
    const t = createPointerTracker(s);
    t.onPointerMove([50, 20]);
    expect(onEnter).not.toHaveBeenCalled();
  });
});

describe('createPointerTracker — press lifecycle', () => {
  it('onPointerDown fires on the hovered component and records it as pressed', () => {
    const { s, a, onDownA } = makeTwoButtons();
    const t = createPointerTracker(s);
    t.onPointerMove([50, 20]);
    t.onPointerDown([50, 20]);
    expect(onDownA).toHaveBeenCalledTimes(1);
    expect(t.pressed).toBe(a);
  });

  it('onPointerDown without prior move still resolves hit target (touch / tap path)', () => {
    const { s, a, onEnterA, onDownA } = makeTwoButtons();
    const t = createPointerTracker(s);
    t.onPointerDown([50, 20]);
    expect(onEnterA).toHaveBeenCalledTimes(1);
    expect(onDownA).toHaveBeenCalledTimes(1);
    expect(t.pressed).toBe(a);
  });

  it('onPointerUp fires on whatever is under the pointer (drag-off semantics)', () => {
    const { s, b, onDownA, onUpA } = makeTwoButtons();
    const t = createPointerTracker(s);
    t.onPointerDown([50, 20]); // press on A
    t.onPointerMove([250, 20]); // drag to B
    t.onPointerUp([250, 20]); // release on B
    expect(onDownA).toHaveBeenCalledTimes(1);
    expect(onUpA).not.toHaveBeenCalled(); // A did NOT get an up
    expect(t.pressed).toBeNull();
    void b;
  });

  it('onPointerUp on empty space clears pressed without firing any handler', () => {
    const { s, onUpA } = makeTwoButtons();
    const t = createPointerTracker(s);
    t.onPointerDown([50, 20]);
    t.onPointerUp([500, 500]);
    expect(onUpA).not.toHaveBeenCalled();
    expect(t.pressed).toBeNull();
  });
});

describe('scene.indicesForSubtree + indicesUnderPointer', () => {
  it('indicesForSubtree unions indices across all descendant leaves', () => {
    // A button is a stack wrapping [rect, text]. bindAll distributes particles
    // across leaves; indicesForSubtree should return the union of both.
    const btn = button({
      label: 'Go',
      onClick: () => {},
      width: 100,
      height: 40,
      radius: 0,
    });
    const s = scene({ particleCount: 10 }, btn);
    s.tick(0);
    const particles = Array.from({ length: 10 }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
      age: 0, life: 1, color: TRANSPARENT, fieldId: null, weight: 1, z: 0, tz: 0, vz: 0,
    }));
    s.bindAll(particles, { kind: 'equal' });
    const merged = s.indicesForSubtree(btn);
    const rectLeaf = btn.children[0];
    const textLeaf = btn.children[1];
    const leafIdxSum =
      s.indicesForLeaf(rectLeaf).length + s.indicesForLeaf(textLeaf).length;
    expect(merged).toHaveLength(leafIdxSum);
  });

  it('empty when the subtree has no bound leaves yet', () => {
    const btn = button({
      label: 'X',
      onClick: () => {},
      width: 50,
      height: 50,
      radius: 0,
    });
    const s = scene({ particleCount: 4 }, btn);
    s.tick(0);
    // No bindAll call — nothing's bound yet.
    expect(s.indicesForSubtree(btn)).toEqual([]);
  });

  it('works on plain SceneNodes — components are a specialization, not a requirement', () => {
    const leaf = node(rect({ w: 50, h: 50, radius: 0 }));
    const s = scene({ particleCount: 3 }, leaf);
    s.tick(0);
    const particles = Array.from({ length: 3 }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
      age: 0, life: 1, color: TRANSPARENT, fieldId: null, weight: 1, z: 0, tz: 0, vz: 0,
    }));
    s.bindAll(particles, { kind: 'equal' });
    expect(s.indicesForSubtree(leaf)).toHaveLength(3);
  });

  it('indicesUnderPointer returns empty when nothing is hovered', () => {
    const { s } = makeTwoButtons();
    const t = createPointerTracker(s);
    expect(indicesUnderPointer(s, t)).toEqual([]);
  });

  it('indicesUnderPointer returns the hovered component indices', () => {
    const { s, a } = makeTwoButtons();
    const particles = Array.from({ length: 20 }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
      age: 0, life: 1, color: TRANSPARENT, fieldId: null, weight: 1, z: 0, tz: 0, vz: 0,
    }));
    s.bindAll(particles, { kind: 'equal' });
    const t = createPointerTracker(s);
    t.onPointerMove([50, 20]); // over A
    expect(indicesUnderPointer(s, t)).toEqual(s.indicesForSubtree(a));
  });

  it("indicesUnderPointer with 'pressed' respects press state not hover", () => {
    const { s, a } = makeTwoButtons();
    const particles = Array.from({ length: 20 }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
      age: 0, life: 1, color: TRANSPARENT, fieldId: null, weight: 1, z: 0, tz: 0, vz: 0,
    }));
    s.bindAll(particles, { kind: 'equal' });
    const t = createPointerTracker(s);
    t.onPointerDown([50, 20]); // press on A
    t.onPointerMove([500, 500]); // drag off — hover is now null but pressed stays
    expect(indicesUnderPointer(s, t, 'pressed')).toEqual(s.indicesForSubtree(a));
    expect(indicesUnderPointer(s, t, 'hovered')).toEqual([]);
  });
});

describe('additional handler paths — label / plain component', () => {
  it('label (no interactive handlers) does not receive any hover / press events', () => {
    const leaf = node(rect({ w: 100, h: 40, radius: 0 }));
    const silent = component(leaf, { ariaRole: 'text' });
    const s = scene({ particleCount: 1 }, silent);
    s.tick(0);
    const t = createPointerTracker(s);
    expect(() => {
      t.onPointerMove([50, 20]);
      t.onPointerDown([50, 20]);
      t.onPointerUp([50, 20]);
      t.onPointerLeaveCanvas();
    }).not.toThrow();
  });
});
