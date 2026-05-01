// @vitest-environment happy-dom
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
import { createChoreoRunner, type ChoreoRunner } from './runner';
import { groupOfComponent } from './group';
import { pipe, at } from './pipeline';
import type { Effect } from './effect';

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

const setupRunner = (): {
  runner: ChoreoRunner;
  btn: ReturnType<typeof button>;
} => {
  const btn = button({ label: 'Go', onClick: () => {} });
  const s = scene({ particleCount: 8 }, btn);
  s.tick(0);
  const w = new World({ width: 100, height: 100 });
  w.addParticles(
    spawn({ n: 8, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  const mirrorHost = document.createElement('div');
  const runner = createChoreoRunner({
    scene: s,
    world: w,
    particles: w.particles,
    mirrorHost,
  });
  return { runner, btn };
};

const counter = (
  duration: number,
): Effect & { count: () => number; ended: () => boolean } => {
  let calls = 0;
  let ended = false;
  return {
    duration,
    tick: () => {
      calls++;
    },
    onEnd: () => {
      ended = true;
    },
    count: () => calls,
    ended: () => ended,
  } as ReturnType<typeof counter>;
};

describe('createChoreoRunner', () => {
  it('runs an instant effect once and marks the handle done', () => {
    const { runner, btn } = setupRunner();
    runner.tick(1000); // set clock
    const c = counter(0);
    const handle = runner.run(pipe(c), groupOfComponent(btn));
    expect(c.count()).toBe(0);
    runner.tick(1000); // ticks the just-added handle
    expect(c.count()).toBe(1);
    expect(handle.done()).toBe(true);
  });

  it('runs a temporal effect across multiple ticks', () => {
    const { runner, btn } = setupRunner();
    runner.tick(0);
    const c = counter(100);
    const handle = runner.run(pipe(c), groupOfComponent(btn));
    runner.tick(0);
    runner.tick(50);
    expect(c.count()).toBe(2);
    expect(handle.done()).toBe(false);
    runner.tick(100);
    expect(c.ended()).toBe(true);
    expect(handle.done()).toBe(true);
  });

  it('cancel() runs onEnd on every started stage exactly once', () => {
    const { runner, btn } = setupRunner();
    runner.tick(0);
    const c = counter(1000);
    const handle = runner.run(pipe(c), groupOfComponent(btn));
    runner.tick(0); // started
    handle.cancel();
    expect(c.ended()).toBe(true);
    handle.cancel(); // double-cancel safe
    expect(handle.done()).toBe(true);
  });

  it('runner.tick advances all live handles and prunes done ones', () => {
    const { runner, btn } = setupRunner();
    runner.tick(0);
    const a = counter(0);
    const b = counter(50);
    runner.run(pipe(a), groupOfComponent(btn));
    runner.run(pipe(b), groupOfComponent(btn));
    runner.tick(0);
    runner.tick(50);
    expect(a.count()).toBe(1);
    expect(b.ended()).toBe(true);
  });

  it('two run() calls of the same pipeline stack independently', () => {
    const { runner, btn } = setupRunner();
    runner.tick(0);
    const c = counter(100);
    const h1 = runner.run(pipe(c), groupOfComponent(btn));
    runner.tick(50);
    const h2 = runner.run(pipe(c), groupOfComponent(btn));
    runner.tick(80);
    // Both alive: h1 at elapsed 80/100, h2 at elapsed 30/100. Each is ticked
    // independently so the effect's tick fires for both.
    expect(c.count()).toBeGreaterThan(2);
    expect(h1.done()).toBe(false);
    expect(h2.done()).toBe(false);
    runner.tick(120);
    // h1 is at elapsed 120 > 100 → done. h2 is at elapsed 70 < 100 → alive.
    expect(h1.done()).toBe(true);
    expect(h2.done()).toBe(false);
  });

  it('dispose() cancels all live handles and clears triggers', () => {
    const { runner, btn } = setupRunner();
    runner.tick(0);
    const c = counter(1000);
    runner.run(pipe(c), groupOfComponent(btn));
    runner.run(pipe(c), groupOfComponent(btn));
    runner.tick(0);
    runner.dispose();
    expect(c.ended()).toBe(true);
  });

  it('translates pipeline-time → stage-local-time for at()-offset stages', () => {
    const { runner, btn } = setupRunner();
    runner.tick(0);
    const seenT: number[] = [];
    const e: Effect = {
      duration: 50,
      tick: (_, ctx) => seenT.push(ctx.t),
    };
    runner.run(pipe(at(100, e)), groupOfComponent(btn));
    runner.tick(0);    // pre-start
    runner.tick(100);  // stage activates: t=0
    runner.tick(125);  // mid: t=25
    runner.tick(150);  // end: t=50, ended
    expect(seenT).toEqual([0, 25, 50]);
  });
});
