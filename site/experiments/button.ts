// button experiment — Pattern A (DOM-first) component event story.
//
// What this proves now: the library's `headlessButton` is a REAL <button>.
// The event story is the NATIVE one — pointerenter / pointerleave /
// pointerdown / pointerup / click fire straight off the element, hover and
// press feedback are real CSS (`:hover` / `:active` rules in a tiny injected
// stylesheet), and focus + Enter/Space activation come from the browser for
// free. Activation runs business `onClick` first, then round-trips the
// element through the shared transition core (`screen.dissolve(el)`):
// rasterize-as-painted → burst → reform.
//
// Contrast with the git-history version of this file (Pattern B): a screean
// `button()` SceneNode (rect + text SDFs), a `createPointerTracker(scene)`
// that re-derived hover/press by hit-testing routed canvas coordinates, a
// `routePointerEvent` dispatch for clicks, and a live particle pool that
// recolored per state because particles WERE the button. Here the particles
// only exist for the transition; state feedback is the styling layer's job.
//
// Three variants share one stylesheet to make the headless split legible:
// structure + behavior come from `headlessButton`, the look (including
// hover/press) is swappable CSS via `unstyled` + `className`. Each variant
// sets its own `--screean-particle*` tokens, so each cloud bursts in the
// variant's own palette — resolveParticlePalette reads them off the real
// element's computed cascade at rasterize time.

import {
  createScreenController,
  headlessButton,
  applyStyles,
  type ElementComponent,
} from '../../src/components';

import { renderNav, renderFooter } from '../layout';
import { THEMES, DEFAULT_THEME } from '../themes';

const THEME = THEMES[DEFAULT_THEME];
const TOKENS = THEME.tokens;

// The dissolve theater paints above everything; keep it clear of nav (z 10s).
const OVERLAY_Z_INDEX = '60';

const VARIANT_NAMES = ['primary', 'outline', 'quiet'] as const;
type VariantName = (typeof VARIANT_NAMES)[number];

const VARIANT_LABELS: Record<VariantName, string> = {
  primary: 'TAP ME',
  outline: 'OUTLINE',
  quiet: 'QUIET',
};

// Real CSS for the three variants — hover and press are genuine `:hover` /
// `:active` pseudo-class rules, not routed hit-tests. foreignObject-safe:
// no url(), no webfonts beyond the theme stack. (The rasterizer embeds
// document stylesheets into the serialized SVG, so class-based skins
// rasterize fine; pseudo-CLASS states like :hover are not part of the
// serialized snapshot — the captured silhouette is the base paint.)
const VARIANT_CSS = `
.xp-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  height: 56px;
  padding: 0 28px;
  font: 700 16px ${TOKENS.fontMono};
  letter-spacing: 0.06em;
  border-radius: ${TOKENS.radius};
  cursor: pointer;
  outline-offset: 2px;
  transition: transform 80ms ease, background 120ms ease, color 120ms ease;
}
.xp-btn:active { transform: translateY(2px); }

.xp-btn--primary {
  --screean-particle: ${TOKENS.accent};
  --screean-particle-2: ${TOKENS.fg};
  background: ${TOKENS.accent};
  color: ${TOKENS.fg};
  border: 1px solid ${TOKENS.border};
  box-shadow: ${TOKENS.shadow};
}
.xp-btn--primary:hover { background: ${TOKENS.fg}; color: ${TOKENS.accent}; }

.xp-btn--outline {
  --screean-particle: ${TOKENS.fg};
  --screean-particle-2: ${TOKENS.muted};
  background: ${TOKENS.surface};
  color: ${TOKENS.fg};
  border: 1px solid ${TOKENS.border};
}
.xp-btn--outline:hover { background: ${TOKENS.subtle}; }

.xp-btn--quiet {
  --screean-particle: ${TOKENS.muted};
  --screean-particle-2: ${TOKENS.fg};
  background: transparent;
  color: ${TOKENS.muted};
  border: 1px solid transparent;
}
.xp-btn--quiet:hover { color: ${TOKENS.fg}; border-color: ${TOKENS.border}; }
`;

const HOST_SKIN: Partial<CSSStyleDeclaration> = {
  position: 'relative',
  width: '720px',
  maxWidth: '100%',
  minHeight: '420px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '28px',
  padding: '32px',
  boxSizing: 'border-box',
  background: TOKENS.bg,
  fontFamily: TOKENS.fontMono,
  color: TOKENS.fg,
};

