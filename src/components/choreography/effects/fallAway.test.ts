// @vitest-environment happy-dom
// Tests for visual.fallAway / visual.riseUp recipes (RFC-effect-language).
// Different category from visual.test.ts — those test atomic color effects
// (pulse / flash / fade); this file tests the *composed* visual-depth
// recipes that bundle scale + fade.
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
  packRGBA,
  unpackA,
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
import { fallAway, riseUp, visual } from './visual';

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
  const btn = button({ label: 'V', onClick: () => {} });
  const s = scene({ particleCount: 8 }, btn);
  s.tick(0);
  const w = new World({ width: 200, height: 200 });
  // Seed particles in a known horizontal spread so centroid math is
  // meaningful. The spawn helper drops them at the origin; we mutate
  // x to spread them out, then bind to the scene.
  const ps = spawn({
    n: 8,
    origin: { kind: 'point', x: 100, y: 100 },
    color: packRGBA(255, 100, 100, 200) as never,
  });
  for (let i = 0; i < ps.length; i++) {
    ps[i].x = 100 + (i - 3.5) * 4;
    ps[i].y = 100;
  }
  w.addParticles(ps);
  s.bindAll(w.particles, { kind: 'equal' });
  const runner = createChoreoRunner({
    scene: s, world: w, particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { btn, runner, world: w };
};

describe('visual.fallAway', () => {
  it('exposes both fallAway and riseUp on the visual namespace', () => {
    expect(visual.fallAway).toBe(fallAway);
    expect(visual.riseUp).toBe(riseUp);
  });

  it('compresses particles toward centroid by the end of duration', () => {
    const { runner, btn, world } = setup();
    const startsX = world.particles.map((p) => p.x);
    const centroid = startsX.reduce((a, b) => a + b, 0) / startsX.length;

    runner.tick(0);
    runner.run(
      pipe(visual.fallAway({ duration: 100, scaleTo: 0.5, alphaTo: 0 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    runner.tick(100);

    // After fallAway, every particle is closer to centroid than where
    // it started (compression by factor 0.5).
    for (let i = 0; i < world.particles.length; i++) {
      const startDist = Math.abs(startsX[i] - centroid);
      const endDist = Math.abs(world.particles[i].x - centroid);
      if (startDist > 1) {
        expect(endDist).toBeLessThan(startDist);
      }
    }
  });

  it('fades alpha toward target by end of duration', () => {
    const { runner, btn, world } = setup();
    const startAlpha = unpackA(world.particles[0].color);

    runner.tick(0);
    runner.run(
      pipe(visual.fallAway({ duration: 100, alphaTo: 0 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    runner.tick(100);

    for (const p of world.particles) {
      const a = unpackA(p.color);
      expect(a).toBeLessThan(startAlpha);
    }
  });

  it('does not mutate z-axis state (visual is NOT physical)', () => {
    const { runner, btn, world } = setup();
    // Capture z-axis state BEFORE fallAway. scene.bindAll may have set
    // tz to the leaf's z; that's expected and not a write fallAway makes.
    const before = world.particles.map((p) => ({
      tz: p.tz, z: p.z, vz: p.vz,
    }));
    runner.tick(0);
    runner.run(
      pipe(visual.fallAway({ duration: 50 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(25);
    runner.tick(50);
    // Whole point of visual: no z mutation. After the effect, z-axis
    // state matches the snapshot we took before it ran.
    for (let i = 0; i < world.particles.length; i++) {
      const p = world.particles[i];
      expect(p.tz).toBe(before[i].tz);
      expect(p.z).toBe(before[i].z);
      expect(p.vz).toBe(before[i].vz);
    }
  });
});

describe('visual.riseUp', () => {
  it('restores alpha back to high values', () => {
    const { runner, btn, world } = setup();
    // Pre-condition: alpha is 0 (component is "dismissed").
    for (const p of world.particles) {
      p.color = packRGBA(255, 100, 100, 0) as never;
    }

    runner.tick(0);
    runner.run(
      pipe(visual.riseUp({ duration: 100, alphaFrom: 0 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    runner.tick(100);

    for (const p of world.particles) {
      expect(unpackA(p.color)).toBeGreaterThan(200);
    }
  });
});
