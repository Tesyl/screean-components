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
} from '@tesyl/screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../../testing/offscreenCanvasStub';
import { __resetComponentIds } from '../component';
import { slider } from '../factories/slider';
import { createChoreoRunner } from './runner';
import { groupOfComponent } from './group';
import { pipe } from './pipeline';
import type { Effect } from './effect';
import { loop, narrow, parallel, stretch, when } from './combinators';
import { setColor } from './effects/setColor';
import { kick } from './effects/kick';
import { packRGBA } from '@tesyl/screean';

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

const setupSlider = () => {
  const sli = slider({ value: 0.5, onChange: () => {} });
  const s = scene({ particleCount: 12 }, sli);
  s.tick(0);
  const w = new World({ width: 200, height: 200 });
  w.addParticles(
    spawn({ n: 12, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  // Spread for kick-direction sanity.
  w.particles.forEach((p, i) => {
    p.x = (i - 6) * 5;
    p.y = (i - 6) * 5;
  });
  const runner = createChoreoRunner({
    scene: s,
    world: w as unknown as Parameters<typeof createChoreoRunner>[0]['world'],
    particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { sli, runner, particles: w.particles };
};

describe('parallel', () => {
  it('runs multiple effects concurrently — duration = max', () => {
    const log: string[] = [];
    const a: Effect = {
      scope: 'particle',
      duration: 100,
      tick: (_, ctx) => {
        if (ctx.t === 0) log.push('a-start');
        if (ctx.t === 100) log.push('a-end');
      },
    };
    const b: Effect = {
      scope: 'particle',
      duration: 200,
      tick: (_, ctx) => {
        if (ctx.t === 0) log.push('b-start');
        if (ctx.t === 200) log.push('b-end');
      },
    };
    const { runner, sli } = setupSlider();
    runner.tick(0);
    runner.run(parallel(a, b), groupOfComponent(sli));
    runner.tick(0);
    expect(log).toContain('a-start');
    expect(log).toContain('b-start');
    runner.tick(100);
    expect(log).toContain('a-end');
    runner.tick(200);
    expect(log).toContain('b-end');
  });

  it('is equivalent to pipe(at(0,a), at(0,b))', () => {
    const a: Effect = { scope: 'particle', duration: 50, tick: () => {} };
    const b: Effect = { scope: 'particle', duration: 100, tick: () => {} };
    const par = parallel(a, b);
    expect(par.duration).toBe(100);
    expect(par.stages.map((s) => s.startMs)).toEqual([0, 0]);
  });
});

describe('narrow', () => {
  it('scopes a single Effect to the named subpart', () => {
    const { runner, sli, particles } = setupSlider();
    runner.tick(0);
    // Slider has 3 leaves (track, fill, thumb) — 4 particles each via 'equal'.
    // narrow('thumb', kick) should kick only thumb particles.
    const before = particles.map((p) => ({ vx: p.vx, vy: p.vy }));
    runner.run(
      pipe(narrow('thumb', kick({ strength: 100 }))),
      groupOfComponent(sli),
      sli,
    );
    runner.tick(0);
    const movedCount = particles.filter(
      (p, i) => p.vx !== before[i].vx || p.vy !== before[i].vy,
    ).length;
    // Roughly 4 thumb particles received kicks.
    expect(movedCount).toBeGreaterThan(0);
    expect(movedCount).toBeLessThanOrEqual(4);
  });

  it('falls through gracefully when the part is missing', () => {
    const { runner, sli, particles } = setupSlider();
    runner.tick(0);
    const before = particles.map((p) => ({ vx: p.vx, vy: p.vy }));
    expect(() => {
      runner.run(
        pipe(narrow('nonexistent', kick({ strength: 100 }))),
        groupOfComponent(sli),
        sli,
      );
      runner.tick(0);
    }).not.toThrow();
    // Falls through to the original group — every particle gets kicked.
    const movedCount = particles.filter(
      (p, i) => p.vx !== before[i].vx || p.vy !== before[i].vy,
    ).length;
    expect(movedCount).toBeGreaterThan(4);
  });

  it('falls through when ctx.component is missing (no component passed)', () => {
    const { runner, sli, particles } = setupSlider();
    runner.tick(0);
    expect(() => {
      runner.run(
        pipe(narrow('thumb', kick({ strength: 100 }))),
        groupOfComponent(sli),
        // No component — narrow falls through to the passed indices
      );
      runner.tick(0);
    }).not.toThrow();
    expect(particles.some((p) => p.vx !== 0 || p.vy !== 0)).toBe(true);
  });

  it('scopes a whole Pipeline (every stage gets narrowed)', () => {
    const { runner, sli, particles } = setupSlider();
    runner.tick(0);
    const yellow = packRGBA(255, 255, 0);
    runner.run(
      narrow('thumb', pipe(setColor({ to: yellow }))),
      groupOfComponent(sli),
      sli,
    );
    runner.tick(0);
    const yellowCount = particles.filter((p) => p.color === yellow).length;
    expect(yellowCount).toBeGreaterThan(0);
    expect(yellowCount).toBeLessThanOrEqual(4); // thumb has 4 particles
  });
});

describe('loop', () => {
  it('repeats the inner effect N times sequentially', () => {
    const calls: number[] = [];
    const e: Effect = {
      scope: 'particle',
      duration: 50,
      tick: (_, ctx) => {
        if (ctx.t === 0) calls.push(ctx.t);
      },
    };
    const { runner, sli } = setupSlider();
    runner.tick(0);
    runner.run(loop({ times: 3 }, e), groupOfComponent(sli));
    runner.tick(0); // iter 1 starts
    runner.tick(50); // iter 1 ends, iter 2 starts (no gap)
    runner.tick(100); // iter 2 ends, iter 3 starts
    runner.tick(150); // iter 3 ends
    expect(calls.length).toBe(3);
  });

  it('respects the gap between iterations', () => {
    const e: Effect = { scope: 'particle', duration: 50, tick: () => {} };
    const looped = loop({ times: 2, gap: 100 }, e);
    expect(looped.duration).toBe(50 + 100 + 50);
  });
});

describe('when', () => {
  it('runs the effect when predicate returns true', () => {
    const ticks: number[] = [];
    const inner: Effect = {
      scope: 'particle',
      duration: 50,
      tick: (_, ctx) => ticks.push(ctx.t),
    };
    const { runner, sli } = setupSlider();
    runner.tick(0);
    runner.run(pipe(when(() => true, inner)), groupOfComponent(sli), sli);
    runner.tick(0);
    runner.tick(25);
    runner.tick(50);
    expect(ticks.length).toBeGreaterThan(0);
  });

  it('skips the effect when predicate returns false', () => {
    const ticks: number[] = [];
    const inner: Effect = {
      scope: 'particle',
      duration: 50,
      tick: (_, ctx) => ticks.push(ctx.t),
    };
    const { runner, sli } = setupSlider();
    runner.tick(0);
    runner.run(pipe(when(() => false, inner)), groupOfComponent(sli), sli);
    runner.tick(0);
    runner.tick(25);
    runner.tick(50);
    expect(ticks).toEqual([]);
  });
});

describe('stretch', () => {
  it('scales duration by factor', () => {
    const inner: Effect = { scope: 'particle', duration: 100, tick: () => {} };
    expect(stretch(2, inner).duration).toBe(200);
    expect(stretch(0.5, inner).duration).toBe(50);
  });

  it('remaps t so the inner effect sees its full original range', () => {
    const seenT: number[] = [];
    const inner: Effect = {
      scope: 'particle',
      duration: 100,
      tick: (_, ctx) => seenT.push(ctx.t),
    };
    const { runner, sli } = setupSlider();
    runner.tick(0);
    runner.run(pipe(stretch(2, inner)), groupOfComponent(sli), sli);
    runner.tick(0);   // outer t=0 → inner t=0
    runner.tick(100); // outer t=100 → inner t=50
    runner.tick(200); // outer t=200 (=duration) → inner t=100 (=original duration)
    expect(seenT[0]).toBe(0);
    expect(seenT[1]).toBe(50);
    expect(seenT[2]).toBe(100);
  });

  it('throws on factor <= 0', () => {
    const inner: Effect = { scope: 'particle', duration: 100, tick: () => {} };
    expect(() => stretch(0, inner)).toThrow();
    expect(() => stretch(-1, inner)).toThrow();
  });

  it('passes through instant effects unchanged (no time to scale)', () => {
    const inner: Effect = { scope: 'particle', duration: 0, tick: () => {} };
    expect(stretch(2, inner)).toBe(inner);
  });
});
