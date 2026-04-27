// Reel — step cycler. Pure timer + state machine; no DOM.
//
// Vitest's fake timers let us advance time deterministically and verify
// the step-progression contract (enter fires once per step, onStep fires
// in the right order, looping wraps, scrub jumps, rate scales remaining
// time on a live step).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Reel, type ReelStep } from './Reel';

beforeEach(() => { vi.useFakeTimers(); });
afterEach(() => { vi.restoreAllMocks(); });

const mkStep = <C>(label: string, ms: number, enter: (c: C) => void = () => {}): ReelStep<C> => ({
  label,
  hint: '',
  ms,
  enter,
});

describe('Reel', () => {
  it('does not run on construction (paused by default)', () => {
    const enters: string[] = [];
    new Reel({
      steps: [mkStep<void>('A', 100, () => enters.push('A'))],
      ctx: undefined,
    });
    vi.advanceTimersByTime(500);
    expect(enters).toEqual([]);
  });

  it('plays through steps in order, looping', () => {
    const enters: string[] = [];
    const steps: ReelStep<void>[] = [
      mkStep('A', 100, () => enters.push('A')),
      mkStep('B', 200, () => enters.push('B')),
      mkStep('C', 50,  () => enters.push('C')),
    ];
    const reel = new Reel({ steps, ctx: undefined, loop: true });
    reel.play();
    // play() runs step 0 immediately.
    expect(enters).toEqual(['A']);
    vi.advanceTimersByTime(100); // A completes → B
    expect(enters).toEqual(['A', 'B']);
    vi.advanceTimersByTime(200); // B → C
    expect(enters).toEqual(['A', 'B', 'C']);
    vi.advanceTimersByTime(50);  // C → loop to A
    expect(enters).toEqual(['A', 'B', 'C', 'A']);
    reel.dispose();
  });

  it('stops at end when loop=false; fires onComplete', () => {
    const enters: string[] = [];
    const completed = vi.fn();
    const reel = new Reel({
      steps: [
        mkStep<void>('A', 100, () => enters.push('A')),
        mkStep<void>('B', 100, () => enters.push('B')),
      ],
      ctx: undefined,
      loop: false,
      onComplete: completed,
    });
    reel.play();
    vi.advanceTimersByTime(100); // A → B
    vi.advanceTimersByTime(100); // B → end (no wrap)
    expect(enters).toEqual(['A', 'B']);
    expect(completed).toHaveBeenCalledTimes(1);
    expect(reel.isPaused()).toBe(true);
    reel.dispose();
  });

  it('fires onStep once per step transition', () => {
    const onStep = vi.fn();
    const reel = new Reel({
      steps: [mkStep<void>('A', 100), mkStep<void>('B', 100)],
      ctx: undefined,
      onStep,
    });
    reel.play();
    expect(onStep).toHaveBeenCalledTimes(1);
    expect(onStep).toHaveBeenLastCalledWith(0, expect.objectContaining({ label: 'A' }));
    vi.advanceTimersByTime(100);
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(onStep).toHaveBeenLastCalledWith(1, expect.objectContaining({ label: 'B' }));
    reel.dispose();
  });

  it('pause halts auto-advance; play resumes from current step', () => {
    const enters: string[] = [];
    const reel = new Reel({
      steps: [
        mkStep<void>('A', 100, () => enters.push('A')),
        mkStep<void>('B', 100, () => enters.push('B')),
      ],
      ctx: undefined,
    });
    reel.play();
    expect(enters).toEqual(['A']);
    reel.pause();
    vi.advanceTimersByTime(500);
    expect(enters).toEqual(['A']); // never advanced
    reel.play();
    // play() re-enters the current step (idx 0). Some consumers want
    // a fresh re-fire on resume; this is the documented behavior.
    expect(enters).toEqual(['A', 'A']);
    reel.dispose();
  });

  it('scrub jumps to step idx and fires enter+onStep', () => {
    const enters: string[] = [];
    const onStep = vi.fn();
    const reel = new Reel({
      steps: [
        mkStep<void>('A', 100, () => enters.push('A')),
        mkStep<void>('B', 100, () => enters.push('B')),
        mkStep<void>('C', 100, () => enters.push('C')),
      ],
      ctx: undefined,
      onStep,
    });
    reel.scrub(2);
    expect(enters).toEqual(['C']);
    expect(reel.index()).toBe(2);
    expect(onStep).toHaveBeenCalledWith(2, expect.objectContaining({ label: 'C' }));
    reel.dispose();
  });

  it('scrub ignores out-of-range indices', () => {
    const enters: string[] = [];
    const reel = new Reel({
      steps: [mkStep<void>('A', 100, () => enters.push('A'))],
      ctx: undefined,
    });
    reel.scrub(-1);
    reel.scrub(5);
    expect(enters).toEqual([]);
    reel.dispose();
  });

  it('setRate scales remaining time on the current step', () => {
    const enters: string[] = [];
    const reel = new Reel({
      steps: [
        mkStep<void>('A', 200, () => enters.push('A')),
        mkStep<void>('B', 200, () => enters.push('B')),
      ],
      ctx: undefined,
    });
    reel.play();
    // 50ms in (1/4 done at rate 1.0 → 150ms remaining).
    vi.advanceTimersByTime(50);
    // Halve the rate: full step is now 400ms, elapsed-frac (0.25)
    // means new remaining = 0.75 * 400 = 300ms.
    reel.setRate(0.5);
    vi.advanceTimersByTime(150); // would have completed at rate 1.0
    expect(enters).toEqual(['A']);
    vi.advanceTimersByTime(150); // 300ms total post-rate-change → done
    expect(enters).toEqual(['A', 'B']);
    reel.dispose();
  });

  it('passes ctx through to enter', () => {
    type Ctx = { hits: string[] };
    const ctx: Ctx = { hits: [] };
    const reel = new Reel({
      steps: [
        { label: 'X', hint: '', ms: 100, enter: (c: Ctx) => c.hits.push('x') },
        { label: 'Y', hint: '', ms: 100, enter: (c: Ctx) => c.hits.push('y') },
      ],
      ctx,
    });
    reel.play();
    vi.advanceTimersByTime(100);
    expect(ctx.hits).toEqual(['x', 'y']);
    reel.dispose();
  });

  it('dispose halts and ignores subsequent calls', () => {
    const enters: string[] = [];
    const reel = new Reel({
      steps: [mkStep<void>('A', 100, () => enters.push('A'))],
      ctx: undefined,
    });
    reel.play();
    reel.dispose();
    reel.play();          // no-op
    reel.scrub(0);        // no-op
    vi.advanceTimersByTime(1000);
    expect(enters).toEqual(['A']); // only the original play() call
  });
});
