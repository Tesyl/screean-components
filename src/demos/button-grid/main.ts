// Components showcase — Pattern A (DOM-first) exemplar.
//
// Real DOM is the UI: a heading, a description, a 2×3 button grid (one
// disabled), and a slider — all actual elements in #content-host. The
// browser supplies focus, tab order, Enter/Space activation, and
// screen-reader semantics natively (the a11y inspector HUD reads the REAL
// focused element — no mirror, no data-component-id plumbing).
//
// Activating a button rasterizes it (bitmapFieldFromElement) and round-trips
// it through the shared transition core: element → particles → element.
// The slider demonstrates the 'live-dom' strategy: drag and arrow keys work
// live on real DOM (never rasterized away); double-click rasterizes its
// inners — track, fill, thumb at the CURRENT value — for the same dissolve.
//
// Contrast with the previous version of this file (git: Pattern B): a World,
// force stack, renderer, 20k-particle spawn/bind, DOM mirror, and
// choreography runner — ~290 lines — are now the transition core's job.

import {
  createScreenController,
  headlessButton,
  headlessSlider,
} from '../../components';

// ------------------------------ Boot ---------------------------------------
const canvas = document.getElementById('portal') as HTMLCanvasElement | null;
const host = document.getElementById('content-host') as HTMLDivElement | null;
if (!canvas || !host) throw new Error('Missing #portal or #content-host');

// ONE controller: world + forces + renderer + rAF + the four-frame machine.
const screen = createScreenController({ canvas });

// ------------------------------ Content ------------------------------------
const heading = document.createElement('h1');
heading.textContent = 'Accessible components';

const description = document.createElement('p');
description.textContent =
  'Tab through to focus · Enter or Space to activate · drag the slider';

type Action = { readonly label: string; readonly disabled?: boolean };
const ACTIONS: readonly Action[] = [
  { label: 'Save' },
  { label: 'Duplicate' },
  { label: 'Submit', disabled: true },
  { label: 'Reset' },
  { label: 'Cancel' },
  { label: 'Delete' },
];

const gridRow = (slice: readonly Action[]): HTMLDivElement => {
  const row = document.createElement('div');
  row.className = 'grid-row';
  for (const a of slice) {
    const b = headlessButton({
      screen,
      label: a.label,
      disabled: a.disabled,
      // Business logic runs first, live; the dissolve is the transition.
      onClick: () => console.info(`[demo] ${a.label} activated`),
    });
    row.appendChild(b.el);
  }
  return row;
};

// Slider — live-dom strategy. Drag/arrows are real interaction on real DOM;
// double-click rasterizes the inners (at the current value) and dissolves.
const slider = headlessSlider({
  screen,
  value: 40,
  ariaLabel: 'Demo value',
  onChange: (v) => console.info('[demo] slider value:', v),
});
slider.el.addEventListener('dblclick', () => void slider.dissolve());

host.append(
  heading,
  description,
  gridRow(ACTIONS.slice(0, 3)),
  gridRow(ACTIONS.slice(3, 6)),
  slider.el,
);

// ------------------------------ A11y inspector HUD -------------------------
// Reads the REAL focused element — what a screen reader would announce.
const hudFocused = document.getElementById('hud-focused')!;
const hudRole = document.getElementById('hud-role')!;
const hudLabel = document.getElementById('hud-label')!;
const hudDisabled = document.getElementById('hud-disabled')!;

const updateHud = (): void => {
  const el = document.activeElement as HTMLElement | null;
  const inHost = !!el && host.contains(el);
  const set = (node: Element, text: string, muted: boolean): void => {
    node.textContent = text;
    node.className = muted ? 'val muted' : 'val';
  };
  if (!el || !inHost) {
    for (const n of [hudFocused, hudRole, hudLabel, hudDisabled]) set(n, '—', true);
    return;
  }
  set(hudFocused, el.tagName.toLowerCase(), false);
  set(hudRole, el.getAttribute('role') ?? el.tagName.toLowerCase(), false);
  set(hudLabel, el.getAttribute('aria-label') ?? el.textContent ?? '(none)', false);
  set(hudDisabled, el.getAttribute('aria-disabled') === 'true' ? 'yes' : 'no', false);
};

document.addEventListener('focusin', updateHud);
document.addEventListener('focusout', updateHud);
updateHud();
