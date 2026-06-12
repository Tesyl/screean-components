// headless radio — discrete, rasterize at edges (Pattern A).
//
// A single radio is a <button role="radio" aria-checked> (dot + label inner
// nodes). Exclusivity lives in `createRadioGroup`: activating one radio
// checks it, un-checks its siblings (programmatic — no sibling dissolve),
// and reports the selected value. Only the ACTIVATED radio dissolves.

import type { ElementComponent, HeadlessBaseOpts } from './types';
import type { Prettify, ScreenController } from '../transition';
import { applyBaseOpts, applyStyles, toElementComponent } from './element';
import { wireCheckable } from './checkable';
import {
  BUTTON_FOREGROUND,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PX,
} from './constant';

export type HeadlessRadioOpts = Prettify<
  HeadlessBaseOpts & {
    label: string;
    value: string;
    checked?: boolean;
    onChange?: (checked: boolean) => void;
    // Radios default to NOT dissolving individually — the group decides.
    dissolveOnChange?: boolean;
  }
>;

export type RadioComponent = Prettify<
  ElementComponent<HTMLButtonElement, 'radio'> & {
    readonly value: string;
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

const DOT_SKIN: Partial<CSSStyleDeclaration> = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: '18px',
  height: '18px',
  borderRadius: '50%',
  border: '1.5px solid rgba(255, 255, 255, 0.4)',
};

export const headlessRadio = (opts: HeadlessRadioOpts): RadioComponent => {
  const el = document.createElement('button');
  el.type = 'button';
  el.setAttribute('role', 'radio');

  const dot = document.createElement('span');
  dot.dataset.part = 'dot';
  const inner = document.createElement('span');
  inner.dataset.part = 'dot-inner';
  dot.appendChild(inner);
  const text = document.createElement('span');
  text.dataset.part = 'label';
  text.textContent = opts.label;
  el.append(dot, text);

  if (!opts.unstyled) {
    applyStyles(el, ROOT_SKIN);
    applyStyles(dot, DOT_SKIN);
    applyStyles(inner, {
      width: '9px',
      height: '9px',
      borderRadius: '50%',
      background: BUTTON_FOREGROUND,
    });
  }
  applyBaseOpts(el, { ...opts, ariaLabel: opts.ariaLabel ?? opts.label });

  const state = wireCheckable({
    screen: opts.screen,
    el,
    ariaAttribute: 'aria-checked',
    initial: opts.checked ?? false,
    disabled: opts.disabled,
    dissolveOnChange: opts.dissolveOnChange ?? false,
    onChange: opts.onChange,
    // Activating an already-checked radio is a no-op (commit dedupes).
    activationValue: () => true,
    render: (checked) => {
      inner.style.opacity = checked ? '1' : '0';
    },
  });

  const base = toElementComponent({
    el,
    role: 'radio',
    screen: opts.screen,
    onDispose: state.removeListeners,
  });
  return {
    ...base,
    value: opts.value,
    checked: state.checked,
    setChecked: state.setChecked,
  };
};

// ─── group ───────────────────────────────────────────────────────────────────

export type RadioGroupOpts = {
  screen: ScreenController;
  options: ReadonlyArray<Prettify<Omit<HeadlessRadioOpts, 'screen' | 'onChange'>>>;
  onChange?: (value: string) => void;
  // Dissolve the newly-selected radio on selection. Default true.
  dissolveOnSelect?: boolean;
};

export type RadioGroup = {
  readonly el: HTMLDivElement; // role="radiogroup" container
  readonly radios: ReadonlyArray<RadioComponent>;
  readonly selected: () => string | null;
  readonly select: (value: string) => void;
  readonly dispose: () => void;
};

export const createRadioGroup = (opts: RadioGroupOpts): RadioGroup => {
  const el = document.createElement('div');
  el.setAttribute('role', 'radiogroup');
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.gap = '2px';

  const dissolveOnSelect = opts.dissolveOnSelect ?? true;
  // Distinguishes user activation from the group's own setChecked() sync —
  // without it, programmatic select() re-enters the activation path through
  // each radio's onChange and dissolves a radio nobody clicked.
  let syncing = false;
  // Mutual exclusivity: each radio's onChange un-checks the others.
  const radios: RadioComponent[] = opts.options.map((o) =>
    headlessRadio({
      ...o,
      screen: opts.screen,
      onChange: (checked) => {
        if (!checked || syncing) return;
        apply(o.value, true);
      },
    }),
  );
  for (const r of radios) el.appendChild(r.el);

  const apply = (value: string, fromUser: boolean): void => {
    syncing = true;
    try {
      for (const r of radios) {
        if (r.value === value) {
          r.setChecked(true);
          if (fromUser && dissolveOnSelect) void r.dissolve();
        } else {
          r.setChecked(false);
        }
      }
    } finally {
      syncing = false;
    }
    opts.onChange?.(value);
  };

  return {
    el,
    radios,
    selected: () => radios.find((r) => r.checked())?.value ?? null,
    select: (value) => apply(value, false),
    dispose: () => {
      for (const r of radios) r.dispose();
      el.remove();
    },
  };
};
