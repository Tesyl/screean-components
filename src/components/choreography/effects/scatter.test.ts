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
} from '../../../testing/offscreenCanvasStub';
import { __resetComponentIds } from '../../component';
import { button } from '../../factories/button';
import { createChoreoRunner } from '../runner';
import { groupOfComponent } from '../group';
import { pipe } from '../pipeline';
import { scatter } from './scatter';

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
  const btn = button({ label: 'S', onClick: () => {} });
  const s = scene({ particleCount: 8 }, btn);
  s.tick(0);
  const w = new World({ width: 200, height: 200 });
  w.addParticles(
    spawn({ n: 8, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  const runner = createChoreoRunner({
    scene: s, world: w, particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { btn, runner, world: w };
};

describe('scatter', () => {
  it('writes a non-zero velocity to every indexed particle', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    runner.run(
      pipe(scatter({ magMin: 200, magMax: 400, seed: 42 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    // Every particle should have got an impulse.
    for (const p of world.particles) {
      const speed = Math.hypot(p.vx, p.vy);
      expect(speed).toBeGreaterThan(190);
      expect(speed).toBeLessThan(410);
    }
  });

  it('directions vary per particle (not coordinated)', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    runner.run(
      pipe(scatter({ magMin: 100, magMax: 100, seed: 7 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    // With angles uniform on [0, 2π) and a fixed magnitude, the variance
    // across particles in vx (or vy) should be non-trivial — i.e. they
    // are NOT all flying in the same direction.
    const vxs = world.particles.map((p) => p.vx);
    const meanVx = vxs.reduce((a, b) => a + b, 0) / vxs.length;
    const varVx = vxs.reduce((a, v) => a + (v - meanVx) ** 2, 0) / vxs.length;
    // Variance of cos(uniform[0,2π]) × 100 is ~5000. Allow generous slack
    // for a small N=8 sample — just confirm it's not collapsed near 0.
    expect(varVx).toBeGreaterThan(500);
  });

  it('seeded scatter is deterministic across runs', () => {
    const captureVelocities = (): number[] => {
      const { runner, btn, world } = setup();
      runner.tick(0);
      runner.run(
        pipe(scatter({ magMin: 250, magMax: 250, seed: 1234 })),
        groupOfComponent(btn),
        btn,
      );
      runner.tick(0);
      return world.particles.flatMap((p) => [p.vx, p.vy]);
    };
    const a = captureVelocities();
    const b = captureVelocities();
    expect(a).toEqual(b);
  });

  it('angleCenter + angleSpread narrows the distribution', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    // Constrain to ±10° around 0 (rightward). All vx should be positive.
    runner.run(
      pipe(scatter({
        magMin: 100, magMax: 100,
        angleCenter: 0, angleSpread: Math.PI / 18, // ±5°
        seed: 99,
      })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    for (const p of world.particles) {
      expect(p.vx).toBeGreaterThan(0);
    }
  });
});
