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
import { wait } from './wait';
import { setTz } from './setTz';
import { setMirrorOpacity, setMirrorPointerEvents } from './setMirror';
import { captureStarts, type CapturedStarts } from './captureStarts';
import { easeToTargets } from './easeToTargets';
import { pinToTargets } from './pinToTargets';

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
  const host = document.createElement('div');
  const mirror = document.createElement('div');
  mirror.setAttribute('data-component-id', btn._component.id);
  host.appendChild(mirror);
  document.body.appendChild(host);
  const runner = createChoreoRunner({
    scene: s,
    world: w as unknown as Parameters<typeof createChoreoRunner>[0]['world'],
    particles: w.particles,
    mirrorHost: host,
  });
  return { btn, runner, mirror, particles: w.particles };
};

describe('wait', () => {
  it('declares a duration but does not mutate particles', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    const before = particles.map((p) => ({ x: p.x, y: p.y, color: p.color }));
    runner.run(pipe(wait(100)), groupOfComponent(btn), btn);
    runner.tick(0);
    runner.tick(50);
    runner.tick(100);
    for (let i = 0; i < particles.length; i++) {
      expect(particles[i].x).toBe(before[i].x);
      expect(particles[i].color).toBe(before[i].color);
    }
  });

  it('composes inside pipe — sequential timing is preserved', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(
      pipe(setTz({ to: 5 }), wait(100), setTz({ to: 0 })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(particles[0].tz).toBe(5);
    runner.tick(50);
    expect(particles[0].tz).toBe(5);
    runner.tick(100);
    expect(particles[0].tz).toBe(0);
  });
});

describe('setTz', () => {
  it('writes tz across the group', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    runner.run(pipe(setTz({ to: 7 })), groupOfComponent(btn), btn);
    runner.tick(0);
    for (const p of particles) expect(p.tz).toBe(7);
  });

  it('skips dead particles', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    particles[0].life = 0;
    particles[0].tz = 99;
    runner.run(pipe(setTz({ to: 3 })), groupOfComponent(btn), btn);
    runner.tick(0);
    expect(particles[0].tz).toBe(99);
    expect(particles[1].tz).toBe(3);
  });
});

describe('setMirrorOpacity / setMirrorPointerEvents', () => {
  it('writes opacity from ctx.component when no explicit target is given', () => {
    const { runner, btn, mirror } = setup();
    runner.tick(0);
    runner.run(pipe(setMirrorOpacity({ to: 0.3 })), groupOfComponent(btn), btn);
    runner.tick(0);
    expect(mirror.style.opacity).toBe('0.3');
  });

  it('writes pointerEvents', () => {
    const { runner, btn, mirror } = setup();
    runner.tick(0);
    runner.run(
      pipe(setMirrorPointerEvents({ to: 'none' })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(mirror.style.pointerEvents).toBe('none');
  });

  it('no-ops silently when neither target nor ctx.component is set', () => {
    const { runner, btn, mirror } = setup();
    runner.tick(0);
    // No component passed to runner.run — falls through.
    expect(() => {
      runner.run(pipe(setMirrorOpacity({ to: 0 })), groupOfComponent(btn));
      runner.tick(0);
    }).not.toThrow();
    expect(mirror.style.opacity).toBe('');
  });
});

describe('captureStarts', () => {
  it('snapshots (x, y) into ctx.state under the given key', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    particles.forEach((p, i) => {
      p.x = i * 10;
      p.y = i * 5;
    });
    // We can't read ctx.state directly from outside the effect; chain
    // captureStarts with a follower that asserts and forwards.
    let captured: CapturedStarts | null = null;
    runner.run(
      pipe(captureStarts({ key: 'snap' }), {
        scope: 'particle' as const,
        duration: 0,
        tick: (_indices: readonly number[], ctx) => {
          captured = (ctx.state as Record<string, CapturedStarts>).snap;
        },
      }),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(captured).not.toBeNull();
    const snap = captured!;
    for (let i = 0; i < particles.length; i++) {
      expect(snap.startsX[i]).toBeCloseTo(particles[i].x);
    }
  });
});

describe('easeToTargets', () => {
  it('lerps from start to target over duration with linear easing', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    // Force known starts and targets.
    particles.forEach((p) => {
      p.x = 0;
      p.y = 0;
      p.tx = 100;
      p.ty = 50;
    });
    runner.run(
      pipe(easeToTargets({ duration: 100, easing: easing.linear })),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0); // captures starts + lerp 0
    runner.tick(50); // lerp 0.5
    expect(particles[0].x).toBeCloseTo(50);
    expect(particles[0].y).toBeCloseTo(25);
    runner.tick(100); // lerp 1
    expect(particles[0].x).toBeCloseTo(100);
    expect(particles[0].y).toBeCloseTo(50);
  });

  it('reads starts from a prior captureStarts({key}) when fromKey is given', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    particles.forEach((p) => {
      p.x = 10;
      p.y = 10;
      p.tx = 60;
      p.ty = 60;
    });
    runner.run(
      pipe(
        captureStarts({ key: 'phase1' }),
        easeToTargets({ duration: 100, easing: easing.linear, fromKey: 'phase1' }),
      ),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0); // capture happens first stage; ease starts immediately
    runner.tick(50);
    expect(particles[0].x).toBeCloseTo(35); // 10 + 0.5*(60-10)
    runner.tick(100);
    expect(particles[0].x).toBeCloseTo(60);
  });
});

describe('pinToTargets', () => {
  it('snaps every particle to (tx, ty) and zeros velocity', () => {
    const { runner, btn, particles } = setup();
    runner.tick(0);
    particles.forEach((p, i) => {
      p.x = i;
      p.y = i;
      p.vx = 99;
      p.vy = 99;
      p.tx = 100;
      p.ty = 200;
    });
    runner.run(pipe(pinToTargets()), groupOfComponent(btn), btn);
    runner.tick(0);
    for (const p of particles) {
      expect(p.x).toBe(100);
      expect(p.y).toBe(200);
      expect(p.vx).toBe(0);
      expect(p.vy).toBe(0);
    }
  });
});
