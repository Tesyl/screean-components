// headless text field — the second 'live-dom' exemplar (Pattern A).
//
// A real <input type="text">: typing, IME composition, selection, and the
// caret are the browser's — rasterizing per keystroke would destroy all of
// it (Decision §5). Only the COMMIT edge dissolves: when the value settles
// (change event = blur or Enter), the field re-renders and round-trips.
//
// Value model mirrors the slider: live internal echo + onInput per
// keystroke, onCommit at settle, setValue for external drive.

import type { ElementComponent, HeadlessBaseOpts } from './types';
import type { Prettify } from '../transition';
import { applyBaseOpts, applyStyles, toElementComponent } from './element';
import {
  BUTTON_BORDER,
  BUTTON_FOREGROUND,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PX,
} from './constant';

export type HeadlessTextFieldOpts = Prettify<
  HeadlessBaseOpts & {
    ariaLabel: string; // inputs need a name; placeholder is not a name
    value?: string;
    placeholder?: string;
    onInput?: (value: string) => void;
    onCommit?: (value: string) => void;
    // Dissolve on commit. Default true.
    dissolveOnCommit?: boolean;
  }
>;

export type TextFieldComponent = Prettify<
  ElementComponent<HTMLInputElement, 'textbox'> & {
    readonly value: () => string;
    readonly setValue: (next: string) => void;
  }
>;

const FIELD_SKIN: Partial<CSSStyleDeclaration> = {
  display: 'inline-block',
  height: '36px',
  padding: '0 12px',
  background: 'rgba(255, 255, 255, 0.06)',
  color: BUTTON_FOREGROUND,
  border: BUTTON_BORDER,
  borderRadius: '8px',
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: `${DEFAULT_FONT_SIZE_PX}px`,
  outlineOffset: '2px',
};

export const headlessTextField = (
  opts: HeadlessTextFieldOpts,
): TextFieldComponent => {
  const { screen, dissolveOnCommit = true } = opts;

  const el = document.createElement('input');
  el.type = 'text';
  el.value = opts.value ?? '';
  if (opts.placeholder) el.placeholder = opts.placeholder;
  if (opts.disabled) el.disabled = true;

  if (!opts.unstyled) applyStyles(el, FIELD_SKIN);
  applyBaseOpts(el, opts);

  const handleInput = (): void => opts.onInput?.(el.value);
  // `change` fires when the value settles (blur, or Enter in most browsers)
  // — the discrete edge of a continuous interaction.
  const handleChange = (): void => {
    opts.onCommit?.(el.value);
    if (dissolveOnCommit && screen.phase() === 'idle') void screen.dissolve(el);
  };
  el.addEventListener('input', handleInput);
  el.addEventListener('change', handleChange);

  const base = toElementComponent({
    el,
    role: 'textbox',
    screen,
    onDispose: () => {
      el.removeEventListener('input', handleInput);
      el.removeEventListener('change', handleChange);
    },
  });
  return {
    ...base,
    value: () => el.value,
    setValue: (next) => {
      el.value = next;
    },
  };
};
