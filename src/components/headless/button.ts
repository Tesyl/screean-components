// headless button — Pattern A exemplar (audit §4 Step 2).
//
// The component IS a real <button>. The browser supplies focus, keyboard
// activation (Enter/Space), screen-reader semantics, touch targets, and
// forced-color modes natively — no DOM mirror, no parallel SDF geometry to
// hand-sync. The default skin is inline (foreignObject-safe, mirrors
// shadcn's dark variant); pass `unstyled` + `className` to restyle.
//
// Activation contract: business `onClick` runs FIRST, on the live element,
// then (by default) the dissolve round-trip plays. The dissolve is the
// transition artifact, not the click — handlers never wait on particles.

import type { ElementComponent, HeadlessButtonOpts } from './types';
import { applyBaseOpts, applyStyles, toElementComponent, transitionGuard } from './element';
import {
  BUTTON_BACKGROUND,
  BUTTON_BORDER,
  BUTTON_FOREGROUND,
  BUTTON_HEIGHT_PX,
  BUTTON_PADDING_X_PX,
  BUTTON_PARTICLE_COUNT,
  BUTTON_RADIUS_PX,
  BUTTON_SHADOW,
  DEFAULT_FONT_FAMILY,
  DEFAULT_FONT_SIZE_PX,
  DEFAULT_FONT_WEIGHT,
} from './constant';

const BUTTON_SKIN: Partial<CSSStyleDeclaration> = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '8px',
  height: `${BUTTON_HEIGHT_PX}px`,
  paddingLeft: `${BUTTON_PADDING_X_PX}px`,
  paddingRight: `${BUTTON_PADDING_X_PX}px`,
  background: BUTTON_BACKGROUND,
  color: BUTTON_FOREGROUND,
  border: BUTTON_BORDER,
  borderRadius: `${BUTTON_RADIUS_PX}px`,
  fontFamily: DEFAULT_FONT_FAMILY,
  fontSize: `${DEFAULT_FONT_SIZE_PX}px`,
  fontWeight: String(DEFAULT_FONT_WEIGHT),
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  outlineOffset: '2px',
  boxShadow: BUTTON_SHADOW,
};

export const headlessButton = (
  opts: HeadlessButtonOpts,
): ElementComponent<HTMLButtonElement, 'button'> => {
  const { screen, label, onClick, dissolveOnActivate = true } = opts;

  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = label;

  if (!opts.unstyled) applyStyles(el, BUTTON_SKIN);
  applyBaseOpts(el, { ...opts, ariaLabel: opts.ariaLabel ?? label });

  const overrides = { particleCount: opts.particleCount ?? BUTTON_PARTICLE_COUNT };
  const guard = transitionGuard();
  const handleClick = (e: MouseEvent): void => {
    if (opts.disabled) return;
    // Re-entrancy guard, PER ELEMENT: while THIS button's own cycle is in
    // flight it's opacity:0 + pointer-events:none, but keyboard activation
    // can still reach it. We gate on its own guard — not the controller's
    // global phase — so a different button dissolving never blocks this one.
    if (guard.busy()) return;
    onClick(e);
    if (dissolveOnActivate) void guard.run(() => screen.dissolve(el, overrides));
  };
  el.addEventListener('click', handleClick);

  return toElementComponent({
    el,
    role: 'button',
    screen,
    guard,
    overrides,
    onDispose: () => el.removeEventListener('click', handleClick),
  });
};
