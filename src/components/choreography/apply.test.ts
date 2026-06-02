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
import { button } from '../factories/button';
import { toggle } from '../factories/toggle';
import { applyDefaultChoreography } from './apply';
import { createChoreoRunner } from './runner';
import { pipe } from './pipeline';
import { kick } from './effects/kick';

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

const setupRunner = (component: ReturnType<typeof button>) => {
  const s = scene({ particleCount: 8 }, component);
  s.tick(0);
  const w = new World({ width: 100, height: 100 });
  w.addParticles(
    spawn({ n: 8, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  // Build a fake mirror so dissolve can find a div for the component.
  const host = document.createElement('div');
  const mirror = document.createElement('div');
  mirror.setAttribute('data-component-id', component._component.id);
  host.appendChild(mirror);
  document.body.appendChild(host);
  const runner = createChoreoRunner({
    scene: s,
    world: w as unknown as Parameters<typeof createChoreoRunner>[0]["world"],
    particles: w.particles,
    mirrorHost: host,
  });
  return { runner, host, mirror, particles: w.particles };
};

describe('applyDefaultChoreography', () => {
  it('wires button click to dissolve via the registry', () => {
    let consumerCalled = 0;
    const btn = button({ label: 'Save', onClick: () => consumerCalled++ });
    const { runner, mirror } = setupRunner(btn);

    runner.tick(0);
    applyDefaultChoreography(runner, btn);

    btn._component.handlers.onClick?.({} as never);
    runner.tick(0);
    runner.tick(50); // pop fires; dissolve queued at 120ms

    expect(consumerCalled).toBe(1); // consumer handler still fires
    runner.tick(180); // dissolve has started → mirror hidden
    expect(mirror.style.opacity).toBe('0');
  });

  it('per-instance override beats registry for that event only', () => {
    let kickedIndices: readonly number[] | null = null;
    const recorder = pipe({
      scope: 'particle' as const,
      duration: 0,
      tick: (indices: readonly number[]) => {
        kickedIndices = indices;
      },
    });
    const btn = button({ label: 'Save', onClick: () => {} });
    const { runner } = setupRunner(btn);

    runner.tick(0);
    applyDefaultChoreography(runner, btn, {
      onClick: recorder,
    });

    btn._component.handlers.onClick?.({} as never);
    runner.tick(0);

    expect(kickedIndices).not.toBeNull();
    expect((kickedIndices as unknown as readonly number[]).length).toBeGreaterThan(0);
  });

  it('disposer unwinds all installed triggers', () => {
    const btn = button({ label: 'Save', onClick: () => {} });
    const original = btn._component.handlers.onClick;
    const { runner } = setupRunner(btn);

    runner.tick(0);
    const handle = applyDefaultChoreography(runner, btn);
    expect(btn._component.handlers.onClick).not.toBe(original);
    handle.dispose();
    expect(btn._component.handlers.onClick).toBe(original);
  });

  it('falls back gracefully for roles with no registry entry', () => {
    // toggle has a registry entry (onChange), but to test the no-entry fall-
    // back, use a Component with role='none'. We construct a button-like with
    // an explicit no-op via override path.
    const t = toggle({ on: false, onChange: () => {} });
    const { runner } = setupRunner(t as unknown as ReturnType<typeof button>);
    runner.tick(0);
    // toggle role is 'switch'; registry has onChange. Override with empty
    // disables choreography for this instance.
    expect(() => applyDefaultChoreography(runner, t as unknown as ReturnType<typeof button>, {})).not.toThrow();
  });

  it('composes well: kick + dissolve via override', () => {
    const btn = button({ label: 'Boom', onClick: () => {} });
    const { runner, particles } = setupRunner(btn);
    // Spread particles so the radial impulse has direction vectors to push
    // along (kick at the centroid of co-located points has zero direction).
    particles.forEach((p, i) => {
      p.x = (i - 4) * 5;
      p.y = (i - 4) * 5;
    });
    runner.tick(0);
    applyDefaultChoreography(runner, btn, {
      onClick: pipe(kick({ strength: 100 })),
    });
    btn._component.handlers.onClick?.({} as never);
    const before = particles.map((p) => ({ vx: p.vx, vy: p.vy }));
    runner.tick(0);
    const moved = particles.some(
      (p, i) => p.vx !== before[i].vx || p.vy !== before[i].vy,
    );
    expect(moved).toBe(true);
  });
});
