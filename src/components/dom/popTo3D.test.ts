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
  node,
  scene,
  TRANSPARENT,
  World,
  spawn,
  type Particle,
} from 'screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../../testing/offscreenCanvasStub';
import { button } from '../factories/button';
import { __resetComponentIds } from '../component';
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

// Shared setup: a button inside a scene with bound particles. Lets each test
// assert on `world.particles[i].tz` after popTo3D mutations.
const setup = () => {
  const btn = button({
    label: 'Go',
    onClick: () => {},
    width: 100,
    height: 40,
    radius: 0,
  });
  const s = scene({ particleCount: 8 }, btn);
  s.tick(0);
  const w = new World({ width: 100, height: 100 });
  w.addParticles(
    spawn({
      n: 8,
      origin: { kind: 'point', x: 0, y: 0 },
      color: TRANSPARENT,
    }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  return { s, btn, particles: w.particles as Particle[] };
};

describe('popTo3D', () => {
  it('sets tz on every particle bound to the component', () => {
    const { s, btn, particles } = setup();
    popTo3D({ scene: s, subtree: btn, particles, tz: 5 });
    const indices = s.indicesForSubtree(btn);
    expect(indices.length).toBeGreaterThan(0);
    for (const i of indices) expect(particles[i].tz).toBe(5);
  });

  it('leaves particles NOT in the component untouched', () => {
    // Two components in the same scene; pop one, verify the other is unaffected.
    const a = button({
      label: 'A',
      onClick: () => {},
      width: 50, height: 40, radius: 0,
    });
    const b = button({
      label: 'B',
      onClick: () => {},
      width: 50, height: 40, radius: 0,
    });
    b.transform.x = 200;
    b.bounds = null;
    const root = node(null);
    root.children.push(a, b);
    a.parent = root;
    b.parent = root;
    const s = scene({ particleCount: 16 }, root);
    s.tick(0);
    const w = new World({ width: 100, height: 100 });
    w.addParticles(
      spawn({
        n: 16,
        origin: { kind: 'point', x: 0, y: 0 },
        color: TRANSPARENT,
      }),
    );
    s.bindAll(w.particles, { kind: 'equal' });

    // Capture b's starting tz values — button places its text leaf at z=1
    // internally so particles bound to it have tz=1 (not 0). What matters
    // here isn't the absolute value, only that popTo3D(a) doesn't touch b.
    const bIndices = s.indicesForSubtree(b);
    const bTzBefore = bIndices.map((i) => w.particles[i].tz);
    popTo3D({ scene: s, subtree: a, particles: w.particles, tz: 3 });
    for (const i of s.indicesForSubtree(a)) expect(w.particles[i].tz).toBe(3);
    for (let k = 0; k < bIndices.length; k++) {
      expect(w.particles[bIndices[k]].tz).toBe(bTzBefore[k]);
    }
  });

  it('returns a reset() that restores tz to restTz (default 0)', () => {
    const { s, btn, particles } = setup();
    const handle = popTo3D({ scene: s, subtree: btn, particles, tz: 5 });
    const indices = s.indicesForSubtree(btn);
    for (const i of indices) expect(particles[i].tz).toBe(5);
    handle.reset();
    for (const i of indices) expect(particles[i].tz).toBe(0);
  });

  it('restTz override is honored', () => {
    const { s, btn, particles } = setup();
    const handle = popTo3D({
      scene: s, subtree: btn, particles, tz: 5, restTz: 2,
    });
    handle.reset();
    for (const i of s.indicesForSubtree(btn)) expect(particles[i].tz).toBe(2);
  });

  it('holdMs triggers auto-restore after the timeout', () => {
    const { s, btn, particles } = setup();
    popTo3D({ scene: s, subtree: btn, particles, tz: 5, holdMs: 300 });
    const indices = s.indicesForSubtree(btn);
    for (const i of indices) expect(particles[i].tz).toBe(5);
    vi.advanceTimersByTime(299);
    for (const i of indices) expect(particles[i].tz).toBe(5);
    vi.advanceTimersByTime(1);
    for (const i of indices) expect(particles[i].tz).toBe(0);
  });

  it('reset() cancels a pending auto-restore timer', () => {
    const { s, btn, particles } = setup();
    const handle = popTo3D({
      scene: s, subtree: btn, particles, tz: 5, holdMs: 300,
    });
    handle.reset();
    const indices = s.indicesForSubtree(btn);
    for (const i of indices) expect(particles[i].tz).toBe(0);
    // Advancing the timer shouldn't do anything — the callback was cleared.
    vi.advanceTimersByTime(500);
    for (const i of indices) expect(particles[i].tz).toBe(0);
  });

  it('reset() is idempotent (safe to call multiple times)', () => {
    const { s, btn, particles } = setup();
    const handle = popTo3D({ scene: s, subtree: btn, particles, tz: 5 });
    expect(() => {
      handle.reset();
      handle.reset();
      handle.reset();
    }).not.toThrow();
  });

  it('skips dead particles (life <= 0)', () => {
    const { s, btn, particles } = setup();
    const indices = s.indicesForSubtree(btn);
    // Kill one particle before the pop. Its tz should stay at 0.
    particles[indices[0]].life = 0;
    popTo3D({ scene: s, subtree: btn, particles, tz: 5 });
    expect(particles[indices[0]].tz).toBe(0);
    expect(particles[indices[1]].tz).toBe(5);
  });
});
