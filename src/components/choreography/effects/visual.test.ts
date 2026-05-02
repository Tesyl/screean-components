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
  packRGBA,
  scene,
  spawn,
  unpackA,
  unpackR,
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
import { pulse } from './pulse';
import { flash } from './flash';
import { fade } from './fade';

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

const setup = (initialColor = packRGBA(20, 30, 40, 200)) => {
  const btn = button({ label: 'Go', onClick: () => {} });
  const s = scene({ particleCount: 4 }, btn);
  s.tick(0);
  const w = new World({ width: 100, height: 100 });
  w.addParticles(
    spawn({ n: 4, origin: { kind: 'point', x: 0, y: 0 }, color: initialColor }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  const runner = createChoreoRunner({
    scene: s,
    world: w as unknown as Parameters<typeof createChoreoRunner>[0]['world'],
    particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { btn, runner, particles: w.particles, initialColor };
};

describe('pulse', () => {
  it('returns to original color at the end of duration', () => {
    const { runner, btn, particles, initialColor } = setup();
    runner.tick(0);
    runner.run(
      pipe(pulse({ color: packRGBA(255, 0, 0), duration: 100 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    for (const p of particles) {
      expect(p.color).toBe(initialColor);
    }
  });

  it('reaches peak (closest to pulse color) at midpoint', () => {
    const { runner, btn, particles } = setup(packRGBA(0, 0, 0, 255));
    runner.tick(0);
    runner.run(
      pipe(
        pulse({
          color: packRGBA(255, 0, 0, 255),
          duration: 100,
          easing: easing.linear,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50); // midpoint — should be at full peak (k=1)
    expect(unpackR(particles[0].color)).toBe(255);
  });
});

describe('flash', () => {
  it('paints color at t=0 and decays to original by t=decayMs', () => {
    const { runner, btn, particles, initialColor } = setup();
    runner.tick(0);
    runner.run(
      pipe(flash({ color: packRGBA(0, 255, 0), decayMs: 100 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(unpackR(particles[0].color)).toBe(0);
    runner.tick(100);
    for (const p of particles) {
      expect(p.color).toBe(initialColor);
    }
  });
});

describe('fade', () => {
  it('lerps alpha from start to to over duration', () => {
    const { runner, btn, particles } = setup(packRGBA(100, 100, 100, 255));
    runner.tick(0);
    runner.run(
      pipe(fade({ to: 0, duration: 100, easing: easing.linear })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50); // alpha ≈ 127
    const midA = unpackA(particles[0].color);
    expect(midA).toBeGreaterThan(100);
    expect(midA).toBeLessThan(160);
    runner.tick(100); // alpha = 0
    expect(unpackA(particles[0].color)).toBe(0);
  });

  it('preserves RGB while only alpha changes', () => {
    const { runner, btn, particles } = setup(packRGBA(100, 200, 50, 255));
    runner.tick(0);
    runner.run(
      pipe(fade({ to: 0, duration: 100, easing: easing.linear })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    expect(unpackR(particles[0].color)).toBe(100);
  });

  it('honors an explicit `from` alpha', () => {
    const { runner, btn, particles } = setup(packRGBA(100, 100, 100, 255));
    runner.tick(0);
    runner.run(
      pipe(fade({ from: 100, to: 200, duration: 100, easing: easing.linear })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(unpackA(particles[0].color)).toBe(100); // starts from explicit
    runner.tick(100);
    expect(unpackA(particles[0].color)).toBe(200);
  });
});
