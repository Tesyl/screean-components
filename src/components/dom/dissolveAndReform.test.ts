// @vitest-environment happy-dom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNodeIds, easing, node, rect, scene, stack } from 'screean';
import type { Particle, Scene } from 'screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../../testing/offscreenCanvasStub';
import { button } from '../factories/button';
import { __resetComponentIds, component } from '../component';
import { createDomMirror } from './domMirror';
import { createDissolve } from './dissolveAndReform';
import type { Component } from '../types';

beforeAll(installOffscreenCanvasStub);
afterAll(uninstallOffscreenCanvasStub);
beforeEach(() => {
  __resetNodeIds();
  __resetComponentIds();
  document.body.innerHTML = '';
});

// ---------------------------------------------------------------------------
// Fixtures
//
// Build a tiny scene with one button, wire up the mirror, and synthesize a
// small pool of particles whose indices we can feed back through
// scene.indicesForSubtree. We don't run the whole screean world here; we
// just need particles that have `tx, ty` set and a Scene that reports their
// indices for the subtree.

type Fixture = {
  btn: Component;
  s: Scene;
  particles: Particle[];
  host: HTMLElement;
  mirrorDiv: HTMLDivElement;
  btnIndices: number[];
  cleanup: () => void;
};

const makeFixture = (opts?: { disabled?: boolean }): Fixture => {
  // --- scene -----------------------------------------------------------
  let btn: Component;
  if (opts?.disabled) {
    const chrome = node(rect({ w: 100, h: 40, radius: 0 }), { z: 0 });
    btn = component(stack([chrome]), {
      ariaRole: 'button',
      ariaLabel: 'Save',
      disabled: true,
      onClick: () => {},
    });
  } else {
    btn = button({
      label: 'Save',
      onClick: () => {},
      width: 100,
      height: 40,
      radius: 0,
    });
  }
  const root = node(null);
  root.children.push(btn);
  btn.parent = root;
  const s = scene({ particleCount: 8 }, root);
  s.tick(0);

  // --- particles -------------------------------------------------------
  // 8 synthetic particles, targets clustered around (50, 20) (the button's
  // intrinsic center given its 100×40 @ origin). Positions scattered so the
  // lerp-to-target has visible work to do.
  const particles: Particle[] = Array.from({ length: 8 }, (_, i) => ({
    x: 200 + i * 5,
    y: 200 + i * 3,
    vx: 10, vy: 10,
    tx: 40 + (i % 4) * 5,
    ty: 15 + Math.floor(i / 4) * 10,
    age: 0, life: 1,
    color: 0 as unknown as Particle['color'],
    fieldId: null, weight: 1,
    z: 0, tz: 0, vz: 0,
  }));
  s.bindAll(particles, { kind: 'bounds-area' });
  const btnIndices = [...s.indicesForSubtree(btn)];

  // --- DOM host + mirror ----------------------------------------------
  const host = document.createElement('div');
  host.style.position = 'relative';
  host.style.width = '800px';
  host.style.height = '600px';
  document.body.appendChild(host);

  const mirror = createDomMirror({ scene: s, host });
  mirror.reconcile();
  const mirrorDiv = host.querySelector<HTMLDivElement>(
    `[data-component-id="${btn._component.id}"]`,
  )!;

  return {
    btn, s, particles, host, mirrorDiv, btnIndices,
    cleanup: () => mirror.dispose(),
  };
};

// ---------------------------------------------------------------------------
// Tests

