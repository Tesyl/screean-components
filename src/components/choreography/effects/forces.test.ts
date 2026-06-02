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
} from '../../../testing/offscreenCanvasStub';
import { __resetComponentIds } from '../../component';
import { button } from '../../factories/button';
import { createChoreoRunner } from '../runner';
import { groupOfComponent } from '../group';
import { pipe } from '../pipeline';
import { gravity } from './gravity';
import { magnetize } from './magnetize';
import { vibrate } from './vibrate';
import { shake } from './shake';
import { shimmer } from './shimmer';

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
  const w = new World({ width: 200, height: 200 });
  w.addParticles(
    spawn({ n: 6, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  w.particles.forEach((p, i) => {
    p.x = (i - 3) * 10;
    p.y = (i - 3) * 5;
  });
  const runner = createChoreoRunner({
    scene: s,
    world: w as unknown as Parameters<typeof createChoreoRunner>[0]['world'],
    particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { btn, runner, particles: w.particles };
};

describe('gravity', () => {
  it('adds velocity in the direction over duration', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(
        gravity({
          direction: { x: 0, y: 1 },
          strength: 1000,
          duration: 100,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50); // dt=50ms; dv = 1000 * 0.05 = 50
    for (const p of particles) {
      expect(p.vy).toBeGreaterThan(0);
    }
  });
});

describe('magnetize', () => {
  it('pulls particles toward an explicit target', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    // Place a strong magnet at (200, 200). All particles initially below
    // and left should accelerate toward it.
    runner.run(
      pipe(
        magnetize({
          to: { x: 200, y: 200 },
          strength: 100000,
          duration: 100,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    for (const p of particles) {
      expect(p.vx).toBeGreaterThan(0);
      expect(p.vy).toBeGreaterThan(0);
    }
  });

  it('to: "centroid" snapshots centroid at start (no motion when already there)', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(
        magnetize({ to: 'centroid', strength: 1000, duration: 100 }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    // Particles attracted to centroid; one in each direction should have
    // some velocity toward it. We just verify no NaN/explosion.
    for (const p of particles) {
      expect(Number.isFinite(p.vx)).toBe(true);
      expect(Number.isFinite(p.vy)).toBe(true);
    }
  });
});

describe('vibrate', () => {
  it('adds sinusoidal velocity along the chosen axis', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(
        vibrate({ axis: 'x', freq: 4, amplitude: 50, duration: 1000 }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(62); // about 1/4 period at 4Hz; near peak
    for (const p of particles) {
      expect(p.vx).not.toBe(0);
      expect(p.vy).toBe(0);
    }
  });
});

describe('shake', () => {
  it('writes per-particle 2D velocity (different per index)', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(shake({ amplitude: 30, freq: 8, duration: 200 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    // Phase offset means different indices have different velocity vectors.
    const allSame =
      particles.every((p) => p.vx === particles[0].vx) &&
      particles.every((p) => p.vy === particles[0].vy);
    expect(allSame).toBe(false);
    expect(particles.some((p) => p.vx !== 0 || p.vy !== 0)).toBe(true);
  });
});

describe('shimmer', () => {
  it('adds non-zero velocity nudges across the group', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(shimmer({ magnitude: 20, duration: 200 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    runner.tick(100);
    expect(particles.some((p) => p.vx !== 0 || p.vy !== 0)).toBe(true);
  });

  it('is deterministic given the same tick schedule', () => {
    const run = (): { vx: number; vy: number } => {
      const { runner, btn, particles } = setup();
      runner.tick(0);
      runner.run(
        pipe(shimmer({ magnitude: 20, duration: 200 })),
        groupOfComponent(btn),
        btn,
      );
      runner.tick(50);
      return { vx: particles[0].vx, vy: particles[0].vy };
    };
    const a = run();
    const b = run();
    expect(a.vx).toBe(b.vx);
    expect(a.vy).toBe(b.vy);
  });
});
