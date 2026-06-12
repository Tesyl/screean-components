// headless toggle (switch) — discrete, rasterize at edges (Pattern A).
//
// Real <button role="switch" aria-checked> with track + knob inner nodes.
// Same activation contract as checkbox via wireCheckable.

import type { ElementComponent, HeadlessBaseOpts } from './types';
import type { Prettify } from '../transition';
import { applyBaseOpts, applyStyles, toElementComponent } from './element';
import { wireCheckable } from './checkable';
import { BUTTON_FOREGROUND } from './constant';

export type HeadlessToggleOpts = Prettify<
  HeadlessBaseOpts & {
    ariaLabel: string; // no visible text — the name is mandatory
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    dissolveOnChange?: boolean;
  }
>;

export type ToggleComponent = Prettify<
  ElementComponent<HTMLButtonElement, 'switch'> & {
    readonly checked: () => boolean;
    readonly setChecked: (next: boolean) => void;
  }
>;

const TRACK_W = 40;
const TRACK_H = 22;
const KNOB = 16;

const ROOT_SKIN: Partial<CSSStyleDeclaration> = {
  position: 'relative',
  display: 'inline-block',
  width: `${TRACK_W}px`,
  height: `${TRACK_H}px`,
  borderRadius: `${TRACK_H / 2}px`,
  border: '1.5px solid rgba(255, 255, 255, 0.25)',
  background: 'rgba(255, 255, 255, 0.12)',
  padding: '0',
  cursor: 'pointer',
  outlineOffset: '2px',
};

const KNOB_SKIN: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  top: '50%',
  width: `${KNOB}px`,
  height: `${KNOB}px`,
  borderRadius: '50%',
  background: BUTTON_FOREGROUND,
  transform: 'translateY(-50%)',
  transition: 'left 120ms ease',
  pointerEvents: 'none',
};

const KNOB_OFF_LEFT = '2px';
const KNOB_ON_LEFT = `${TRACK_W - KNOB - 4}px`;

export const headlessToggle = (opts: HeadlessToggleOpts): ToggleComponent => {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('role', 'switch');

  const knob = document.createElement('span');
  knob.dataset.part = 'knob';
  el.appendChild(knob);

  if (!opts.unstyled) {
    applyStyles(el, ROOT_SKIN);
    applyStyles(knob, KNOB_SKIN);
  }
  applyBaseOpts(el, opts);

  const state = wireCheckable({
    screen: opts.screen,
    el,
    ariaAttribute: 'aria-checked',
    initial: opts.checked ?? false,
    disabled: opts.disabled,
    dissolveOnChange: opts.dissolveOnChange ?? true,
    onChange: opts.onChange,
    activationValue: (cur) => !cur,
    render: (checked) => {
      knob.style.left = checked ? KNOB_ON_LEFT : KNOB_OFF_LEFT;
      if (!opts.unstyled) {
        el.style.background = checked
          ? 'rgba(120, 255, 190, 0.35)'
          : 'rgba(255, 255, 255, 0.12)';
      }
    },
  });

  const base = toElementComponent({
    el,
    role: 'switch',
    screen: opts.screen,
    onDispose: state.removeListeners,
  });
  return { ...base, checked: state.checked, setChecked: state.setChecked };
};
