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
import { popTo3D } from './popTo3D';

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
  const runner = createChoreoRunner({
    scene: s,
    world: w,
    particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { btn, runner, particles: w.particles };
};

describe('popTo3D effect', () => {
  it('writes tz on first tick', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(pipe(popTo3D({ tz: 5, holdMs: 200 })), groupOfComponent(btn), btn);
    runner.tick(0);
    for (const p of particles) {
      expect(p.tz).toBe(5);
    }
  });

  it('snaps tz back to restTz at the end of holdMs', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(pipe(popTo3D({ tz: 8, holdMs: 100 })), groupOfComponent(btn), btn);
    runner.tick(0);
    runner.tick(100); // duration reached → onEnd fires
    for (const p of particles) {
      expect(p.tz).toBe(0);
    }
  });

  it('honors a non-zero restTz on snap-back', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(popTo3D({ tz: 5, holdMs: 100, restTz: -2 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(100);
    for (const p of particles) {
      expect(p.tz).toBe(-2);
    }
  });

  it('restores tz on cancel', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    const handle = runner.run(
      pipe(popTo3D({ tz: 5, holdMs: 1000 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0); // tz written
    handle.cancel();
    for (const p of particles) {
      expect(p.tz).toBe(0);
    }
  });
});
