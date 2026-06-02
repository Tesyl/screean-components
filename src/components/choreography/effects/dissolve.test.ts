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
  easing,
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
import { dissolve } from './dissolve';

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
  const btn = button({ label: 'Save', onClick: () => {} });
  const s = scene({ particleCount: 8 }, btn);
  s.tick(0);
  const w = new World({ width: 100, height: 100 });
  w.addParticles(
    spawn({ n: 8, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  // Build a fake mirror host with a div tagged for this component so the
  // dissolve effect's findMirrorDiv hits.
  const host = document.createElement('div');
  const mirror = document.createElement('div');
  mirror.setAttribute('data-component-id', btn._component.id);
  host.appendChild(mirror);
  document.body.appendChild(host);
  const runner = createChoreoRunner({
    scene: s,
    world: w as unknown as Parameters<typeof createChoreoRunner>[0]["world"],
    particles: w.particles,
    mirrorHost: host,
  });
  return { btn, runner, host, mirror, particles: w.particles };
};

describe('dissolve effect (pipeline-friendly)', () => {
  it('hides the mirror div on first tick', () => {
    const { runner, btn, mirror } = setup();
    runner.tick(0);
    runner.run(
      pipe(dissolve({ particlePhaseMs: 100, returnMs: 100, fadeMs: 50 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(mirror.style.opacity).toBe('0');
    expect(mirror.style.pointerEvents).toBe('none');
  });

  it('snaps particles to (tx, ty) once the cycle reaches the reforming phase', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(
        dissolve({
          particlePhaseMs: 100,
          returnMs: 100,
          fadeMs: 50,
          returnEasing: easing.linear,
        }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    runner.tick(250); // cycle complete
    for (const p of particles) {
      expect(p.x).toBe(p.tx);
      expect(p.y).toBe(p.ty);
    }
  });

  it('restores mirror opacity on cancel', () => {
    const { runner, btn, mirror } = setup();
    runner.tick(0);
    const handle = runner.run(
      pipe(dissolve({ particlePhaseMs: 1000, returnMs: 500, fadeMs: 100 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0); // hide
    expect(mirror.style.opacity).toBe('0');
    handle.cancel();
    expect(mirror.style.opacity).toBe('1');
    expect(mirror.style.pointerEvents).toBe('auto');
  });

  it('two concurrent runs do not share state (independent cycles)', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    const e = dissolve({ particlePhaseMs: 100, returnMs: 100, fadeMs: 50 });
    runner.run(pipe(e), groupOfComponent(btn), btn);
    runner.tick(0);
    runner.tick(120); // first cycle 20ms into returning
    runner.run(pipe(e), groupOfComponent(btn), btn);
    runner.tick(120);
    // Tick past both cycles' end times. Cycle 1 started at 0 (ends at 250);
    // cycle 2 started at 120 (ends at 370). The assertion is that no exception
    // is thrown — the per-handle state object is what makes this work.
    runner.tick(400);
    for (const p of particles) {
      expect(p.x).toBe(p.tx);
      expect(p.y).toBe(p.ty);
    }
  });
});
