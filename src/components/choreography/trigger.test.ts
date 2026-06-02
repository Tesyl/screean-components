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
import { createChoreoRunner } from './runner';
import { pipe } from './pipeline';
import { onEvent, onState } from './trigger';
import type { Effect } from './effect';

beforeAll(installOffscreenCanvasStub);
afterAll(uninstallOffscreenCanvasStub);
beforeEach(() => {
  __resetNodeIds();
  __resetComponentIds();
  vi.useFakeTimers();
  // performance.now is consulted by trigger.run; lock it to 0 then advance
  // explicitly via setSystemTime so onEvent's now-stamp is deterministic.
  vi.setSystemTime(new Date(0));
});
afterEach(() => {
  vi.useRealTimers();
});

const setup = () => {
  const consumerCalls: string[] = [];
  const btn = button({
    label: 'Go',
    onClick: () => consumerCalls.push('consumer'),
  });
  const s = scene({ particleCount: 4 }, btn);
  s.tick(0);
  const w = new World({ width: 100, height: 100 });
  w.addParticles(
    spawn({ n: 4, origin: { kind: 'point', x: 0, y: 0 }, color: TRANSPARENT }),
  );
  s.bindAll(w.particles, { kind: 'equal' });
  const runner = createChoreoRunner({
    scene: s,
    world: w as unknown as Parameters<typeof createChoreoRunner>[0]["world"],
    particles: w.particles,
    mirrorHost: document.createElement('div'),
  });
  return { btn, runner, consumerCalls };
};

const counter = (duration: number): Effect & { count: () => number } => {
  let calls = 0;
  return {
    scope: 'particle',
    duration,
    tick: () => {
      calls++;
    },
    count: () => calls,
  } as ReturnType<typeof counter>;
};

describe('onEvent', () => {
  it('fires the pipeline alongside the consumer handler', () => {
    const { btn, runner, consumerCalls } = setup();
    const c = counter(0);
    onEvent(runner, btn, 'onClick', pipe(c));
    runner.tick(0);
    btn._component.handlers.onClick?.({} as never);
    runner.tick(0);
    expect(consumerCalls).toEqual(['consumer']);
    expect(c.count()).toBe(1);
  });

  it('dispose() restores the original handler', () => {
    const { btn, runner, consumerCalls } = setup();
    const original = btn._component.handlers.onClick;
    const c = counter(0);
    const handle = onEvent(runner, btn, 'onClick', pipe(c));
    handle.dispose();
    expect(btn._component.handlers.onClick).toBe(original);
    runner.tick(0);
    btn._component.handlers.onClick?.({} as never);
    runner.tick(0);
    expect(consumerCalls).toEqual(['consumer']);
    expect(c.count()).toBe(0); // pipeline did NOT fire after dispose
  });

  it('two onEvents on the same key chain (both pipelines fire)', () => {
    const { btn, runner } = setup();
    const a = counter(0);
    const b = counter(0);
    onEvent(runner, btn, 'onClick', pipe(a));
    onEvent(runner, btn, 'onClick', pipe(b));
    runner.tick(0);
    btn._component.handlers.onClick?.({} as never);
    runner.tick(0);
    expect(a.count()).toBe(1);
    expect(b.count()).toBe(1);
  });
});

describe('onState', () => {
  it('does NOT fire on initial registration regardless of predicate value', () => {
    const { btn, runner } = setup();
    const enter = counter(0);
    const exit = counter(0);
    onState(runner, btn, () => true, { enter: pipe(enter), exit: pipe(exit) });
    runner.tick(0);
    expect(enter.count()).toBe(0);
    expect(exit.count()).toBe(0);
  });

  it('fires enter on rising edge (false → true)', () => {
    const { btn, runner } = setup();
    let value = false;
    const enter = counter(0);
    const exit = counter(0);
    onState(runner, btn, () => value, {
      enter: pipe(enter),
      exit: pipe(exit),
    });
    runner.tick(0);
    expect(enter.count()).toBe(0);
    value = true;
    runner.tick(16);
    expect(enter.count()).toBe(1);
    expect(exit.count()).toBe(0);
  });

  it('fires exit on falling edge (true → false)', () => {
    const { btn, runner } = setup();
    let value = true;
    const enter = counter(0);
    const exit = counter(0);
    onState(runner, btn, () => value, {
      enter: pipe(enter),
      exit: pipe(exit),
    });
    runner.tick(0); // baseline true
    value = false;
    runner.tick(16);
    expect(exit.count()).toBe(1);
    expect(enter.count()).toBe(0);
  });

  it('does not fire while predicate stays the same', () => {
    const { btn, runner } = setup();
    const enter = counter(0);
    const exit = counter(0);
    onState(runner, btn, () => true, { enter: pipe(enter), exit: pipe(exit) });
    runner.tick(0);
    runner.tick(16);
    runner.tick(32);
    runner.tick(48);
    expect(enter.count()).toBe(0);
    expect(exit.count()).toBe(0);
  });
});
