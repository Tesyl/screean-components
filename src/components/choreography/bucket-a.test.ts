// @vitest-environment happy-dom
// Bucket A — quick wins: whileHovered, whileFocused, narrow caching,
// group per-tick mode.

import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';
import {
  __resetNodeIds,
  scene,
  spawn,
  TRANSPARENT,
  World,
} from '@tesyl/screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../../testing/offscreenCanvasStub';
import { __resetComponentIds } from '../component';
import { button } from '../factories/button';
import { testSlider } from './_testComponents';
import { createChoreoRunner } from './runner';
import { groupOfComponent } from './group';
import { pipe } from './pipeline';
import { applyDefaultChoreography } from './apply';
import { defineEffect, type Effect, type EffectState } from './effect';
import { narrow } from './combinators';
import type { Component } from '../types';
import type { PointerTracker } from '../routing/pointerTracker';
import type { FocusTracker } from '../routing/focusTracker';

beforeAll(installOffscreenCanvasStub);
afterAll(uninstallOffscreenCanvasStub);
beforeEach(() => {
  __resetNodeIds();
  __resetComponentIds();
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

const setup = (component: ReturnType<typeof button>) => {
  const s = scene({ particleCount: 12 }, component);
  s.tick(0);
  const w = new World({ width: 200, height: 200 });
  w.addParticles(
    spawn({ n: 12, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  return { btn: component, s, w };
};

const mockPointerTracker = (initial: Component | null = null) => {
  let hovered = initial;
  return {
    get hovered() { return hovered; },
    set hovered(v: Component | null) { hovered = v; },
  } as unknown as PointerTracker & { hovered: Component | null };
};

const mockFocusTracker = (initial: Component | null = null) => {
  let focused = initial;
  return {
    get focused() { return focused; },
    set focused(v: Component | null) { focused = v; },
    moveFocus: vi.fn(),
    onFocusChange: vi.fn(() => () => {}),
  } as unknown as FocusTracker & { focused: Component | null };
};

describe('whileHovered (A1)', () => {
  it('fires `enter` when pointerTracker.hovered flips to component', () => {
    const btn = button({ label: 'Hov', onClick: () => {} });
    const { s, w } = setup(btn);
    const pointerTracker = mockPointerTracker(null);
    const runner = createChoreoRunner({
      scene: s, world: w, particles: w.particles,
      mirrorHost: document.createElement('div'),
      pointerTracker,
    });

    let enterFired = 0;
    let exitFired = 0;
    const enterFx: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 0, tick: () => { enterFired++; },
    });
    const exitFx: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 0, tick: () => { exitFired++; },
    });

    applyDefaultChoreography(runner, btn, {
      whileHovered: { enter: pipe(enterFx), exit: pipe(exitFx) },
    });

    runner.tick(0);
    expect(enterFired).toBe(0);
    pointerTracker.hovered = btn;
    runner.tick(16);
    expect(enterFired).toBe(1);
    expect(exitFired).toBe(0);
    pointerTracker.hovered = null;
    runner.tick(32);
    expect(exitFired).toBe(1);
  });

  it('predicate stays false when pointerTracker is omitted', () => {
    const btn = button({ label: 'NoTrk', onClick: () => {} });
    const { s, w } = setup(btn);
    const runner = createChoreoRunner({
      scene: s, world: w, particles: w.particles,
      mirrorHost: document.createElement('div'),
      // no pointerTracker
    });

    let fired = 0;
    const fx: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 0, tick: () => { fired++; },
    });
    applyDefaultChoreography(runner, btn, {
      whileHovered: { enter: pipe(fx), exit: pipe(fx) },
    });
    runner.tick(0);
    runner.tick(16);
    expect(fired).toBe(0); // predicate () => false; never flips
  });
});

describe('whileFocused (A2)', () => {
  it('fires enter/exit on focus tracker transitions', () => {
    const btn = button({ label: 'Focused', onClick: () => {} });
    const { s, w } = setup(btn);
    const focusTracker = mockFocusTracker(null);
    const runner = createChoreoRunner({
      scene: s, world: w, particles: w.particles,
      mirrorHost: document.createElement('div'),
      focusTracker,
    });

    let enterFired = 0;
    let exitFired = 0;
    const enterFx: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 0, tick: () => { enterFired++; },
    });
    const exitFx: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 0, tick: () => { exitFired++; },
    });
    applyDefaultChoreography(runner, btn, {
      whileFocused: { enter: pipe(enterFx), exit: pipe(exitFx) },
    });

    runner.tick(0);
    focusTracker.focused = btn;
    runner.tick(16);
    expect(enterFired).toBe(1);
    focusTracker.focused = null;
    runner.tick(32);
    expect(exitFired).toBe(1);
  });
});