describe('createDissolve — trigger', () => {
  it('fades mirror opacity to 0 and calls onReveal with subtree indices', () => {
    const fx = makeFixture();
    const onReveal = vi.fn();
    const onHide = vi.fn();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal, onHide,
    });
    d.trigger(fx.btn);
    expect(fx.mirrorDiv.style.opacity).toBe('0');
    expect(fx.mirrorDiv.style.pointerEvents).toBe('none');
    expect(onReveal).toHaveBeenCalledTimes(1);
    const revealedIndices = onReveal.mock.calls[0][0] as readonly number[];
    expect([...revealedIndices].sort()).toEqual([...fx.btnIndices].sort());
    fx.cleanup();
  });

  it('no-ops on disabled components', () => {
    const fx = makeFixture({ disabled: true });
    const onReveal = vi.fn();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal, onHide: vi.fn(),
    });
    d.trigger(fx.btn);
    expect(onReveal).not.toHaveBeenCalled();
    expect(fx.mirrorDiv.style.opacity).toBe('');
    fx.cleanup();
  });

  it('applies a radial burst — particles in the subtree get nonzero velocity delta', () => {
    const fx = makeFixture();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal: () => {}, onHide: () => {},
      burstKick: 500,
      burstSoftness: 0.1,
    });
    const vBefore = fx.btnIndices.map((i) => ({
      vx: fx.particles[i].vx,
      vy: fx.particles[i].vy,
    }));
    d.trigger(fx.btn);
    // At least one subtree particle should have a measurably different
    // velocity. We don't care about the exact number — happy-dom's
    // getBoundingClientRect returns 0 so center is at origin; the impulse
    // vector depends on particle position relative to 0, which is nonzero.
    const changed = fx.btnIndices.filter((i, idx) =>
      fx.particles[i].vx !== vBefore[idx].vx ||
      fx.particles[i].vy !== vBefore[idx].vy,
    );
    expect(changed.length).toBeGreaterThan(0);
    fx.cleanup();
  });
});

describe('createDissolve — state machine', () => {
  it('advances particles → returning after particlePhaseMs', () => {
    vi.useFakeTimers();
    const fx = makeFixture();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal: () => {}, onHide: () => {},
      particlePhaseMs: 1000,
      returnMs: 500,
      fadeMs: 100,
    });

    // t=0 trigger
    vi.setSystemTime(1_000_000);
    d.trigger(fx.btn, 1_000_000);
    // capture a reference position before returning-phase lerp runs
    const anyIdx = fx.btnIndices[0];
    const xBefore = fx.particles[anyIdx].x;

    // t=999ms: still in particles phase, tick shouldn't lerp
    d.tick(1_000_000 + 999);
    expect(fx.particles[anyIdx].x).toBe(xBefore);

    // t=1001ms: transitions particles → returning. Transition-only frame
    // (no lerp yet, since just got reset).
    d.tick(1_000_000 + 1001);
    expect(fx.particles[anyIdx].x).toBe(xBefore);

    // Next frame: one lerp step. Position should now have moved toward tx.
    d.tick(1_000_000 + 1017);
    expect(fx.particles[anyIdx].x).not.toBe(xBefore);
    vi.useRealTimers();
    fx.cleanup();
  });

  it('sets mirror opacity to 1 at the returning → reforming boundary', () => {
    vi.useFakeTimers();
    const fx = makeFixture();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal: () => {}, onHide: () => {},
      particlePhaseMs: 100,
      returnMs: 100,
      fadeMs: 50,
    });

    d.trigger(fx.btn, 0);
    expect(fx.mirrorDiv.style.opacity).toBe('0');

    // Advance past particles phase into returning
    d.tick(150);   // elapsed 150 > 100: transition to returning (since=150)
    d.tick(260);   // elapsed 110 >= 100: transition to reforming (opacity → '1')
    expect(fx.mirrorDiv.style.opacity).toBe('1');
    expect(fx.mirrorDiv.style.pointerEvents).toBe('auto');
    vi.useRealTimers();
    fx.cleanup();
  });

  it('snaps particles to exact targets at returning → reforming boundary', () => {
    vi.useFakeTimers();
    const fx = makeFixture();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal: () => {}, onHide: () => {},
      particlePhaseMs: 100,
      returnMs: 100,
      fadeMs: 50,
      returnEasing: easing.linear,
    });

    d.trigger(fx.btn, 0);
    d.tick(150);   // → returning
    d.tick(260);   // → reforming (snap)
    for (const i of fx.btnIndices) {
      expect(fx.particles[i].x).toBe(fx.particles[i].tx);
      expect(fx.particles[i].y).toBe(fx.particles[i].ty);
      expect(fx.particles[i].vx).toBe(0);
      expect(fx.particles[i].vy).toBe(0);
    }
    vi.useRealTimers();
    fx.cleanup();
  });

  it('calls onHide after fadeMs and removes the cycle from active', () => {
    vi.useFakeTimers();
    const fx = makeFixture();
    const onHide = vi.fn();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal: () => {}, onHide,
      particlePhaseMs: 100,
      returnMs: 100,
      fadeMs: 50,
    });

    d.trigger(fx.btn, 0);
    d.tick(150);  // → returning
    d.tick(260);  // → reforming (fade starts at t=260)
    expect(onHide).not.toHaveBeenCalled();
    d.tick(350);  // elapsed 90 >= 50: cycle complete
    expect(onHide).toHaveBeenCalledTimes(1);
    expect(onHide.mock.calls[0][0]).toEqual(fx.btnIndices);
    // Further ticks should be no-ops for this cycle (cycle removed).
    onHide.mockClear();
    d.tick(500);
    expect(onHide).not.toHaveBeenCalled();
    vi.useRealTimers();
    fx.cleanup();
  });
});

