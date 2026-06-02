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
import { animate } from './animate';

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
  const w = new World({ width: 100, height: 100 });
  w.addParticles(
    spawn({ n: 4, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  const runner = createChoreoRunner({
    scene: s,
    world: w,
    particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { btn, runner, world: w };
};

describe('animate', () => {
  it('lerps a force constant from explicit `from` to `to`', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    runner.run(
      pipe(
        animate({
          param: 'perlinStrength',
          from: 0,
          to: 1,
          duration: 100,
          easing: easing.linear,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(world.getForceConstants().perlinStrength).toBe(0);
    runner.tick(50);
    expect(world.getForceConstants().perlinStrength).toBeCloseTo(0.5);
    runner.tick(100);
    expect(world.getForceConstants().perlinStrength).toBe(1);
  });

  it('lazy-snapshots `from` at first tick when omitted', () => {
    const { runner, btn, world } = setup();
    // World is at default (perlinStrength = 0). Set it to 0.3 BEFORE
    // running the animate — the lazy snapshot should pick that up.
    world.setForceConstants({ perlinStrength: 0.3 });
    runner.tick(0);
    runner.run(
      pipe(
        animate({
          param: 'perlinStrength',
          to: 1,
          duration: 100,
          easing: easing.linear,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    // From 0.3 to 1.0 at lerp 0.5 = 0.65.
    expect(world.getForceConstants().perlinStrength).toBeCloseTo(0.65);
  });

  it('snaps to exact target value on end (no lerp drift)', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    runner.run(
      pipe(
        animate({
          param: 'perlinStrength',
          from: 0,
          to: 0.7,
          duration: 100,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    expect(world.getForceConstants().perlinStrength).toBe(0.7);
  });

  it('chains for round-trip ramps (perlin glitch pattern)', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    runner.run(
      pipe(
        animate({ param: 'perlinStrength', from: 0, to: 0.8, duration: 100, easing: easing.linear }),
        animate({ param: 'perlinStrength', to: 0, duration: 100, easing: easing.linear }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(50);
    expect(world.getForceConstants().perlinStrength).toBeCloseTo(0.4);
    runner.tick(100);
    expect(world.getForceConstants().perlinStrength).toBeCloseTo(0.8);
    runner.tick(150);
    expect(world.getForceConstants().perlinStrength).toBeCloseTo(0.4);
    runner.tick(200);
    expect(world.getForceConstants().perlinStrength).toBe(0);
  });

  it('works on any force constant (springK demo)', () => {
    const { runner, btn, world } = setup();
    runner.tick(0);
    world.setForceConstants({ springK: 60 });
    runner.run(
      pipe(animate({ param: 'springK', to: 200, duration: 100, easing: easing.linear })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    expect(world.getForceConstants().springK).toBe(200);
  });
});
