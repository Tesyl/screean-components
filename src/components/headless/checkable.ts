// Shared checked-state machinery for checkbox / switch / radio.
//
// All three are DISCRETE controls ('rasterize' strategy) with the same
// activation contract, ordered so the rasterizer always captures the
// settled, post-change visual:
//
//   activate → flip state → re-render the real element → onChange →
//   dissolve (captures the NEW state's pixels)
//
// Each factory supplies its own inner structure + render(checked); this
// module owns the state echo, ARIA write, gating, and listener lifecycle.
// Native <button> base gives Enter/Space activation + focus for free.

import type { ScreenController } from '../transition';

export type CheckableArgs = {
  screen: ScreenController;
  el: HTMLButtonElement;
  ariaAttribute: 'aria-checked' | 'aria-pressed';
  initial: boolean;
  disabled?: boolean;
  dissolveOnChange: boolean;
  // Repaint the inner parts for a state. Runs before onChange/dissolve.
  render: (checked: boolean) => void;
  onChange?: (checked: boolean) => void;
  // Radios never un-check themselves on activation; checkbox/switch toggle.
  activationValue: (current: boolean) => boolean;
};

export type Checkable = {
  checked: () => boolean;
  setChecked: (next: boolean) => void;
  removeListeners: () => void;
};

export const wireCheckable = (args: CheckableArgs): Checkable => {
  const { screen, el, ariaAttribute, render } = args;
  let checked = args.initial;

  const paint = (): void => {
    el.setAttribute(ariaAttribute, String(checked));
    render(checked);
  };
  paint();

  const commit = (next: boolean, dissolve: boolean): void => {
    if (next === checked) return;
    checked = next;
    paint();
    args.onChange?.(checked);
    if (dissolve) void screen.dissolve(el);
  };

  const handleClick = (): void => {
    if (args.disabled || screen.phase() !== 'idle') return;
    commit(args.activationValue(checked), args.dissolveOnChange);
  };
  el.addEventListener('click', handleClick);

  return {
    checked: () => checked,
    // External writes never dissolve — they're programmatic state sync
    // (e.g. a radio group un-checking siblings), not user activation.
    setChecked: (next) => commit(next, false),
    removeListeners: () => el.removeEventListener('click', handleClick),
  };
};
