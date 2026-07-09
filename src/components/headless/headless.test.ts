// @vitest-environment happy-dom
//
// Headless component behavior tests.
//
// Core functionality under test (spirit, not implementation details):
//   button — activation runs business logic on the live element, gates on
//            transition phase, and the element is natively accessible.
//   slider — value math is total over (min,max,step) combinations; keyboard
//            and pointer gestures move the value per the ARIA slider
//            contract; ARIA attributes track the value; live-dom strategy.
//
// The ScreenController is stubbed: these are component tests, not engine
// tests — the controller's own cycle is covered by transition/machine.test.

import { describe, expect, it, vi } from 'vitest';
import type { ScreenController, TransitionPhaseKind } from '../transition';
import { headlessButton } from './button';
import { clampToStep, headlessSlider, valueFromPointer } from './slider';

// Stub controller. `setHold(true)` makes dissolve() return a promise that
// stays pending until `flush()` — lets tests hold a transition open and
// observe the per-element guard. `phase` is kept for the legacy stub shape
// but the factories no longer gate on it (that was the global-blocking bug).
type StubScreen = ScreenController & {
  dissolved: HTMLElement[];
  setHold: (v: boolean) => void;
  flush: () => void;
};

const stubScreen = (phase: TransitionPhaseKind = 'idle'): StubScreen => {
  const dissolved: HTMLElement[] = [];
  let hold = false;
  let pending: Array<() => void> = [];
  return {
    dissolved,
    setHold: (v: boolean) => { hold = v; },
    flush: () => { const p = pending; pending = []; p.forEach((r) => r()); },
    dissolve: vi.fn((el: HTMLElement | null) => {
      if (el) dissolved.push(el);
      return hold ? new Promise<void>((res) => pending.push(res)) : Promise.resolve();
    }),
    swap: vi.fn(async () => {}),
    thwack: vi.fn(),
    fieldOf: vi.fn(),
    tick: vi.fn(),
    phase: () => phase,
    world: vi.fn() as unknown as ScreenController['world'],
    dispose: vi.fn(),
  } as unknown as StubScreen;
};

const flushMicrotasks = () => new Promise((r) => setTimeout(r, 0));

// ─── button ──────────────────────────────────────────────────────────────────

describe('headlessButton', () => {
  it('is a real, natively accessible <button> — no mirror needed', () => {
    const b = headlessButton({ screen: stubScreen(), label: 'Save', onClick: () => {} });
    expect(b.el.tagName).toBe('BUTTON');
    expect(b.el.type).toBe('button');
    expect(b.el.getAttribute('aria-label')).toBe('Save');
    expect(b.strategy).toBe('rasterize');
  });

  it('activation runs business onClick first, then dissolves', () => {
    const screen = stubScreen();
    const order: string[] = [];
    const b = headlessButton({
      screen,
      label: 'Go',
      onClick: () => order.push('onClick'),
    });
    screen.dissolve = vi.fn(async () => {
      order.push('dissolve');
    }) as ScreenController['dissolve'];
    b.el.click();
    expect(order).toEqual(['onClick', 'dissolve']);
  });

  it('does not dissolve when dissolveOnActivate is false', () => {
    const screen = stubScreen();
    const onClick = vi.fn();
    const b = headlessButton({ screen, label: 'Plain', onClick, dissolveOnActivate: false });
    b.el.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.dissolve).not.toHaveBeenCalled();
  });

  it('blocks re-activating ITSELF mid-cycle, never other elements, and frees on settle', async () => {
    // The core fix: one element being mid-dissolve must NOT block the rest of
    // the UI. Hold A's dissolve open and prove B still activates.
    const screen = stubScreen();
    screen.setHold(true);
    const aClicks = vi.fn();
    const bClicks = vi.fn();
    const a = headlessButton({ screen, label: 'A', onClick: aClicks });
    const b = headlessButton({ screen, label: 'B', onClick: bClicks });

    a.el.click();
    expect(aClicks).toHaveBeenCalledOnce();
    expect(a.isTransitioning()).toBe(true);

    a.el.click(); // A is mid-cycle → re-activation blocked
    expect(aClicks).toHaveBeenCalledOnce();

    b.el.click(); // B is independent → activates even though A is transitioning
    expect(bClicks).toHaveBeenCalledOnce();
    expect(b.isTransitioning()).toBe(true);

    screen.flush(); // A + B settle
    await flushMicrotasks();
    expect(a.isTransitioning()).toBe(false);
    a.el.click(); // clickable again
    expect(aClicks).toHaveBeenCalledTimes(2);
  });

  it('disabled button never fires and is marked for the a11y tree', () => {
    const onClick = vi.fn();
    const b = headlessButton({
      screen: stubScreen(),
      label: 'Nope',
      onClick,
      disabled: true,
    });
    b.el.click();
    expect(onClick).not.toHaveBeenCalled();
    expect(b.el.getAttribute('aria-disabled')).toBe('true');
  });

  it('dispose removes the element and its listeners', () => {
    const onClick = vi.fn();
    const screen = stubScreen();
    const b = headlessButton({ screen, label: 'Bye', onClick });
    document.body.appendChild(b.el);
    b.dispose();
    expect(b.el.isConnected).toBe(false);
    b.el.click();
    expect(onClick).not.toHaveBeenCalled();
  });
});

// ─── slider value math (pure, combinatorial) ────────────────────────────────