export const mount = (root: HTMLElement): (() => void) => {
  root.innerHTML = '';

  const worldBehind = document.createElement('div');
  worldBehind.className = 'world-behind';
  worldBehind.setAttribute('aria-hidden', 'true');
  root.appendChild(worldBehind);

  root.appendChild(renderNav({ current: '/experiments' }));

  const head = document.createElement('section');
  head.className = 'doc-head';
  head.innerHTML = `
    <span class="doc-eyebrow">EXPERIMENT · 01</span>
    <h1>button — native events, rasterized activation</h1>
    <p>The button experiment rebuilt on Pattern A. <code>headlessButton</code> returns a real <code>&lt;button&gt;</code>: hover and press are genuine CSS <code>:hover</code>/<code>:active</code> rules, pointer events fire natively off the element (no canvas hit-test routing), and keyboard activation is the browser's own. Clicking runs the handler first, then <code>screen.dissolve(el)</code> rasterizes the element exactly as painted and round-trips it through the shared transition core. Three skins on one factory show the headless split — each variant's cloud inherits its own <code>--screean-particle</code> tokens.</p>
  `;
  root.appendChild(head);

  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.setAttribute('data-experiment', 'button');
  stage.innerHTML = `
    <div class="experiment-canvas-wrap surface-card">
      <div data-role="content-host"></div>
    </div>
    <aside class="experiment-aside surface-card">
      <header class="experiment-aside-head">
        <span class="experiment-aside-eyebrow">STATE</span>
      </header>
      <dl class="experiment-state">
        <div class="state-row"><dt>HOVERED</dt><dd data-key="hovered">—</dd></div>
        <div class="state-row"><dt>PRESSED</dt><dd data-key="pressed">—</dd></div>
        <div class="state-row"><dt>CLICKS</dt><dd data-key="clicks">0</dd></div>
        <div class="state-row"><dt>LAST EVENT</dt><dd data-key="event">—</dd></div>
      </dl>
      <footer class="experiment-aside-foot">
        <code>headlessButton({ screen, label, onClick })</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);

  const host = stage.querySelector<HTMLDivElement>('[data-role="content-host"]')!;
  applyStyles(host, HOST_SKIN);

  // Variant skins — a real stylesheet, in the document, like any styling
  // layer would be. Removed on teardown.
  const styleEl = document.createElement('style');
  styleEl.textContent = VARIANT_CSS;
  document.head.appendChild(styleEl);

  const stateEls = {
    hovered: stage.querySelector<HTMLElement>('[data-key="hovered"]')!,
    pressed: stage.querySelector<HTMLElement>('[data-key="pressed"]')!,
    clicks: stage.querySelector<HTMLElement>('[data-key="clicks"]')!,
    event: stage.querySelector<HTMLElement>('[data-key="event"]')!,
  };
  let clicks = 0;
  const setEvent = (kind: string, variant: VariantName): void => {
    stateEls.event.textContent = `${kind.toUpperCase()} / ${variant.toUpperCase()}`;
  };

  // ── Overlay canvas — the dissolve theater ─────────────────────────────────
  // The core spawns particles at the dissolving element's VIEWPORT rect
  // (default originOf = getBoundingClientRect), so the canvas must be
  // viewport-fixed (same finding as the controls experiment). A
  // container-local canvas would need `originOf` to remap into local coords.
  const overlay = document.createElement('canvas');
  overlay.setAttribute('aria-hidden', 'true');
  applyStyles(overlay, {
    position: 'fixed',
    inset: '0',
    width: '100%',
    height: '100%',
    display: 'block',
    zIndex: OVERLAY_Z_INDEX,
    pointerEvents: 'none',
  });
  stage.appendChild(overlay);

  const screen = createScreenController({ canvas: overlay, feel: THEME.feel });

  // ── Content: title + the three variants ───────────────────────────────────
  const title = document.createElement('h2');
  title.textContent = 'One factory, three skins';
  applyStyles(title, {
    margin: '0',
    font: `${THEME.fontWeight} 24px ${TOKENS.fontHead}`,
    textTransform: TOKENS.headTransform,
    letterSpacing: TOKENS.headTracking,
  });

  const blurb = document.createElement('p');
  blurb.textContent =
    'hover + press are real CSS · click dissolves through the core · Tab + Enter works';
  applyStyles(blurb, {
    margin: '0',
    font: `500 13px ${TOKENS.fontMono}`,
    color: TOKENS.muted,
  });

  const row = document.createElement('div');
  applyStyles(row, {
    display: 'flex',
    alignItems: 'center',
    gap: '20px',
    flexWrap: 'wrap',
    justifyContent: 'center',
  });

  // Native event wiring per variant: these listeners feed ONLY the state
  // panel — the interaction semantics themselves are the element's own.
  const listenerCleanups: Array<() => void> = [];
  const wireStatePanel = (el: HTMLElement, variant: VariantName): void => {
    const on = <K extends keyof HTMLElementEventMap>(
      type: K,
      handler: () => void,
    ): void => {
      el.addEventListener(type, handler);
      listenerCleanups.push(() => el.removeEventListener(type, handler));
    };
    on('pointerenter', () => {
      stateEls.hovered.textContent = variant.toUpperCase();
      setEvent('enter', variant);
    });
    on('pointerleave', () => {
      stateEls.hovered.textContent = '—';
      setEvent('leave', variant);
    });
    on('pointerdown', () => {
      stateEls.pressed.textContent = variant.toUpperCase();
      setEvent('down', variant);
    });
    on('pointerup', () => {
      stateEls.pressed.textContent = '—';
      setEvent('up', variant);
    });
  };

  const buttons: ElementComponent<HTMLButtonElement, 'button'>[] =
    VARIANT_NAMES.map((variant) => {
      const component = headlessButton({
        screen,
        label: VARIANT_LABELS[variant],
        // Bring-your-own styling layer: skip the default inline skin so the
        // injected stylesheet (including :hover/:active) owns the look.
        unstyled: true,
        className: `xp-btn xp-btn--${variant}`,
        onClick: () => {
          clicks += 1;
          stateEls.clicks.textContent = String(clicks);
          setEvent('click', variant);
        },
      });
      wireStatePanel(component.el, variant);
      return component;
    });

  row.append(...buttons.map((b) => b.el));
  host.append(title, blurb, row);

  root.appendChild(renderFooter());

  // ── Teardown ──────────────────────────────────────────────────────────────
  return () => {
    screen.dispose();
    for (const cleanup of listenerCleanups) cleanup();
    for (const b of buttons) b.dispose();
    overlay.remove();
    styleEl.remove();
  };
};
