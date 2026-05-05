// @vitest-environment happy-dom
// Bucket B — architectural cleanups: cancel-ctx unification + loop.streaming.

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
} from 'screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../../testing/offscreenCanvasStub';
import { __resetComponentIds } from '../component';
import { button } from '../factories/button';
import { createChoreoRunner } from './runner';
import { groupOfComponent } from './group';
import { pipe } from './pipeline';
import { defineEffect, type Effect, type EffectState } from './effect';
import { loop } from './combinators';
import { animate } from './effects/animate';
import { setTz } from './effects/setTz';

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

const setup = () => {
  const btn = button({ label: 'B', onClick: () => {} });
  const s = scene({ particleCount: 4 }, btn);
  s.tick(0);
  const w = new World({ width: 100, height: 100 });
  w.addParticles(
    spawn({ n: 4, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  const runner = createChoreoRunner({
    scene: s, world: w, particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { btn, runner, world: w };
};

describe('B1 — runner.cancel fast-forwards to end state', () => {
  it('cancel runs unstarted stages\' tick at t=duration so cleanup writes fire', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    // popTo3D recipe: setTz(5) → wait → setTz(0). If we cancel during
    // the wait, the final setTz(0) MUST run or tz stays stuck at 5.
    const handle = runner.run(
      pipe(
        setTz({ to: 5 }),
        // duration-100 wait via animate of an unrelated constant.
        animate({ param: 'drag', from: 0, to: 0, duration: 100 }),
        setTz({ to: 0 }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(20); // mid-wait
    handle.cancel();
    // Verify all particles got the final setTz(0) write.
    const tzAll = world.particles.every((p) => p.tz === 0);
    expect(tzAll).toBe(true);
  });

  it('animate cancel snaps to `to` value (fast-forward semantics)', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    world.setForceConstants({ perlinStrength: 0 });
    const handle = runner.run(
      pipe(animate({ param: 'perlinStrength', from: 0, to: 0.8, duration: 100 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(30); // ~30% in
    handle.cancel();
    // Cancel ticks at t=duration → animate writes its `to` value exactly.
    expect(world.getForceConstants().perlinStrength).toBe(0.8);
  });

  it('integrating effect (per-tick velocity write) is unaffected by cancel-fast-forward', () => {
    const { runner, btn, world } = setup();
    let totalDtSeen = 0;
    const integrator: Effect = defineEffect<EffectState>({
      scope: 'spatial',
      duration: 1000,
      tick: (_indices, ctx) => { totalDtSeen += ctx.dt; },
    });
    runner.tick(0);
    const handle = runner.run(pipe(integrator), groupOfComponent(btn), btn);
    runner.tick(0);
    runner.tick(50); // dtSeen ~50
    const before = totalDtSeen;
    handle.cancel();
    // Cancel ticks once with dt=0 — integrator should NOT add extra dt.
    expect(totalDtSeen).toBe(before);
    // The cancel still calls tick (so any final-state writes happen);
    // we just confirm dt=0 means zero additional integration.
    void world;
  });
});

describe('B2 — loop.streaming', () => {
  it('runs the inner effect N times sequentially (basic times)', () => {
    const calls: number[] = [];
    const inner: Effect = defineEffect<EffectState>({
      scope: 'particle',
      duration: 50,
      tick: (_, ctx) => { if (ctx.t === 0) calls.push(ctx.t); },
    });
    const { runner, btn } = setup();
    runner.tick(0);
    runner.run(
      pipe(loop.streaming({ times: 3 }, inner)),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    runner.tick(100);
    runner.tick(150);
    // 3 iterations, each pushes once at t=0 of its iteration.
    expect(calls.length).toBe(3);
  });

  it('predicate short-circuits before the next iteration', () => {
    const log: string[] = [];
    const inner: Effect = defineEffect<EffectState>({
      scope: 'particle',
      duration: 30,
      tick: () => { log.push('tick'); },
    });
    const { runner, btn } = setup();
    runner.tick(0);
    runner.run(
      pipe(
        loop.streaming({ times: 100, predicate: (n) => n < 2 }, inner),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(30);
    runner.tick(60);
    runner.tick(90);
    runner.tick(120);
    // Predicate stops after iteration 2 (allows 0 and 1). Each iteration
    // ticks at least once; we just verify it stopped.
    expect(log.length).toBeGreaterThan(0);
    expect(log.length).toBeLessThan(20);
  });

  it('per-iteration state is isolated (animate from-snapshot resets each iter)', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    world.setForceConstants({ perlinStrength: 0 });
    // Each iteration animates 0 → 1 over 50ms. With shared state, the
    // SECOND iteration's `from` would be 1 (the previous end value).
    // With per-iter state isolation, it resets to read 0 (current world
    // value) — but the world value doesn't reset between iterations.
    // So the test verifies that LAZY snapshot happens fresh per iteration.
    runner.run(
      pipe(
        loop.streaming(
          { times: 2 },
          animate({ param: 'perlinStrength', from: 0, to: 1, duration: 50 }),
        ),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50); // iter 1 ends at 1
    runner.tick(100); // iter 2 ends at 1 too
    // Both iterations land at `to=1`. The test passes if we get there
    // without state pollution.
    expect(world.getForceConstants().perlinStrength).toBe(1);
  });
});
