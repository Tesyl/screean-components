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
  packRGBA,
  scene,
  spawn,
  TRANSPARENT,
  World,
  type Particle,
} from 'screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../../../testing/offscreenCanvasStub';
import { __resetComponentIds } from '../../component';
import { button } from '../../factories/button';
import { createChoreoRunner } from '../runner';
import { groupOfComponent } from '../group';
import { pipe } from '../pipeline';
import { boundsRadiusOf, centroidOf } from './_geom';
import { kick } from './kick';
import { pop } from './pop';
import { setColor } from './setColor';
import { perlinGlitch } from './perlinGlitch';

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
  const btn = button({ label: 'Go', onClick: () => {} });
  const s = scene({ particleCount: 6 }, btn);
  s.tick(0);
  const w = new World({ width: 100, height: 100 });
  w.addParticles(
    spawn({ n: 6, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  // Spread particles to non-trivial positions so centroid math is meaningful.
  w.particles[0].x = 0;
  w.particles[0].y = 0;
  w.particles[1].x = 10;
  w.particles[1].y = 0;
  w.particles[2].x = 5;
  w.particles[2].y = 5;
  w.particles[3].x = -5;
  w.particles[3].y = -5;
  w.particles[4].x = 5;
  w.particles[4].y = -5;
  w.particles[5].x = -5;
  w.particles[5].y = 5;
  const runner = createChoreoRunner({
    scene: s,
    world: w,
    particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { btn, runner, world: w, particles: w.particles as Particle[] };
};

describe('_geom helpers', () => {
  it('centroidOf returns mean (x, y) over live particles', () => {
    const { particles } = setup();
    const c = centroidOf([0, 1, 2, 3, 4, 5], particles);
    // Average of (0,0), (10,0), (5,5), (-5,-5), (5,-5), (-5,5)
    expect(c.x).toBeCloseTo(10 / 6);
    expect(c.y).toBeCloseTo(0);
  });

  it('centroidOf skips dead particles', () => {
    const { particles } = setup();
    particles[0].life = 0;
    const c = centroidOf([0, 1], particles);
    // Only particle[1] at (10, 0)
    expect(c.x).toBe(10);
    expect(c.y).toBe(0);
  });

  it('boundsRadiusOf returns max distance from centroid', () => {
    const { particles } = setup();
    const r = boundsRadiusOf([0, 1, 2, 3, 4, 5], particles);
    expect(r).toBeGreaterThan(0);
  });

  it('boundsRadiusOf returns 0 for empty groups', () => {
    const { particles } = setup();
    expect(boundsRadiusOf([], particles)).toBe(0);
  });
});

describe('kick', () => {
  it('applies a velocity stomp to every particle in the group', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    const before = particles.map((p) => ({ vx: p.vx, vy: p.vy }));
    runner.run(pipe(kick({ strength: 100 })), groupOfComponent(btn), btn);
    runner.tick(0);
    const moved = particles.some(
      (p, i) => p.vx !== before[i].vx || p.vy !== before[i].vy,
    );
    expect(moved).toBe(true);
  });

  it('honors an explicit origin', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(kick({ strength: 200, origin: { x: 100, y: 100 } })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    // All particles should have been pushed away from (100, 100), so vx<0,vy<0
    // for particles at the origin region.
    const pushedAway = particles.every((p) => p.vx < 0 && p.vy < 0);
    expect(pushedAway).toBe(true);
  });
});

describe('pop', () => {
  it('writes velocity once at t=0 only', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(pipe(pop({ intensity: 0.4 })), groupOfComponent(btn), btn);
    runner.tick(0);
    const vAfterFirst = particles.map((p) => ({ vx: p.vx, vy: p.vy }));
    runner.tick(50);
    runner.tick(100);
    // Subsequent ticks should NOT add velocity (pop only kicks at t=0).
    for (let i = 0; i < particles.length; i++) {
      expect(particles[i].vx).toBe(vAfterFirst[i].vx);
      expect(particles[i].vy).toBe(vAfterFirst[i].vy);
    }
  });

  it('completes after POP_DURATION_MS regardless of subsequent ticks', () => {
    const { runner, btn } = setup();
    runner.tick(0);
    const handle = runner.run(pipe(pop()), groupOfComponent(btn), btn);
    runner.tick(0);
    expect(handle.done()).toBe(false);
    runner.tick(400);
    expect(handle.done()).toBe(true);
  });
});

describe('setColor', () => {
  it('writes color across every live particle in the group', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    const yellow = packRGBA(255, 255, 0);
    runner.run(pipe(setColor({ to: yellow })), groupOfComponent(btn), btn);
    runner.tick(0);
    for (const p of particles) {
      expect(p.color).toBe(yellow);
    }
  });

  it('skips dead particles', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    particles[0].life = 0;
    particles[0].color = TRANSPARENT;
    const red = packRGBA(255, 0, 0);
    runner.run(pipe(setColor({ to: red })), groupOfComponent(btn), btn);
    runner.tick(0);
    expect(particles[0].color).toBe(TRANSPARENT);
    expect(particles[1].color).toBe(red);
  });
});

describe('perlinGlitch', () => {
  it('no-ops silently on a CPU world (no applyPerlinGlitch surface)', () => {
    const { runner, btn } = setup();
    runner.tick(0);
    expect(() => {
      runner.run(
        pipe(
          perlinGlitch({
            amplitude: 10,
            frequency: 0.02,
            durationMs: 100,
          }),
        ),
        groupOfComponent(btn),
        btn,
      );
      runner.tick(0);
    }).not.toThrow();
  });

  it('forwards opts to world.applyPerlinGlitch on a GPU-shaped world', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    // Inject a duck-typed applyPerlinGlitch onto the existing world. The
    // perlinGlitch effect duck-types the surface; we don't need a real GPU.
    const calls: unknown[] = [];
    (world as unknown as { applyPerlinGlitch: (o: unknown) => void }).applyPerlinGlitch = (o) => {
      calls.push(o);
    };
    runner.run(
      pipe(
        perlinGlitch({
          amplitude: 25,
          frequency: 0.03,
          octaves: 2,
          durationMs: 400,
          seed: 7,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(calls).toHaveLength(1);
    expect(calls[0]).toMatchObject({
      amplitude: 25,
      frequency: 0.03,
      octaves: 2,
      durationMs: 400,
      seed: 7,
    });
  });

  it('completes after durationMs', () => {
    const { runner, btn } = setup();
    runner.tick(0);
    const handle = runner.run(
      pipe(perlinGlitch({ amplitude: 10, frequency: 0.02, durationMs: 200 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(handle.done()).toBe(false);
    runner.tick(200);
    expect(handle.done()).toBe(true);
  });
});