describe('slider value math', () => {
  // Combinations across range shapes: zero-based, offset, negative, float step.
  const CASES = [
    { min: 0, max: 100, step: 1 },
    { min: 10, max: 20, step: 2 },
    { min: -50, max: 50, step: 5 },
    { min: 0, max: 1, step: 0.1 },
  ] as const;

  it('clampToStep is total: any raw input lands in [min,max] on a step', () => {
    for (const { min, max, step } of CASES) {
      for (const raw of [min - 1000, min, (min + max) / 2 + 0.3, max, max + 1000]) {
        const v = clampToStep(raw, min, max, step);
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
        // On-step (within float tolerance).
        const steps = (v - min) / step;
        expect(Math.abs(steps - Math.round(steps))).toBeLessThan(1e-9);
      }
    }
  });

  it('valueFromPointer maps track extremes to min/max and is monotonic', () => {
    const rect = { left: 100, width: 200 };
    for (const { min, max, step } of CASES) {
      expect(valueFromPointer(100, rect, min, max, step)).toBe(min);
      expect(valueFromPointer(300, rect, min, max, step)).toBe(max);
      expect(valueFromPointer(-1e6, rect, min, max, step)).toBe(min); // off-track clamps
      expect(valueFromPointer(1e6, rect, min, max, step)).toBe(max);
      const mid = valueFromPointer(200, rect, min, max, step);
      expect(mid).toBeGreaterThanOrEqual(min);
      expect(mid).toBeLessThanOrEqual(max);
    }
  });

  it('degenerate track (width 0) resolves to min, never NaN', () => {
    expect(valueFromPointer(123, { left: 0, width: 0 }, 0, 100, 1)).toBe(0);
  });
});

// ─── slider component (gesture + ARIA contract) ─────────────────────────────

describe('headlessSlider', () => {
  it('exposes the full ARIA slider contract and live-dom strategy', () => {
    const s = headlessSlider({ screen: stubScreen(), value: 30, min: 0, max: 100 });
    expect(s.el.getAttribute('role')).toBe('slider');
    expect(s.el.tabIndex).toBe(0);
    expect(s.el.getAttribute('aria-valuemin')).toBe('0');
    expect(s.el.getAttribute('aria-valuemax')).toBe('100');
    expect(s.el.getAttribute('aria-valuenow')).toBe('30');
    expect(s.strategy).toBe('live-dom');
  });

  it('keyboard contract: arrows step, Home/End jump, value clamps at edges', () => {
    const changes: number[] = [];
    const s = headlessSlider({
      screen: stubScreen(),
      value: 50,
      min: 0,
      max: 100,
      step: 10,
      onChange: (v) => changes.push(v),
    });
    const key = (k: string) =>
      s.el.dispatchEvent(new KeyboardEvent('keydown', { key: k, cancelable: true }));
    key('ArrowRight');
    key('ArrowUp');
    key('ArrowLeft');
    key('End');
    key('ArrowRight'); // clamped at max — no change event
    key('Home');
    expect(changes).toEqual([60, 70, 60, 100, 0]);
    expect(s.el.getAttribute('aria-valuenow')).toBe('0');
  });

  it('setValue drives the slider externally and re-renders ARIA + visuals', () => {
    const s = headlessSlider({ screen: stubScreen(), min: 0, max: 10, step: 1 });
    s.setValue(7);
    expect(s.value()).toBe(7);
    expect(s.el.getAttribute('aria-valuenow')).toBe('7');
    const fill = s.el.querySelector('[data-part="fill"]') as HTMLElement;
    expect(fill.style.width).toBe('70.000%');
    s.setValue(99); // out of range — clamps, doesn't throw
    expect(s.value()).toBe(10);
  });

  it('inners are real, rasterizable child elements (track/fill/thumb)', () => {
    const s = headlessSlider({ screen: stubScreen() });
    for (const part of ['track', 'fill', 'thumb']) {
      expect(s.el.querySelector(`[data-part="${part}"]`)).not.toBeNull();
    }
  });

  it('drag is blocked while the slider\'s OWN cycle is in flight', () => {
    const screen = stubScreen();
    screen.setHold(true);
    const changes: number[] = [];
    const s = headlessSlider({ screen, value: 50, min: 0, max: 100, onChange: (v) => changes.push(v) });
    void s.dissolve(); // own cycle → guard busy (held)
    expect(s.isTransitioning()).toBe(true);
    // Gated path returns before any commit (happy-dom track width is 0, so a
    // proceeding drag would commit to min=0 ≠ 50 and fire onChange).
    s.el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, bubbles: true }));
    expect(changes).toEqual([]);
    screen.flush();
  });

  it('drag is NOT blocked by another element\'s transition', () => {
    const screen = stubScreen();
    screen.setHold(true);
    const other = headlessButton({ screen, label: 'X', onClick: () => {} });
    other.el.click(); // held mid-transition
    expect(other.isTransitioning()).toBe(true);

    const changes: number[] = [];
    const s = headlessSlider({ screen, value: 50, min: 0, max: 100, onChange: (v) => changes.push(v) });
    // happy-dom may not implement pointer capture — stub so the drag path runs.
    s.el.setPointerCapture = (_id: number) => {};
    s.el.hasPointerCapture = (_id: number) => false;
    s.el.releasePointerCapture = (_id: number) => {};
    s.el.dispatchEvent(new PointerEvent('pointerdown', { clientX: 0, bubbles: true }));
    expect(changes).toEqual([0]); // proceeds despite `other` transitioning
    screen.flush();
  });

  it('disabled slider is out of the tab order and inert', () => {
    const changes: number[] = [];
    const s = headlessSlider({
      screen: stubScreen(),
      disabled: true,
      onChange: (v) => changes.push(v),
    });
    expect(s.el.tabIndex).toBe(-1);
    s.el.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true }));
    expect(changes).toEqual([]);
  });
});
