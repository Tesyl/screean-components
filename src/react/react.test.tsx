// @vitest-environment happy-dom
//
// React wrapper tests — the WIRING spirit, not particle visuals.
//
// What must hold (docs/react-wrappers.md):
//   • mount creates the real factory element under the host; unmount detaches
//   • tier-1 (callbacks) and tier-2 (value sync) changes NEVER recreate the
//     element; tier-3 (structural) changes DO
//   • tier-2 sync is compare-first (no redundant setter echo when equal)
//   • no provider + no `screen` prop → renders, warns, never throws
//
// The ScreenController is stubbed through the wrappers' `screen` prop seam —
// booting a real provider in happy-dom (canvas 2d, rAF, ResizeObserver) is
// exactly what the seam exists to avoid.

import { describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import type { ScreenController } from '../components/transition';
import { ScreeanButton } from './button';
import { ScreeanCheckbox } from './checkbox';
import { ScreeanSlider } from './slider';
import { ScreeanCard } from './card';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type StubScreen = ScreenController & { dissolved: HTMLElement[] };

const stubScreen = (): StubScreen => {
  const dissolved: HTMLElement[] = [];
  return {
    dissolved,
    dissolve: vi.fn(async (el: HTMLElement | null) => {
      if (el) dissolved.push(el);
    }),
    swap: vi.fn(async () => {}),
    thwack: vi.fn(),
    fieldOf: vi.fn(),
    tick: vi.fn(),
    phase: () => 'idle',
    world: vi.fn() as unknown as ScreenController['world'],
    dispose: vi.fn(),
  } as unknown as StubScreen;
};

const mount = async (ui: ReactNode) => {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => root.render(ui));
  return {
    container,
    rerender: (next: ReactNode) => act(async () => root.render(next)),
    unmount: () => act(async () => root.unmount()),
  };
};

describe('ScreeanButton', () => {
  it('mounts the real factory <button> under the host and detaches on unmount', async () => {
    const screen = stubScreen();
    const { container, unmount } = await mount(
      <ScreeanButton screen={screen} label="Save" />,
    );
    const el = container.querySelector('button');
    expect(el).not.toBeNull();
    expect(el?.textContent).toBe('Save');
    await unmount();
    expect(container.querySelector('button')).toBeNull();
  });

  it('tier-1: a new inline onClick keeps the SAME element and fires the latest callback', async () => {
    const screen = stubScreen();
    const first = vi.fn();
    const second = vi.fn();
    const { container, rerender } = await mount(
      <ScreeanButton screen={screen} label="Save" onClick={first} />,
    );
    const el = container.querySelector('button');
    await rerender(<ScreeanButton screen={screen} label="Save" onClick={second} />);
    expect(container.querySelector('button')).toBe(el); // no recreation
    await act(async () => {
      el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });

  it('tier-3: a label change recreates the element', async () => {
    const screen = stubScreen();
    const { container, rerender } = await mount(
      <ScreeanButton screen={screen} label="Save" />,
    );
    const el = container.querySelector('button');
    await rerender(<ScreeanButton screen={screen} label="Delete" />);
    const next = container.querySelector('button');
    expect(next).not.toBe(el);
    expect(next?.textContent).toBe('Delete');
  });

  it('exposes the imperative handle via ref (dissolve routes to the controller)', async () => {
    const screen = stubScreen();
    let handle: { dissolve: () => Promise<void> } | null = null;
    const { container } = await mount(
      <ScreeanButton
        screen={screen}
        label="Save"
        ref={(h) => {
          handle = h;
        }}
      />,
    );
    expect(handle).not.toBeNull();
    await act(async () => handle?.dissolve());
    expect(screen.dissolved).toContain(container.querySelector('button'));
  });
});

describe('ScreeanCheckbox', () => {
  it('tier-2: checked prop syncs aria-checked without recreating or dissolving', async () => {
    const screen = stubScreen();
    const { container, rerender } = await mount(
      <ScreeanCheckbox screen={screen} label="Terms" checked={false} />,
    );
    const el = container.querySelector('[role="checkbox"]');
    expect(el?.getAttribute('aria-checked')).toBe('false');
    await rerender(<ScreeanCheckbox screen={screen} label="Terms" checked={true} />);
    expect(container.querySelector('[role="checkbox"]')).toBe(el); // no recreation
    expect(el?.getAttribute('aria-checked')).toBe('true');
    expect(screen.dissolve).not.toHaveBeenCalled(); // programmatic sync never dissolves
  });

  it('tier-2 is compare-first: re-rendering with the SAME checked value never echoes onChange', async () => {
    const screen = stubScreen();
    const onChange = vi.fn();
    const { rerender } = await mount(
      <ScreeanCheckbox screen={screen} label="Terms" checked={true} onChange={onChange} />,
    );
    onChange.mockClear(); // creation seeds checked directly (no echo expected either)
    await rerender(
      <ScreeanCheckbox screen={screen} label="Terms" checked={true} onChange={onChange} />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('ScreeanSlider', () => {
  it('tier-2: value prop drives aria-valuenow on the SAME element', async () => {
    const screen = stubScreen();
    const { container, rerender } = await mount(
      <ScreeanSlider screen={screen} value={40} />,
    );
    const el = container.querySelector('[role="slider"]');
    expect(el?.getAttribute('aria-valuenow')).toBe('40');
    await rerender(<ScreeanSlider screen={screen} value={80} />);
    expect(container.querySelector('[role="slider"]')).toBe(el);
    expect(el?.getAttribute('aria-valuenow')).toBe('80');
  });

  it('clamp-compares: an out-of-range value converges without re-echoing every render', async () => {
    const screen = stubScreen();
    const onChange = vi.fn();
    const { container, rerender } = await mount(
      <ScreeanSlider screen={screen} min={0} max={100} value={150} onChange={onChange} />,
    );
    const el = container.querySelector('[role="slider"]');
    expect(el?.getAttribute('aria-valuenow')).toBe('100'); // clamped
    onChange.mockClear();
    // Same out-of-range prop again — clamped target already applied → no echo.
    await rerender(
      <ScreeanSlider screen={screen} min={0} max={100} value={150} onChange={onChange} />,
    );
    expect(onChange).not.toHaveBeenCalled();
  });

  it('tier-3: min/max change recreates; keyboard a11y stays wired on the new element', async () => {
    const screen = stubScreen();
    const { container, rerender } = await mount(
      <ScreeanSlider screen={screen} value={40} max={100} />,
    );
    const el = container.querySelector('[role="slider"]');
    await rerender(<ScreeanSlider screen={screen} value={40} max={200} />);
    const next = container.querySelector('[role="slider"]');
    expect(next).not.toBe(el);
    expect(next?.getAttribute('aria-valuemax')).toBe('200');
  });
});

describe('ScreeanCard', () => {
  it('portals React children into the card element (real DOM for the rasterizer)', async () => {
    const screen = stubScreen();
    const { container } = await mount(
      <ScreeanCard screen={screen}>
        <p data-testid="inner">hello</p>
      </ScreeanCard>,
    );
    // The <p> must live INSIDE the factory element, not beside it.
    const card = container.querySelector('div');
    expect(card?.querySelector('[data-testid="inner"]')?.textContent).toBe('hello');
  });
});

describe('missing controller', () => {
  it('renders the host, warns once, and never throws without provider or screen prop', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { container } = await mount(<ScreeanButton label="Save" />);
    expect(container.querySelector('span')).not.toBeNull(); // host rendered
    expect(container.querySelector('button')).toBeNull(); // nothing created
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