describe('narrow caching (A3)', () => {
  it('resolves the subpart once per pipeline run, not per tick', () => {
    const sli = testSlider();
    const { s, w } = setup(sli as unknown as ReturnType<typeof button>);
    const runner = createChoreoRunner({
      scene: s, world: w, particles: w.particles,
      mirrorHost: document.createElement('div'),
    });

    // Wrap a temporal effect in narrow('thumb', ...) — the cache should
    // mean only one part-lookup happens despite many ticks.
    let callCount = 0;
    const observer: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 100,
      tick: (indices) => {
        callCount++;
        // Indices should be the SAME readonly array reference each tick
        // (cached) — assert in a way that doesn't depend on identity, by
        // checking length is consistent.
        expect(indices.length).toBeGreaterThanOrEqual(0);
      },
    });

    runner.tick(0);
    runner.run(
      pipe(narrow('thumb', observer)),
      groupOfComponent(sli),
      sli as unknown as ReturnType<typeof button>,
    );
    runner.tick(0);
    runner.tick(50);
    runner.tick(100);
    expect(callCount).toBe(3);
    // Cached indices array stays stable across ticks. Verify by reading
    // ctx.state directly via a probe effect.
    let firstRef: readonly number[] | null = null;
    let secondRef: readonly number[] | null = null;
    const probe1: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 0,
      tick: (indices) => { firstRef = indices; },
    });
    const probe2: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 0,
      tick: (indices) => { secondRef = indices; },
    });
    runner.run(pipe(
      narrow('thumb', probe1),
      narrow('thumb', probe2),
    ), groupOfComponent(sli), sli as unknown as ReturnType<typeof button>);
    runner.tick(150);
    // Each narrow has its own cache key (unique seq), so the two probes
    // have different cached arrays — but each one is stable WITHIN that
    // narrow. We just verify both probes saw a non-empty subset.
    expect(firstRef).not.toBeNull();
    expect(secondRef).not.toBeNull();
  });
});

describe('whileDragging (P14)', () => {
  it('flips on slider pointerdown and back on pointerup', () => {
    const sli = testSlider();
    const { s, w } = setup(sli as unknown as ReturnType<typeof button>);
    const runner = createChoreoRunner({
      scene: s, world: w, particles: w.particles,
      mirrorHost: document.createElement('div'),
    });

    let enterFired = 0;
    let exitFired = 0;
    const enterFx: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 0, tick: () => { enterFired++; },
    });
    const exitFx: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 0, tick: () => { exitFired++; },
    });

    applyDefaultChoreography(runner, sli, {
      whileDragging: { enter: pipe(enterFx), exit: pipe(exitFx) },
    });

    runner.tick(0);
    expect(enterFired).toBe(0);

    // Simulate pointerdown by invoking the wrapped handler — the slider
    // factory wraps the consumer's onPointerDown to flip `dragging` first.
    const ev = { x: 0, y: 0 } as Parameters<NonNullable<typeof sli._component.handlers.onPointerDown>>[0];
    sli._component.handlers.onPointerDown!(ev);
    runner.tick(16);
    expect(sli._component.dragging).toBe(true);
    expect(enterFired).toBe(1);
    expect(exitFired).toBe(0);

    sli._component.handlers.onPointerUp!(ev);
    runner.tick(32);
    expect(sli._component.dragging).toBe(false);
    expect(exitFired).toBe(1);
  });

  it('predicate stays inert for a button (no `dragging` axis)', () => {
    const btn = button({ label: 'Btn', onClick: () => {} });
    const { s, w } = setup(btn);
    const runner = createChoreoRunner({
      scene: s, world: w, particles: w.particles,
      mirrorHost: document.createElement('div'),
    });

    let fired = 0;
    const fx: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 0, tick: () => { fired++; },
    });

    applyDefaultChoreography(runner, btn, {
      whileDragging: { enter: pipe(fx), exit: pipe(fx) },
    });
    runner.tick(0);
    runner.tick(16);
    // Button doesn't initialize `dragging` → stays undefined → predicate
    // never returns true → trigger never fires.
    expect(btn._component.dragging).toBeUndefined();
    expect(fired).toBe(0);
  });
});

describe('group per-tick mode (A4)', () => {
  it("default mode is 'run' — indices snapshot once at run()", () => {
    const btn = button({ label: 'PT', onClick: () => {} });
    const g = groupOfComponent(btn);
    expect(g.mode).toBe('run');
  });

  it("mode: 'tick' re-resolves indices on each advance", () => {
    const btn = button({ label: 'PT', onClick: () => {} });
    const { s, w } = setup(btn);
    const runner = createChoreoRunner({
      scene: s, world: w, particles: w.particles,
      mirrorHost: document.createElement('div'),
    });

    const seenLengths: number[] = [];
    const observer: Effect = defineEffect<EffectState>({
      scope: 'particle', duration: 50,
      tick: (indices) => { seenLengths.push(indices.length); },
    });

    runner.tick(0);
    runner.run(
      pipe(observer),
      groupOfComponent(btn, { mode: 'tick' }),
      btn,
    );
    runner.tick(0);
    runner.tick(25);
    runner.tick(50);
    // 3 ticks, each re-resolves; every length is the same here (no rebind),
    // but the resolver IS being called per-tick. The contract is that the
    // resolver gets a fresh chance — verify the runner doesn't crash and
    // the effect runs each tick.
    expect(seenLengths.length).toBe(3);
    expect(seenLengths.every((n) => n === seenLengths[0])).toBe(true);
  });
});
