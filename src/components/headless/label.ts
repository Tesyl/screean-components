// headless label — decorative text (Pattern A).
//
// Real text element; `heading` renders an <h2> ('heading' role comes free
// from the tag), otherwise a <span> with role 'text'. No handlers — labels
// are decorative; the handle still exposes dissolve()/swapTo() so layouts
// can transition them.

import type { ElementComponent, HeadlessBaseOpts } from './types';
import type { Prettify } from '../transition';
import { applyBaseOpts, applyStyles, toElementComponent } from './element';
import {
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PX,
  HEADING_PARTICLE_COUNT,
  LABEL_PARTICLE_COUNT,
} from './constant';

export type HeadlessLabelOpts = Prettify<
  HeadlessBaseOpts & {
    text: string;
    heading?: boolean;
  }
>;

const LABEL_SKIN: Partial<CSSStyleDeclaration> = {
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: `${DEFAULT_FONT_SIZE_PX}px`,
  color: '#fafafa',
};

const HEADING_SKIN: Partial<CSSStyleDeclaration> = {
  ...LABEL_SKIN,
  fontSize: '28px',
  fontWeight: '400',
  letterSpacing: '-0.01em',
  margin: '0',
};

export const headlessLabel = (
  opts: HeadlessLabelOpts,
): ElementComponent<HTMLElement, 'heading' | 'text'> => {
  const el = document.createElement(opts.heading ? 'h2' : 'span');
  el.textContent = opts.text;
  if (!opts.unstyled) applyStyles(el, opts.heading ? HEADING_SKIN : LABEL_SKIN);
  applyBaseOpts(el, opts);
  const overrides = {
    particleCount:
      opts.particleCount ?? (opts.heading ? HEADING_PARTICLE_COUNT : LABEL_PARTICLE_COUNT),
  };
  return toElementComponent({
    el,
    role: opts.heading ? 'heading' : 'text',
    screen: opts.screen,
    overrides,
  });
};
