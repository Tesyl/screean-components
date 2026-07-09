// Shared element plumbing for headless factories — small, pure-shaped
// helpers so each factory reads as "structure + behavior + skin" with no
// repeated boilerplate.

import type { AriaRole } from '../types';
import { RENDER_STRATEGY_BY_ROLE } from '../types';
import type { ScreenController, TransitionTuning } from '../transition';
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

// Per-element transition guard. A component is "busy" only while ITS OWN
// dissolve/swap cycle is in flight — NOT while some other element is mid-
// transition. This is the difference between "you can't re-click this
// dissolving button" (correct) and "you can't click anything while any
// button is dissolving" (the bug the controller's global phase() caused).
//
// `run` brackets an async transition: busy for its whole duration, including
// the time it spends queued behind another element's cycle (the controller
// serializes), and cleared even if the transition rejects.
export type TransitionGuard = {
  busy: () => boolean;
  run: (transition: () => Promise<void>) => Promise<void>;
};

export const transitionGuard = (): TransitionGuard => {
  let busy = false;
  return {
    busy: () => busy,
    run: async (transition) => {
      busy = true;
      try {
        await transition();
      } finally {
        busy = false;
      }
    },
  };
};

// Assemble the ElementComponent handle every factory returns. `dissolve`/
// `swapTo` route through the per-element `guard` so the component's own
// `isTransitioning()` reflects them (whether triggered by a click handler or
// called programmatically). `dispose` composes the factory's teardown with
// detach. Pass the SAME guard the factory's interaction handlers gate on.
export const toElementComponent = <
  E extends HTMLElement,
  R extends AriaRole,
>(args: {
  el: E;
  role: R;
  screen: ScreenController;
  guard?: TransitionGuard;
  // Per-component transition tuning (e.g. its resolved particleCount) applied
  // to every dissolve/swap this handle triggers.
  overrides?: Partial<TransitionTuning>;
  onDispose?: () => void;
}): ElementComponent<E, R> => {
  const { el, role, screen, overrides, onDispose } = args;
  const guard = args.guard ?? transitionGuard();
  return {
    el,
    role,
    strategy: RENDER_STRATEGY_BY_ROLE[role],
    isTransitioning: guard.busy,
    dissolve: () => guard.run(() => screen.dissolve(el, overrides)),
    swapTo: (into) => guard.run(() => screen.swap(el, into.el, overrides)),
    dispose: () => {
      onDispose?.();
      el.remove();
    },
  };
};
