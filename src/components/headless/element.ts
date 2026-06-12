// Shared element plumbing for headless factories — small, pure-shaped
// helpers so each factory reads as "structure + behavior + skin" with no
// repeated boilerplate.

import type { AriaRole } from '../types';
import { RENDER_STRATEGY_BY_ROLE } from '../types';
import type { ScreenController } from '../transition';
import type { ElementComponent, HeadlessBaseOpts } from './types';
import { DISABLED_OPACITY } from './constant';

// Merge inline styles onto an element. Values are written individually so
// later writes (consumer `style` overrides) win over the default skin.
export const applyStyles = (
  el: HTMLElement,
  styles: Partial<CSSStyleDeclaration>,
): void => {
  for (const [k, v] of Object.entries(styles)) {
    if (v !== undefined && v !== null) {
      // Index signature write — CSSStyleDeclaration keys are camelCase.
      (el.style as unknown as Record<string, string>)[k] = String(v);
    }
  }
};

// Apply the shared base opts (a11y name, disabled affordance, class hook,
// style overrides) AFTER a factory's default skin so overrides win.
export const applyBaseOpts = (
  el: HTMLElement,
  opts: Pick<HeadlessBaseOpts, 'ariaLabel' | 'disabled' | 'className' | 'style'>,
): void => {
  if (opts.ariaLabel) el.setAttribute('aria-label', opts.ariaLabel);
  if (opts.className) el.className = opts.className;
  if (opts.disabled) {
    el.setAttribute('aria-disabled', 'true');
    el.style.opacity = DISABLED_OPACITY;
    el.style.pointerEvents = 'none';
  }
  if (opts.style) applyStyles(el, opts.style);
};

// Assemble the ElementComponent handle every factory returns. `dispose`
// composes the factory's own teardown (listener removal) with detach.
export const toElementComponent = <
  E extends HTMLElement,
  R extends AriaRole,
>(args: {
  el: E;
  role: R;
  screen: ScreenController;
  onDispose?: () => void;
}): ElementComponent<E, R> => {
  const { el, role, screen, onDispose } = args;
  return {
    el,
    role,
    strategy: RENDER_STRATEGY_BY_ROLE[role],
    dissolve: () => screen.dissolve(el),
    swapTo: (into) => screen.swap(el, into.el),
    dispose: () => {
      onDispose?.();
      el.remove();
    },
  };
};
