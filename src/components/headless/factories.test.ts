// @vitest-environment happy-dom
//
// Behavior tests for the remaining headless factories. Spirit under test:
//   - checked-state controls (checkbox / switch / radio) follow the
//     activation contract: flip → repaint → onChange → dissolve captures
//     the NEW state.
//   - radio groups are mutually exclusive; only the activated radio
//     dissolves.
//   - textField is live-dom: typing never dissolves, commit does.
//   - every factory exposes the right ARIA contract on a real element.

import { describe, expect, it, vi } from 'vitest';
import type { ScreenController, TransitionPhaseKind } from '../transition';
import { headlessCheckbox } from './checkbox';
import { headlessToggle } from './toggle';
import { createRadioGroup } from './radio';
import { headlessLabel } from './label';
import { headlessCard } from './card';
import { headlessTextField } from './textField';
import { headlessImage } from './image';

// `setHold(true)` holds dissolve() pending until `flush()` — lets tests
// exercise the per-element transition guard (a control blocks re-activating
// itself mid-cycle, but never blocks other elements).
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

describe('headlessCheckbox', () => {
  it('activation flips state, repaints, reports, then dissolves the new visual', async () => {
    const screen = stubScreen();
    const changes: boolean[] = [];
    const cb = headlessCheckbox({
      screen,
      label: 'Notify me',
      onChange: (c) => changes.push(c),
    });
    expect(cb.el.getAttribute('aria-checked')).toBe('false');
    cb.el.click();
    expect(cb.checked()).toBe(true);
    expect(cb.el.getAttribute('aria-checked')).toBe('true'); // repainted BEFORE dissolve
    expect(changes).toEqual([true]);
    expect(screen.dissolved).toEqual([cb.el]);
    // The control is mid-cycle until its dissolve settles — a real user can't
    // re-toggle particles. Let it settle, then the next click un-checks.
    await flushMicrotasks();
    cb.el.click();
    expect(cb.checked()).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('setChecked is programmatic sync — no dissolve, no double-fire', () => {
    const screen = stubScreen();
    const cb = headlessCheckbox({ screen, label: 'X' });
    cb.setChecked(true);
    cb.setChecked(true); // dedupe
    expect(cb.checked()).toBe(true);
    expect(screen.dissolved).toEqual([]);
  });
});

describe('headlessToggle', () => {
  it('is a switch with the same activation contract', () => {
    const screen = stubScreen();
    const t = headlessToggle({ screen, ariaLabel: 'Dark mode' });
    expect(t.el.getAttribute('role')).toBe('switch');
    expect(t.el.getAttribute('aria-label')).toBe('Dark mode');
    t.el.click();
    expect(t.checked()).toBe(true);
    expect(screen.dissolved).toEqual([t.el]);
  });

  it('blocks re-activating itself mid-cycle, but not while OTHER elements transition', () => {
    const screen = stubScreen();
    screen.setHold(true);
    const t = headlessToggle({ screen, ariaLabel: 'A' });

    // Some other element is mid-transition — must not block this toggle.
    const other = headlessToggle({ screen, ariaLabel: 'B' });
    other.el.click();
    expect(other.isTransitioning()).toBe(true);

    t.el.click(); // activates despite `other` being mid-cycle (the fix)
    expect(t.checked()).toBe(true);
    expect(t.isTransitioning()).toBe(true);

    t.el.click(); // its OWN cycle is in flight → re-activation blocked
    expect(t.checked()).toBe(true); // unchanged (no toggle back)

    screen.flush();
  });
});

describe('createRadioGroup', () => {
  const OPTIONS = [
    { label: 'Small', value: 's' },
    { label: 'Medium', value: 'm' },
    { label: 'Large', value: 'l' },
  ];

  it('is mutually exclusive; only the activated radio dissolves', () => {
    const screen = stubScreen();
    const picks: string[] = [];
    const g = createRadioGroup({ screen, options: OPTIONS, onChange: (v) => picks.push(v) });
    g.radios[1].el.click();
    expect(g.selected()).toBe('m');
    expect(g.radios.map((r) => r.checked())).toEqual([false, true, false]);
    expect(screen.dissolved).toEqual([g.radios[1].el]);
    g.radios[2].el.click();
    expect(g.selected()).toBe('l');
    expect(g.radios.map((r) => r.checked())).toEqual([false, false, true]);
    expect(picks).toEqual(['m', 'l']);
  });

  it('re-activating the selected radio is a no-op (no extra dissolve)', () => {
    const screen = stubScreen();
    const g = createRadioGroup({ screen, options: OPTIONS });
    g.radios[0].el.click();
    g.radios[0].el.click();
    expect(screen.dissolved).toHaveLength(1);
  });

  it('programmatic select() syncs without dissolving', () => {
    const screen = stubScreen();
    const g = createRadioGroup({ screen, options: OPTIONS });
    g.select('l');
    expect(g.selected()).toBe('l');
    expect(screen.dissolved).toEqual([]);
  });
});

describe('headlessTextField (live-dom)', () => {
  it('typing reports per keystroke but NEVER dissolves; commit dissolves', () => {
    const screen = stubScreen();
    const typed: string[] = [];
    const committed: string[] = [];
    const f = headlessTextField({
      screen,
      ariaLabel: 'Name',
      onInput: (v) => typed.push(v),
      onCommit: (v) => committed.push(v),
    });
    f.el.value = 'hi';
    f.el.dispatchEvent(new Event('input'));
    f.el.value = 'hiya';
    f.el.dispatchEvent(new Event('input'));
    expect(typed).toEqual(['hi', 'hiya']);
    expect(screen.dissolved).toEqual([]); // live interaction stays live
    f.el.dispatchEvent(new Event('change')); // settle (blur/Enter)
    expect(committed).toEqual(['hiya']);
    expect(screen.dissolved).toEqual([f.el]);
    expect(f.strategy).toBe('live-dom');
  });
});

describe('decorative factories', () => {
  it('label renders text/heading variants with the right semantics', () => {
    const screen = stubScreen();
    const l = headlessLabel({ screen, text: 'Plain' });
    const h = headlessLabel({ screen, text: 'Title', heading: true });
    expect(l.el.tagName).toBe('SPAN');
    expect(h.el.tagName).toBe('H2');
    expect(h.role).toBe('heading');
  });

  it('card composes real children and only activates when given onClick', () => {
    const screen = stubScreen();
    const child = document.createElement('p');
    const inert = headlessCard({ screen, children: [child] });
    expect(inert.el.contains(child)).toBe(true);
    inert.el.click();
    expect(screen.dissolved).toEqual([]);

    const onClick = vi.fn();
    const active = headlessCard({ screen, onClick });
    active.el.click();
    expect(onClick).toHaveBeenCalledOnce();
    expect(screen.dissolved).toEqual([active.el]);
  });

  it('image is a real <img> with mandatory alt', () => {
    const screen = stubScreen();
    const img = headlessImage({ screen, src: 'data:image/gif;base64,', alt: 'Logo' });
    expect(img.el.tagName).toBe('IMG');
    expect(img.el.alt).toBe('Logo');
    expect(img.strategy).toBe('rasterize');
  });
});
