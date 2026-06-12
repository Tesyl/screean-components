// @vitest-environment happy-dom
//
// Behavior tests for the transition machine — the four-frame cycle's
// CONTRACT, not its tick boundaries (repo testing guidance: the legacy
// dissolveAndReform tests asserted exact tick numbers and died with it).
//
// Core functionality under test:
//   1. The cycle visits dom → dissolving → particles → returning →
//      reforming → idle, in order, exactly once per transition.
//   2. `returning` is deterministic: velocities zeroed, particles converge
//      on (tx, ty) regardless of starting scatter.
//   3. `reforming` pins particles and fades the into-element 0 → 1; settle
//      restores opacity '1' + pointer-events and empties the pool.
//   4. Physics gating: PHYSICS_ACTIVE says world.tick must not run during
//      returning/reforming (the pointer must not perturb the snap-back).

import { describe, expect, it } from 'vitest';
import { World, spawn, TRANSPARENT } from '@tesyl/screean';
import { applyTransitionFrame, PHYSICS_ACTIVE } from './machine';
import {
  DISSOLVE_HANDOFF_MS,
  FADE_MS,
  RETURN_MS,
} from './constant';
import type { TransitionPhase } from './types';

const TUNING = { particlePhaseMs: 500, fadeMs: 100 };

const makeWorld = (n: number): World => {
  const w = new World({ width: 200, height: 200 });
  w.addParticles(
    spawn({ n, origin: { kind: 'point', x: 100, y: 100 }, color: TRANSPARENT, speed: 0 }),
  );
  // Scatter starts, fixed targets — the cycle must converge on targets.
  for (let i = 0; i < w.particles.length; i++) {
    const p = w.particles[i];
    p.x = Math.random() * 200;
    p.y = Math.random() * 200;
    p.tx = 50 + i;
    p.ty = 60 + i;
    p.vx = 7;
    p.vy = -3;
  }
  return w;
};

const el = (): HTMLElement => document.createElement('div');

// Drive the machine with a synthetic clock until idle (or a step cap).
const runCycle = (
  world: World,
  start: TransitionPhase,
): { visited: string[]; into: HTMLElement } => {
  const into = start.kind === 'idle' ? el() : start.into;
  let phase = start;
  const visited: string[] = [phase.kind];
  let now = 1_000;
  for (let step = 0; step < 10_000 && phase.kind !== 'idle'; step++) {
    now += 16; // synthetic 60fps clock
    const r = applyTransitionFrame(phase, world, now, TUNING);
    if (r.phase.kind !== phase.kind) visited.push(r.phase.kind);
    phase = r.phase;
  }
  return { visited, into };
};

describe('transition machine cycle', () => {
  it('visits every phase in canonical order and settles to idle', () => {
    const world = makeWorld(32);
    const target = el();
    const { visited } = runCycle(world, {
      kind: 'dissolving',
      since: 1_000,
      from: target,
      into: target,
    });
    expect(visited).toEqual(['dissolving', 'particles', 'returning', 'reforming', 'idle']);
  });

  it('idle is a fixed point — no mutation, never settles', () => {
    const world = makeWorld(4);
    const before = world.particles.map((p) => [p.x, p.y]);
    const r = applyTransitionFrame({ kind: 'idle' }, world, 99_999, TUNING);
    expect(r.phase.kind).toBe('idle');
    expect(r.settled).toBe(false);
    expect(world.particles.map((p) => [p.x, p.y])).toEqual(before);
  });

  it('returning converges particles onto their targets with zeroed velocity', () => {
    const world = makeWorld(64);
    const target = el();
    let phase: TransitionPhase = {
      kind: 'returning',
      since: 2_000,
      from: target,
      into: target,
    };
    let now = 2_000;
    while (phase.kind === 'returning') {
      now += 16;
      const r = applyTransitionFrame(phase, world, now, TUNING);
      phase = r.phase;
    }
    // On exit from returning every particle is EXACTLY at its target.
    for (const p of world.particles) {
      expect(p.x).toBe(p.tx);
      expect(p.y).toBe(p.ty);
      expect(p.vx).toBe(0);
      expect(p.vy).toBe(0);
    }
    expect(phase.kind).toBe('reforming');
  });

  it('reforming fades the into-element 0→1 and settle restores interactivity', () => {
    const world = makeWorld(8);
    const into = el();
    into.style.opacity = '0';
    into.style.pointerEvents = 'none';

    let phase: TransitionPhase = { kind: 'reforming', since: 3_000, from: el(), into };
    let settled = false;
    let now = 3_000;
    const opacities: number[] = [];
    while (!settled) {
      now += 16;
      const r = applyTransitionFrame(phase, world, now, TUNING);
      opacities.push(Number(into.style.opacity));
      phase = r.phase;
      settled = r.settled;
    }
    // Monotonic fade-in ending at exactly 1.
    for (let i = 1; i < opacities.length; i++) {
      expect(opacities[i]).toBeGreaterThanOrEqual(opacities[i - 1]);
    }
    expect(into.style.opacity).toBe('1');
    expect(into.style.pointerEvents).toBe('auto');
    // Pool is released on settle — the steady state owns zero particles.
    expect(world.particles.length).toBe(0);
    expect(phase.kind).toBe('idle');
  });

  it('swap reforms the INTO element, not the FROM element', () => {
    const world = makeWorld(8);
    const from = el();
    const into = el();
    from.style.opacity = '0';
    into.style.opacity = '0';
    runCycle(world, { kind: 'reforming', since: 0, from, into });
    expect(into.style.opacity).toBe('1');
    expect(from.style.opacity).toBe('0'); // from stays hidden — swap semantics
  });
});

describe('physics gating', () => {
  it('physics runs only while particles are free (idle/dissolving/particles)', () => {
    expect(PHYSICS_ACTIVE.idle).toBe(true);
    expect(PHYSICS_ACTIVE.dissolving).toBe(true);
    expect(PHYSICS_ACTIVE.particles).toBe(true);
    // The deterministic snap-back must be immune to forces (incl. pointer).
    expect(PHYSICS_ACTIVE.returning).toBe(false);
    expect(PHYSICS_ACTIVE.reforming).toBe(false);
  });

  it('phase durations honor their constants without asserting tick counts', () => {
    const world = makeWorld(4);
    const target = el();
    // dissolving hands off after DISSOLVE_HANDOFF_MS, not before.
    const early = applyTransitionFrame(
      { kind: 'dissolving', since: 1_000, from: target, into: target },
      world,
      1_000 + DISSOLVE_HANDOFF_MS, // not strictly greater — still dissolving
      TUNING,
    );
    expect(early.phase.kind).toBe('dissolving');
    const after = applyTransitionFrame(
      { kind: 'dissolving', since: 1_000, from: target, into: target },
      world,
      1_001 + DISSOLVE_HANDOFF_MS,
      TUNING,
    );
    expect(after.phase.kind).toBe('particles');
    // Sanity: the windows are positive and the fade is the longest tail.
    expect(RETURN_MS).toBeGreaterThan(0);
    expect(FADE_MS).toBeGreaterThan(0);
  });
});