describe('createDissolve — re-entrancy', () => {
  it('re-triggering during a cycle resets the phase + re-applies burst', () => {
    vi.useFakeTimers();
    const fx = makeFixture();
    const onReveal = vi.fn();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal, onHide: () => {},
      particlePhaseMs: 100, returnMs: 100, fadeMs: 50,
    });

    d.trigger(fx.btn, 0);
    d.tick(150);  // → returning
    // Re-trigger in the middle of returning
    d.trigger(fx.btn, 160);
    expect(onReveal).toHaveBeenCalledTimes(2);
    // Cycle should now be back in particles phase — tick(260) which was
    // meant to take it to reforming on the first cycle should still be in
    // particles on the fresh cycle.
    d.tick(250);   // elapsed 90 < 100, still in particles
    expect(fx.mirrorDiv.style.opacity).toBe('0');
    vi.useRealTimers();
    fx.cleanup();
  });
});

describe('createDissolve — easing', () => {
  // With `easing.linear`, the eased lerp is mathematically trivial:
  // p.x = startX + (tx - startX) * t. We can compute expected positions
  // exactly and compare. This isolates the easing call site without
  // depending on outCubic's specific shape.
  it('linear easing produces exactly proportional progress', () => {
    vi.useFakeTimers();
    const fx = makeFixture();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal: () => {}, onHide: () => {},
      particlePhaseMs: 100,
      returnMs: 1000,  // long return so we can sample mid-curve
      fadeMs: 50,
      returnEasing: easing.linear,
    });

    d.trigger(fx.btn, 0);
    // Stash particle positions just before returning phase begins.
    d.tick(101);   // particles → returning (snapshots starts at since=101)
    const startsX = fx.btnIndices.map((i) => fx.particles[i].x);
    const startsY = fx.btnIndices.map((i) => fx.particles[i].y);

    // Halfway through the return phase: t=0.5, so x should be
    // start + (tx - start) * 0.5 = midpoint between start and target.
    d.tick(101 + 500);
    fx.btnIndices.forEach((i, k) => {
      const p = fx.particles[i];
      expect(p.x).toBeCloseTo(startsX[k] + (p.tx - startsX[k]) * 0.5, 4);
      expect(p.y).toBeCloseTo(startsY[k] + (p.ty - startsY[k]) * 0.5, 4);
    });
    vi.useRealTimers();
    fx.cleanup();
  });

  it('per-trigger easing override wins over instance default', () => {
    vi.useFakeTimers();
    const fx = makeFixture();
    // Instance default is outCubic (nonzero progress at t=0.5),
    // but we override with a curve that always returns 0.
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal: () => {}, onHide: () => {},
      particlePhaseMs: 100,
      returnMs: 1000,
      fadeMs: 50,
      returnEasing: easing.outCubic,
    });

    d.trigger(fx.btn, { now: 0, easing: () => 0 });
    d.tick(101);  // → returning, snapshot starts
    const startsX = fx.btnIndices.map((i) => fx.particles[i].x);

    d.tick(101 + 500);  // halfway through phase
    // With easing(t) === 0, no progress should have been made toward target.
    fx.btnIndices.forEach((i, k) => {
      expect(fx.particles[i].x).toBeCloseTo(startsX[k], 4);
    });
    vi.useRealTimers();
    fx.cleanup();
  });

  it('overshoot easing still anchors to target via end-of-phase snap', () => {
    vi.useFakeTimers();
    const fx = makeFixture();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal: () => {}, onHide: () => {},
      particlePhaseMs: 100,
      returnMs: 100,
      fadeMs: 50,
      returnEasing: easing.outBack,  // overshoots ~10% above 1 mid-curve
    });

    d.trigger(fx.btn, 0);
    d.tick(150);   // → returning
    d.tick(260);   // elapsed >= returnMs → snap + reforming

    // After the snap, every particle is exactly at its target despite
    // overshoot mid-curve.
    for (const i of fx.btnIndices) {
      expect(fx.particles[i].x).toBe(fx.particles[i].tx);
      expect(fx.particles[i].y).toBe(fx.particles[i].ty);
    }
    vi.useRealTimers();
    fx.cleanup();
  });

  it('start positions are captured once and reused across frames', () => {
    // With linear easing, position at any t is `start + (target - start) * t`.
    // If `start` were re-captured each frame (a regression to the old
    // per-frame approach model), each new frame would treat the previous
    // frame's *result* as the start, and the lerp would compound differently.
    // We assert the math is the parametric form — proving start is stable.
    vi.useFakeTimers();
    const fx = makeFixture();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal: () => {}, onHide: () => {},
      particlePhaseMs: 50,
      returnMs: 200,
      fadeMs: 50,
      returnEasing: easing.linear,
    });

    d.trigger(fx.btn, 0);
    d.tick(60);   // particles → returning, capture starts at since=60
    const startsX = fx.btnIndices.map((i) => fx.particles[i].x);
    const startsY = fx.btnIndices.map((i) => fx.particles[i].y);

    // Sample at multiple t values; each must use the same (captured) start.
    for (const elapsedAfterPhase of [40, 100, 160]) {
      d.tick(60 + elapsedAfterPhase);
      const t = elapsedAfterPhase / 200;
      fx.btnIndices.forEach((i, k) => {
        const p = fx.particles[i];
        // If starts were re-captured each frame, this formula wouldn't hold.
        expect(p.x).toBeCloseTo(startsX[k] + (p.tx - startsX[k]) * t, 4);
        expect(p.y).toBeCloseTo(startsY[k] + (p.ty - startsY[k]) * t, 4);
      });
    }
    vi.useRealTimers();
    fx.cleanup();
  });
});

describe('createDissolve — dispose', () => {
  it('restores in-flight mirrors and calls onHide', () => {
    vi.useFakeTimers();
    const fx = makeFixture();
    const onHide = vi.fn();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal: () => {}, onHide,
    });
    d.trigger(fx.btn, 0);
    expect(fx.mirrorDiv.style.opacity).toBe('0');
    d.dispose();
    expect(fx.mirrorDiv.style.opacity).toBe('1');
    expect(fx.mirrorDiv.style.pointerEvents).toBe('auto');
    expect(onHide).toHaveBeenCalledTimes(1);
    // Second dispose is safe.
    expect(() => d.dispose()).not.toThrow();
    vi.useRealTimers();
    fx.cleanup();
  });

  it('trigger() and tick() after dispose are no-ops', () => {
    const fx = makeFixture();
    const onReveal = vi.fn();
    const onHide = vi.fn();
    const d = createDissolve({
      scene: fx.s, particles: fx.particles, mirrorHost: fx.host,
      onReveal, onHide,
    });
    d.dispose();
    d.trigger(fx.btn);
    d.tick(performance.now());
    expect(onReveal).not.toHaveBeenCalled();
    fx.cleanup();
  });
});
