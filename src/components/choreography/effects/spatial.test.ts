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
  easing,
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
import { gather } from './gather';
import { spread } from './spread';
import { rotate } from './rotate';
import { scale } from './scale';
import { teleport } from './teleport';

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
  const s = scene({ particleCount: 4 }, btn);
  s.tick(0);
  const w = new World({ width: 200, height: 200 });
  w.addParticles(
    spawn({ n: 4, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  // Place particles at known corners around (0,0): (10,0), (-10,0), (0,10), (0,-10)
  w.particles[0].x = 10;
  w.particles[0].y = 0;
  w.particles[1].x = -10;
  w.particles[1].y = 0;
  w.particles[2].x = 0;
  w.particles[2].y = 10;
  w.particles[3].x = 0;
  w.particles[3].y = -10;
  const runner = createChoreoRunner({
    scene: s,
    world: w as unknown as Parameters<typeof createChoreoRunner>[0]['world'],
    particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { btn, runner, particles: w.particles };
};

describe('gather', () => {
  it('pulls every particle to a fixed point over duration', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(
        gather({
          to: { x: 100, y: 100 },
          duration: 100,
          easing: easing.linear,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    for (const p of particles) {
      expect(p.x).toBeCloseTo(100);
      expect(p.y).toBeCloseTo(100);
    }
  });

  it('to: "centroid" pulls toward the group centroid (frozen at start)', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    // Centroid of (10,0), (-10,0), (0,10), (0,-10) = (0,0)
    runner.run(
      pipe(gather({ to: 'centroid', duration: 100, easing: easing.linear })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    for (const p of particles) {
      expect(p.x).toBeCloseTo(0);
      expect(p.y).toBeCloseTo(0);
    }
  });
});

describe('spread', () => {
  it('pushes particles outward from centroid by `distance`', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    // Centroid is (0,0). Each particle moves by `distance` in its
    // direction-from-centroid vector.
    runner.run(
      pipe(spread({ distance: 50, duration: 100, easing: easing.linear })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    // Particle 0 at (10, 0) → direction (1, 0) → end (10 + 50, 0) = (60, 0)
    expect(particles[0].x).toBeCloseTo(60);
    expect(particles[0].y).toBeCloseTo(0);
    // Particle 1 at (-10, 0) → end (-60, 0)
    expect(particles[1].x).toBeCloseTo(-60);
  });
});

describe('rotate', () => {
  it('rotates particles around centroid by `radians` over duration', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    // Centroid at (0,0). Rotate by π/2 (90° CCW). (10,0) → (0,10).
    runner.run(
      pipe(
        rotate({
          radians: Math.PI / 2,
          duration: 100,
          easing: easing.linear,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    expect(particles[0].x).toBeCloseTo(0);
    expect(particles[0].y).toBeCloseTo(10);
  });

  it('honors an explicit `around` pivot', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    // Rotate (10,0) around (10, 0) by any angle → stays at (10, 0).
    runner.run(
      pipe(
        rotate({
          radians: Math.PI,
          around: { x: 10, y: 0 },
          duration: 50,
          easing: easing.linear,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    expect(particles[0].x).toBeCloseTo(10);
    expect(particles[0].y).toBeCloseTo(0);
  });
});

describe('scale', () => {
  it('expands the group from centroid by factor', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    // Centroid at (0,0). factor 2 doubles distances. (10, 0) → (20, 0)
    runner.run(
      pipe(scale({ factor: 2, duration: 100, easing: easing.linear })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    expect(particles[0].x).toBeCloseTo(20);
    expect(particles[2].y).toBeCloseTo(20);
  });

  it('contracts when factor < 1', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(scale({ factor: 0.5, duration: 100, easing: easing.linear })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    expect(particles[0].x).toBeCloseTo(5);
  });
});

describe('teleport', () => {
  it('translates by offset (xor)', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(teleport({ offset: { x: 100, y: 50 } })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(particles[0].x).toBe(110);
    expect(particles[0].y).toBe(50);
    expect(particles[1].x).toBe(90);
  });

  it('collapses to a single point in `to` mode', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(teleport({ to: { x: 7, y: 7 } })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    for (const p of particles) {
      expect(p.x).toBe(7);
      expect(p.y).toBe(7);
    }
  });
});
