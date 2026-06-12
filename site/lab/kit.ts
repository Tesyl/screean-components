// Story kit — tiny DOM helpers the stories compose their playgrounds from.
//
// Everything here is lab CHROME (captions, readouts, layout), kept separate
// from the components under test so a story reads as: chrome around a real
// headless component. All pure element constructors (same element out for
// the same args in, modulo identity) with inline styles, mirroring the
// headless skins' foreignObject-safe approach.

import type { ElementComponent } from '../../src/components';
import {
  CAPTION_COLOR,
  CAPTION_FONT_SIZE_PX,
  CAPTION_MAX_WIDTH_PX,
  READOUT_COLOR,
  READOUT_FONT_SIZE_PX,
  READOUT_MIN_HEIGHT_PX,
  STORY_COLUMN_GAP_PX,
  STORY_FONT_FAMILY,
  STORY_MONO_FAMILY,
  STORY_ROW_GAP_PX,
} from './constant';

// Centered vertical flow — the story area's root node.
export const storyColumn = (): HTMLDivElement => {
  const el = document.createElement('div');
  el.style.display = 'flex';
  el.style.flexDirection = 'column';
  el.style.alignItems = 'center';
  el.style.gap = `${STORY_COLUMN_GAP_PX}px`;
  return el;
};

// Horizontal grouping for sibling components (e.g. a button row).
export const storyRow = (
  children: ReadonlyArray<HTMLElement>,
): HTMLDivElement => {
  const el = document.createElement('div');
  el.style.display = 'flex';
  el.style.alignItems = 'center';
  el.style.gap = `${STORY_ROW_GAP_PX}px`;
  for (const c of children) el.appendChild(c);
  return el;
};

// Muted instruction line — tells the visitor what interaction to try.
export const storyCaption = (text: string): HTMLParagraphElement => {
  const el = document.createElement('p');
  el.textContent = text;
  el.style.margin = '0';
  el.style.maxWidth = `${CAPTION_MAX_WIDTH_PX}px`;
  el.style.textAlign = 'center';
  el.style.fontFamily = STORY_FONT_FAMILY;
  el.style.fontSize = `${CAPTION_FONT_SIZE_PX}px`;
  el.style.lineHeight = '1.5';
  el.style.color = CAPTION_COLOR;
  return el;
};

export type StoryReadout = {
  readonly el: HTMLElement;
  readonly set: (text: string) => void;
};

// Live state echo — stories pipe onChange/onInput values here so the
// interaction's effect is visible as text, not just as particles.
export const storyReadout = (initial: string): StoryReadout => {
  const el = document.createElement('div');
  el.textContent = initial;
  el.setAttribute('aria-live', 'polite');
  el.style.fontFamily = STORY_MONO_FAMILY;
  el.style.fontSize = `${READOUT_FONT_SIZE_PX}px`;
  el.style.minHeight = `${READOUT_MIN_HEIGHT_PX}px`;
  el.style.color = READOUT_COLOR;
  el.style.letterSpacing = '0.04em';
  return {
    el,
    set: (text) => {
      el.textContent = text;
    },
  };
};

// Standard story teardown: dispose every component handle (each removes its
// own element), then remove the chrome root. Returned as a thunk so stories
// end with `return teardownOf(root, ...components)`.
export const teardownOf = (
  root: HTMLElement,
  ...parts: ReadonlyArray<Pick<ElementComponent, 'dispose'>>
): (() => void) =>
  () => {
    for (const p of parts) p.dispose();
    root.remove();
  };
