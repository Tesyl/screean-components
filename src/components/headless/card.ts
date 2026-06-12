// headless card — a real container element (Pattern A).
//
// Discrete, optionally activatable. Children are real nodes appended by the
// caller or passed in — when the card dissolves, the rasterizer captures
// everything painted inside it (the whole point of DOM-first composition).

import type { ElementComponent, HeadlessBaseOpts } from './types';
import type { Prettify } from '../transition';
import { applyBaseOpts, applyStyles, toElementComponent } from './element';
import { BUTTON_BORDER, BUTTON_SHADOW, DEFAULT_FONT_FAMILY } from './constant';

export type HeadlessCardOpts = Prettify<
  HeadlessBaseOpts & {
    children?: ReadonlyArray<HTMLElement>;
    // Optional activation: a clickable card dissolves like a button.
    onClick?: (e: MouseEvent) => void;
    dissolveOnActivate?: boolean;
  }
>;

const CARD_SKIN: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  flexDirection: 'column',
  gap: '10px',
  padding: '18px 20px',
  background: 'rgba(16, 14, 28, 0.72)',
  border: BUTTON_BORDER,
  borderRadius: '12px',
  boxShadow: BUTTON_SHADOW,
  fontFamily: DEFAULT_FONT_FAMILY,
  color: '#fafafa',
};

export const headlessCard = (
  opts: HeadlessCardOpts,
): ElementComponent<HTMLDivElement, 'none'> => {
  const { screen, onClick, dissolveOnActivate = true } = opts;
  const el = document.createElement('div');
  for (const c of opts.children ?? []) el.appendChild(c);

  if (!opts.unstyled) applyStyles(el, CARD_SKIN);
  applyBaseOpts(el, opts);

  let handleClick: ((e: MouseEvent) => void) | null = null;
  if (onClick) {
    el.style.cursor = 'pointer';
    handleClick = (e: MouseEvent): void => {
      if (opts.disabled || screen.phase() !== 'idle') return;
      onClick(e);
      if (dissolveOnActivate) void screen.dissolve(el);
    };
    el.addEventListener('click', handleClick);
  }

  return toElementComponent({
    el,
    role: 'none',
    screen,
    onDispose: () => {
      if (handleClick) el.removeEventListener('click', handleClick);
    },
  });
};
