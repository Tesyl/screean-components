// headless checkbox — discrete, rasterize at edges (Pattern A).
//
// Real <button role="checkbox" aria-checked> with a box + mark + label as
// real inner nodes (data-part hooks). Activation flips state, repaints,
// then dissolves the settled visual.

import type { ElementComponent, HeadlessBaseOpts } from './types';
import type { Prettify } from '../transition';
import { applyBaseOpts, applyStyles, toElementComponent, transitionGuard } from './element';
import { wireCheckable } from './checkable';
import {
  BUTTON_FOREGROUND,
  CHECKBOX_PARTICLE_COUNT,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PX,
} from './constant';

export type HeadlessCheckboxOpts = Prettify<
  HeadlessBaseOpts & {
    label: string;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    dissolveOnChange?: boolean;
  }
>;

export type CheckboxComponent = Prettify<
  ElementComponent<HTMLButtonElement, 'checkbox'> & {
    readonly checked: () => boolean;
    readonly setChecked: (next: boolean) => void;
  }
>;

const ROOT_SKIN: Partial<CSSStyleDeclaration> = {
  display: 'inline-flex',
  alignItems: 'center',
  gap: '10px',
  background: 'transparent',
  border: 'none',
  padding: '4px',
  cursor: 'pointer',
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: `${DEFAULT_FONT_SIZE_PX}px`,
  color: BUTTON_FOREGROUND,
  outlineOffset: '2px',
};

const BOX_SKIN: Partial<CSSStyleDeclaration> = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '18px',
  borderRadius: '5px',
  border: '1.5px solid rgba(255, 255, 255, 0.4)',
  fontSize: '13px',
  lineHeight: '1',
};

export const headlessCheckbox = (
  opts: HeadlessCheckboxOpts,
): CheckboxComponent => {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('role', 'checkbox');

  const box = document.createElement('span');
  box.dataset.part = 'box';
  const text = document.createElement('span');
  text.dataset.part = 'label';
  text.textContent = opts.label;
  el.append(box, text);

  if (!opts.unstyled) {
    applyStyles(el, ROOT_SKIN);
    applyStyles(box, BOX_SKIN);
  }
  applyBaseOpts(el, { ...opts, ariaLabel: opts.ariaLabel ?? opts.label });

  const overrides = { particleCount: opts.particleCount ?? CHECKBOX_PARTICLE_COUNT };
  const guard = transitionGuard();
  const state = wireCheckable({
    screen: opts.screen,
    el,
    guard,
    overrides,
    ariaAttribute: 'aria-checked',
    initial: opts.checked ?? false,
    disabled: opts.disabled,
    dissolveOnChange: opts.dissolveOnChange ?? true,
    onChange: opts.onChange,
    activationValue: (cur) => !cur,
    render: (checked) => {
      box.textContent = checked ? '✓' : '';
      if (!opts.unstyled) {
        box.style.background = checked ? BUTTON_FOREGROUND : 'transparent';
        box.style.color = checked ? '#0a0a0a' : 'transparent';
      }
    },
  });

  const base = toElementComponent({
    el,
    role: 'checkbox',
    screen: opts.screen,
    guard,
    overrides,
    onDispose: state.removeListeners,
  });
  return { ...base, checked: state.checked, setChecked: state.setChecked };
};
