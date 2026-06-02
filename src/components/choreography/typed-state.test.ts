// @vitest-environment happy-dom
// Verifies tech debt #18 + #20 fixes — unique state keys per recipe / when
// invocation prevent cross-stage clobbering.

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
import { groupOfComponent } from './group';
import { pipe } from './pipeline';
import { defineEffect, type Effect, type EffectState } from './effect';
import { when } from './combinators';
import { collapsePipelineToEffect } from './effects/_recipe';

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
  return { btn, runner };
};

describe('defineEffect<S>', () => {
  it('types ctx.state inside the impl body', () => {
    type MyState = EffectState & {
      __mine?: { count: number };
    };
    let observed = -1;
    const counter: Effect = defineEffect<MyState>({
      scope: 'particle',
      duration: 0,
      tick: (_, ctx) => {
        // ctx.state is typed as MyState — autocomplete works on __mine.
        ctx.state.__mine = { count: (ctx.state.__mine?.count ?? 0) + 1 };
        observed = ctx.state.__mine.count;
      },
    });
    const { runner, btn } = setup();
    runner.tick(0);
    runner.run(pipe(counter), groupOfComponent(btn), btn);
    runner.tick(0);
    expect(observed).toBe(1);
  });
});

describe('when() unique-key isolation (debt #20)', () => {
  it('two when()-wrapped effects with opposite predicates do not clobber each other', () => {
    let aRan = false;
    let bRan = false;
    const a: Effect = defineEffect<EffectState>({
      scope: 'particle',
      duration: 0,
      tick: () => { aRan = true; },
    });
    const b: Effect = defineEffect<EffectState>({
      scope: 'particle',
      duration: 0,
      tick: () => { bRan = true; },
    });
    const { runner, btn } = setup();
    runner.tick(0);
    // Two when()s in one pipeline — old shared-key bug: both would resolve
    // to the SAME __whenAllow flag, so the second predicate would override
    // the first. With unique keys per call, each guards independently.
    runner.run(
      pipe(when(() => true, a), when(() => false, b)),
      groupOfComponent(btn),
      btn,
    );
    runner.tick(0);
    expect(aRan).toBe(true);
    expect(bRan).toBe(false);
  });
});

describe('recipe unique-key isolation (debt #18)', () => {
  it('nested recipes do not clobber each other\'s stage tracking', () => {
    const calls: string[] = [];
    const trace = (label: string): Effect =>
      defineEffect<EffectState>({
        scope: 'particle',
        duration: 0,
        tick: () => calls.push(label),
      });

    // Recipe A wraps two stages.
    const inner = collapsePipelineToEffect(pipe(trace('inner-1'), trace('inner-2')));
    // Recipe B wraps the inner recipe + an outer stage.
    const outer = collapsePipelineToEffect(pipe(inner, trace('outer-2')));

    const { runner, btn } = setup();
    runner.tick(0);
    runner.run(pipe(outer), groupOfComponent(btn), btn);
    runner.tick(0);
    expect(calls).toEqual(['inner-1', 'inner-2', 'outer-2']);
  });
});
