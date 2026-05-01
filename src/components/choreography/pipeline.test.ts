import { describe, expect, it } from 'vitest';
import { at, pipe, type Pipeline } from './pipeline';
import type { Effect, EffectCtx } from './effect';

// Test fixtures: lightweight effects that record their tick calls.
const recorder = (
  duration: number,
): Effect & { calls: Array<{ t: number; dt: number }>; ended: boolean } => {
  const calls: Array<{ t: number; dt: number }> = [];
  let ended = false;
  return {
    scope: 'particle',
    duration,
    tick: (_, ctx) => calls.push({ t: ctx.t, dt: ctx.dt }),
    onEnd: () => {
      ended = true;
    },
    get calls() {
      return calls;
    },
    get ended() {
      return ended;
    },
  } as ReturnType<typeof recorder>;
};

describe('pipe()', () => {
  it('places a single effect at startMs 0', () => {
    const a = recorder(100);
    const p = pipe(a);
    expect(p.stages).toHaveLength(1);
    expect(p.stages[0].startMs).toBe(0);
    expect(p.duration).toBe(100);
  });

  it('places multiple effects sequentially by default', () => {
    const a = recorder(100);
    const b = recorder(200);
    const c = recorder(50);
    const p = pipe(a, b, c);
    expect(p.stages.map((s) => s.startMs)).toEqual([0, 100, 300]);
    expect(p.duration).toBe(350);
  });

  it('honors at() for absolute placement without advancing the cursor', () => {
    const a = recorder(100);
    const b = recorder(200);
    const p = pipe(a, at(50, b));
    // a placed sequentially at 0; b at 50 (overlapping with a)
    expect(p.stages.map((s) => s.startMs)).toEqual([0, 50]);
    expect(p.duration).toBe(250); // max(0+100, 50+200)
  });

  it('flattens a sequential nested pipeline by re-offsetting its stages', () => {
    const a = recorder(100);
    const b = recorder(50);
    const c = recorder(80);
    const inner = pipe(b, c); // duration 130, stages at 0 and 50
    const outer = pipe(a, inner);
    // a at 0; inner re-offset by 100 (a.duration) → b at 100, c at 150
    expect(outer.stages.map((s) => s.startMs)).toEqual([0, 100, 150]);
    expect(outer.duration).toBe(230);
  });

  it('runs at(0, x) stages in parallel', () => {
    const a = recorder(100);
    const b = recorder(150);
    const p = pipe(at(0, a), at(0, b));
    expect(p.stages.map((s) => s.startMs)).toEqual([0, 0]);
    expect(p.duration).toBe(150); // max(100, 150)
  });

  it('computes duration as max stage end time, not the sum', () => {
    const a = recorder(500);
    const b = recorder(100);
    const p = pipe(a, at(50, b));
    // a runs 0-500; b runs 50-150. Max end = 500.
    expect(p.duration).toBe(500);
  });

  it('sorts stages by startMs for monotonic activation', () => {
    const a = recorder(50);
    const b = recorder(50);
    const p = pipe(at(200, a), at(50, b));
    // Stages should be ordered by startMs ascending.
    const startTimes = p.stages.map((s) => s.startMs);
    expect(startTimes).toEqual([...startTimes].sort((x, y) => x - y));
  });

  it('returns a fresh Pipeline value each call (no shared mutation)', () => {
    const a = recorder(100);
    const p1 = pipe(a);
    const p2 = pipe(a);
    expect(p1).not.toBe(p2);
    expect(p1.stages).not.toBe(p2.stages);
  });
});

describe('at()', () => {
  it('wraps a single effect at the given offset', () => {
    const a = recorder(50);
    const p: Pipeline = at(200, a);
    expect(p.stages).toHaveLength(1);
    expect(p.stages[0].startMs).toBe(200);
    expect(p.duration).toBe(250);
  });

  it('re-offsets a wrapped pipeline by the offset amount', () => {
    const a = recorder(50);
    const b = recorder(80);
    const inner = pipe(a, b); // a at 0, b at 50, duration 130
    const wrapped = at(100, inner);
    expect(wrapped.stages.map((s) => s.startMs)).toEqual([100, 150]);
    expect(wrapped.duration).toBe(230);
  });
});

// Confirm EffectCtx shape compiles — purely a type-level test, but we
// instantiate one to catch accidental drift.
it('EffectCtx accepts the documented surface', () => {
  const ctx: EffectCtx = {
    particles: [],
    world: {} as EffectCtx['world'],
    scene: {} as EffectCtx['scene'],
    mirrorHost: {} as HTMLElement,
    t: 0,
    dt: 0,
    state: {},
  };
  expect(ctx.t).toBe(0);
});

it('EffectScope discriminant is exported and types primitives correctly', () => {
  // Compile-time assertion via construction — if scope drifts off the union
  // the assignment fails to type-check.
  const e: Effect = { scope: 'particle', duration: 0, tick: () => {} };
  expect(e.scope).toBe('particle');
});
