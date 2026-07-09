// controls experiment — Pattern A (DOM-first) controls showcase.
//
// What this proves now: a panel of REAL DOM form controls — checkbox, switch,
// radio group, text field, plus the library's headlessButton and
// headlessSlider — where the DOM is the single source of truth and the
// particle cloud is purely a transition artifact. Activating a discrete
// control mutates state FIRST, re-renders the real element, then round-trips
// it through the shared transition core (`screen.dissolve(el)`): the element
// is rasterized exactly as painted (bitmapFieldFromElement), bursts, and
// reforms. The slider is the 'live-dom' strategy exemplar — drag and arrow
// keys stay live on real DOM (never rasterized away); double-click dissolves
// its inners at the current value. The text field is live-dom too: typing is
// real input, and only the commit (change event) dissolves.
//
// Contrast with the git-history version of this file (Pattern B): a Stage
// (World + force stack + renderer), a 6000-particle bounds-area bind, a DOM
// mirror with ~100 lines of per-role mirror CSS, a choreography runner, and
// an in-place scene-rebuild dance to keep `createDissolve`'s captured scene
// reference valid — all replaced by ONE `createScreenController` and real
// elements the browser already knows how to focus, click, and announce.
//
// The discrete controls here (checkbox / switch / radio / text field) are
// deliberately plain DOM with inline foreignObject-safe styles — site-local
// stand-ins until headless factories exist for those roles. Only button and
// slider use the library factories.

import {
  applyStyles,
  createScreenController,
  headlessButton,
  headlessSlider,
  type ScreenController,
} from '../../src/components';

import { renderNav, renderFooter } from '../layout';
import { THEMES, DEFAULT_THEME } from '../themes';

const THEME = THEMES[DEFAULT_THEME];
const TOKENS = THEME.tokens;

const COLORS = ['cyan', 'magenta', 'yellow'] as const;
type ColorChoice = (typeof COLORS)[number];

// ─── Inline skins (foreignObject-safe: no classes, no url(), no webfonts
//     beyond the system/theme stack) ─────────────────────────────────────────

const CONTROL_FONT = `500 13px ${TOKENS.fontMono}`;
const CONTROL_BORDER = `1px solid ${TOKENS.border}`;
// The dissolve theater paints above everything; keep it clear of nav (z 10s).
const OVERLAY_Z_INDEX = '60';

const HOST_SKIN: Partial<CSSStyleDeclaration> = {
  position: 'relative',
  width: '720px',
  maxWidth: '100%',
  minHeight: '600px',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  gap: '24px',
  padding: '32px',
  boxSizing: 'border-box',
  background: TOKENS.bg,
  // Particle palette tokens — resolveParticlePalette reads these, so every
  // cloud inherits the theme accent + ink instead of per-element greys.
  // (Custom properties pass through applyStyles' index-signature write only
  // via setProperty, so they're applied separately below.)
  fontFamily: TOKENS.fontMono,
  color: TOKENS.fg,
};

const ROW_SKIN: Partial<CSSStyleDeclaration> = {
  display: 'flex',
  alignItems: 'center',
  gap: '12px',
};

const FIELD_LABEL_SKIN: Partial<CSSStyleDeclaration> = {
  font: CONTROL_FONT,
  color: TOKENS.muted,
  textTransform: 'uppercase',
  letterSpacing: '0.12em',
};

const TEXT_FIELD_SKIN: Partial<CSSStyleDeclaration> = {
  width: '280px',
  height: '40px',
  padding: '0 14px',
  boxSizing: 'border-box',
  font: `500 15px ${TOKENS.fontMono}`,
  color: TOKENS.fg,
  background: TOKENS.surface,
  border: CONTROL_BORDER,
  borderRadius: TOKENS.radius,
  outlineOffset: '2px',
};

const CHECKBOX_SKIN: Partial<CSSStyleDeclaration> = {
  width: '22px',
  height: '22px',
  padding: '0',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  font: `700 14px ${TOKENS.fontMono}`,
  color: TOKENS.fg,
  background: TOKENS.surface,
  border: CONTROL_BORDER,
  borderRadius: TOKENS.radius,
  cursor: 'pointer',
  outlineOffset: '2px',
};

const SWITCH_SKIN: Partial<CSSStyleDeclaration> = {
  position: 'relative',
  width: '40px',
  height: '22px',
  padding: '0',
  background: TOKENS.surface,
  border: CONTROL_BORDER,
  borderRadius: '11px',
  cursor: 'pointer',
  outlineOffset: '2px',
};

const SWITCH_KNOB_SKIN: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  top: '2px',
  left: '2px',
  width: '16px',
  height: '16px',
  borderRadius: '50%',
  background: TOKENS.fg,
  transition: 'transform 140ms ease, background 140ms ease',
  pointerEvents: 'none',
};

const RADIO_SKIN: Partial<CSSStyleDeclaration> = {
  width: '20px',
  height: '20px',
  padding: '0',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  background: TOKENS.surface,
  border: CONTROL_BORDER,
  borderRadius: '50%',
  cursor: 'pointer',
  outlineOffset: '2px',
};

const RADIO_DOT_SKIN: Partial<CSSStyleDeclaration> = {
  width: '10px',
  height: '10px',
  borderRadius: '50%',
  background: TOKENS.accent,
  pointerEvents: 'none',
};

const SUMMARY_CARD_SKIN: Partial<CSSStyleDeclaration> = {
  width: '380px',
  maxWidth: '100%',
  padding: '14px 18px',
  boxSizing: 'border-box',
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  gap: '6px',
  background: TOKENS.surface,
  border: CONTROL_BORDER,
  borderRadius: TOKENS.radius,
  boxShadow: TOKENS.shadow,
};

// ─── Small pure-shaped builders ──────────────────────────────────────────────

const fieldLabel = (text: string): HTMLSpanElement => {
  const el = document.createElement('span');
  el.textContent = text;
  applyStyles(el, FIELD_LABEL_SKIN);
  return el;
};

const controlRow = (...children: HTMLElement[]): HTMLDivElement => {
  const row = document.createElement('div');
  applyStyles(row, ROW_SKIN);
  row.append(...children);
  return row;
};

// Per-element transition guard. A control blocks re-activating ITSELF while
// its own cycle is in flight (it's particles then) — NOT while some other
// control is dissolving, so one dissolved element never freezes the rest of
// the panel. (The headless factories have this built in; these plain-DOM
// stand-ins replicate it locally via a WeakSet keyed on the element.)
const inFlight = new WeakSet<HTMLElement>();

const guardedDissolve = (screen: ScreenController, el: HTMLElement): void => {
  if (inFlight.has(el)) return;
  inFlight.add(el);
  void screen.dissolve(el).finally(() => inFlight.delete(el));
};

// Discrete-control activation: gate on THIS element, mutate state, re-render
// the real element, THEN rasterize+dissolve — the captured silhouette is the
// new state, so the cloud reforms onto what the user toggled to.
const activateThenDissolve = (
  screen: ScreenController,
  el: HTMLElement,
  mutate: () => void,
): void => {
  if (inFlight.has(el)) return;
  mutate();
  guardedDissolve(screen, el);
};

// ─── Experiment ──────────────────────────────────────────────────────────────

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
    <span class="doc-eyebrow">EXPERIMENT · 05</span>
    <h1>controls — real DOM, rasterized transitions</h1>
    <p>The controls showcase rebuilt on Pattern A. Every control is a real element — the browser supplies focus, keyboard activation, and screen-reader semantics natively (no mirror). Activating a discrete control mutates state, then <code>screen.dissolve(el)</code> rasterizes the element as painted and round-trips it through the shared transition core. The slider and text field are <code>live-dom</code>: their continuous interaction is never rasterized away — only the edges (double-click / commit) dissolve.</p>
  `;
  root.appendChild(head);

  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.setAttribute('data-experiment', 'controls');
  stage.innerHTML = `
    <div class="experiment-canvas-wrap surface-card">
      <div data-role="content-host"></div>
    </div>
    <aside class="experiment-aside surface-card">
      <header class="experiment-aside-head">
        <span class="experiment-aside-eyebrow">STATE</span>
      </header>
      <dl class="experiment-state">
        <div class="state-row"><dt>NAME</dt><dd data-key="name">—</dd></div>
        <div class="state-row"><dt>AGREE</dt><dd data-key="agree">—</dd></div>
        <div class="state-row"><dt>NEWSLETTER</dt><dd data-key="newsletter">—</dd></div>
        <div class="state-row"><dt>COLOR</dt><dd data-key="color">—</dd></div>
        <div class="state-row"><dt>VOLUME</dt><dd data-key="volume">—</dd></div>
        <div class="state-row"><dt>SUBMITS</dt><dd data-key="submits">0</dd></div>
      </dl>
      <footer class="experiment-aside-foot">
        <code>state → render → dissolve(el) → reform</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);

  const host = stage.querySelector<HTMLDivElement>('[data-role="content-host"]')!;
  applyStyles(host, HOST_SKIN);
  // Theme the particle clouds: resolveParticlePalette reads these custom
  // properties off the dissolving element's computed style cascade.
  host.style.setProperty('--screean-particle', TOKENS.accent);
  host.style.setProperty('--screean-particle-2', TOKENS.fg);

  const stateEls = {
    name: stage.querySelector<HTMLElement>('[data-key="name"]')!,
    agree: stage.querySelector<HTMLElement>('[data-key="agree"]')!,
    newsletter: stage.querySelector<HTMLElement>('[data-key="newsletter"]')!,
    color: stage.querySelector<HTMLElement>('[data-key="color"]')!,
    volume: stage.querySelector<HTMLElement>('[data-key="volume"]')!,
    submits: stage.querySelector<HTMLElement>('[data-key="submits"]')!,
  };

  // ── Overlay canvas — the dissolve theater ─────────────────────────────────
  // The transition core spawns particles at the dissolving element's
  // VIEWPORT rect (bitmapFieldFromElement origin = getBoundingClientRect)
  // and the renderer maps world coords 1:1 onto the canvas. The canvas must
  // therefore sit at the viewport origin: position FIXED, inset 0 — owned by
  // (and torn down with) this experiment, but viewport-aligned, exactly like
  // the #portal canvas in /components.html. Absolute-in-container would draw
  // every burst offset by the container's viewport position.
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

  // ONE controller: world + forces + renderer + rAF + the four-frame machine.
  const screen = createScreenController({ canvas: overlay, feel: THEME.feel });

  // ── State ──────────────────────────────────────────────────────────────────
  const state = {
    name: 'the6ixCollective',
    agree: false,
    newsletter: true,
    color: 'cyan' as ColorChoice,
    volume: 40,
    submits: 0,
  };

  // ── Content: real DOM controls ────────────────────────────────────────────
  const title = document.createElement('h2');
  title.textContent = 'Form controls';
  applyStyles(title, {
    margin: '0',
    font: `${THEME.fontWeight} 24px ${TOKENS.fontHead}`,
    textTransform: TOKENS.headTransform,
    letterSpacing: TOKENS.headTracking,
  });

  const blurb = document.createElement('p');
  blurb.textContent = 'click any control — it rasterizes, bursts, and reforms';
  applyStyles(blurb, { margin: '0', font: CONTROL_FONT, color: TOKENS.muted });

  // Text field — live-dom (typing is real input; the COMMIT dissolves).
  const nameInput = document.createElement('input');
  nameInput.type = 'text';
  nameInput.value = state.name;
  nameInput.setAttribute('aria-label', 'Name');
  applyStyles(nameInput, TEXT_FIELD_SKIN);
  const onNameInput = (): void => {
    state.name = nameInput.value;
    render();
  };
  const onNameChange = (): void => {
    guardedDissolve(screen, nameInput);
  };
  nameInput.addEventListener('input', onNameInput);
  nameInput.addEventListener('change', onNameChange);

  // Checkbox — discrete, rasterize on toggle. A real <button> so Enter/Space
  // activation comes free; role + aria-checked make it a checkbox to AT.
  const agreeBox = document.createElement('button');
  agreeBox.type = 'button';
  agreeBox.setAttribute('role', 'checkbox');
  agreeBox.setAttribute('aria-label', 'I agree');
  applyStyles(agreeBox, CHECKBOX_SKIN);
  const onAgreeClick = (): void =>
    activateThenDissolve(screen, agreeBox, () => {
      state.agree = !state.agree;
      render();
    });
  agreeBox.addEventListener('click', onAgreeClick);

  // Switch — discrete, rasterize on toggle.
  const newsSwitch = document.createElement('button');
  newsSwitch.type = 'button';
  newsSwitch.setAttribute('role', 'switch');
  newsSwitch.setAttribute('aria-label', 'Newsletter');
  applyStyles(newsSwitch, SWITCH_SKIN);
  const newsKnob = document.createElement('span');
  applyStyles(newsKnob, SWITCH_KNOB_SKIN);
  newsSwitch.appendChild(newsKnob);
  const onNewsClick = (): void =>
    activateThenDissolve(screen, newsSwitch, () => {
      state.newsletter = !state.newsletter;
      render();
    });
  newsSwitch.addEventListener('click', onNewsClick);

  // Radio group — discrete; the CLICKED radio dissolves (the deselected one
  // just re-renders — one burst per activation keeps the choreography legible).
  const radioByColor = new Map<ColorChoice, { el: HTMLButtonElement; dot: HTMLSpanElement }>();
  const radioCleanups: Array<() => void> = [];
  const radioRowFor = (c: ColorChoice): HTMLDivElement => {
    const radio = document.createElement('button');
    radio.type = 'button';
    radio.setAttribute('role', 'radio');
    radio.setAttribute('aria-label', c);
    applyStyles(radio, RADIO_SKIN);
    const dot = document.createElement('span');
    applyStyles(dot, RADIO_DOT_SKIN);
    radio.appendChild(dot);
    radioByColor.set(c, { el: radio, dot });
    const onRadioClick = (): void =>
      activateThenDissolve(screen, radio, () => {
        state.color = c;
        render();
      });
    radio.addEventListener('click', onRadioClick);
    radioCleanups.push(() => radio.removeEventListener('click', onRadioClick));
    return controlRow(radio, fieldLabel(c));
  };

  // Submit — the library's headless button (rasterize strategy built in).
  const submit = headlessButton({
    screen,
    label: 'Submit',
    onClick: () => {
      state.submits += 1;
      render();
    },
  });

  // Volume — the library's headless slider (live-dom strategy built in).
  // Drag/arrows are live; double-click rasterizes the inners at the current
  // value for the same dissolve every discrete control gets.
  const volume = headlessSlider({
    screen,
    value: state.volume,
    ariaLabel: 'Volume',
    onChange: (v) => {
      state.volume = v;
      render();
    },
  });
  const onSliderDblClick = (): void => void volume.dissolve();
  volume.el.addEventListener('dblclick', onSliderDblClick);
  // Re-skin the slider's real inner parts for the light theme (the default
  // skin targets dark surfaces). Inline writes — still foreignObject-safe.
  const sliderPart = (part: string): HTMLElement | null =>
    volume.el.querySelector<HTMLElement>(`[data-part="${part}"]`);
  applyStyles(sliderPart('track') ?? volume.el, { background: TOKENS.subtle, border: CONTROL_BORDER });
  applyStyles(sliderPart('fill') ?? volume.el, { background: TOKENS.accent });
  applyStyles(sliderPart('thumb') ?? volume.el, { background: TOKENS.fg, boxShadow: 'none' });

  // Summary card — read-only real DOM; re-renders with state.
  const summaryCard = document.createElement('div');
  applyStyles(summaryCard, SUMMARY_CARD_SKIN);
  const summaryTitle = document.createElement('strong');
  applyStyles(summaryTitle, { font: `700 15px ${TOKENS.fontMono}` });
  const summaryBody = document.createElement('span');
  applyStyles(summaryBody, { font: CONTROL_FONT, color: TOKENS.muted });
  summaryCard.append(summaryTitle, summaryBody);

  host.append(
    title,
    blurb,
    controlRow(fieldLabel('name'), nameInput),
    controlRow(agreeBox, fieldLabel('I agree'), newsSwitch, fieldLabel('Newsletter')),
    controlRow(...COLORS.map((c) => radioRowFor(c))),
    controlRow(submit.el, volume.el),
    summaryCard,
  );

  // ── Render: state → real-DOM visuals + side panel ─────────────────────────
  const render = (): void => {
    agreeBox.setAttribute('aria-checked', String(state.agree));
    agreeBox.textContent = state.agree ? '✓' : '';
    agreeBox.style.background = state.agree ? TOKENS.accent : TOKENS.surface;

    newsSwitch.setAttribute('aria-checked', String(state.newsletter));
    newsSwitch.style.background = state.newsletter ? TOKENS.accent : TOKENS.surface;
    newsKnob.style.transform = state.newsletter ? 'translateX(18px)' : 'translateX(0)';

    for (const [c, { el, dot }] of radioByColor) {
      const checked = state.color === c;
      el.setAttribute('aria-checked', String(checked));
      dot.style.opacity = checked ? '1' : '0';
    }

    summaryTitle.textContent = state.name ? `Hi, ${state.name}` : 'Hi there';
    summaryBody.textContent = `${state.agree ? '✓' : '○'} agree · ${state.newsletter ? '✓' : '○'} newsletter · ${state.color} · vol ${state.volume}`;

    stateEls.name.textContent = state.name || '(empty)';
    stateEls.agree.textContent = String(state.agree);
    stateEls.newsletter.textContent = String(state.newsletter);
    stateEls.color.textContent = state.color;
    stateEls.volume.textContent = String(state.volume);
    stateEls.submits.textContent = String(state.submits);
  };
  render();

  root.appendChild(renderFooter());

  // ── Teardown ──────────────────────────────────────────────────────────────
  return () => {
    screen.dispose();
    nameInput.removeEventListener('input', onNameInput);
    nameInput.removeEventListener('change', onNameChange);
    agreeBox.removeEventListener('click', onAgreeClick);
    newsSwitch.removeEventListener('click', onNewsClick);
    volume.el.removeEventListener('dblclick', onSliderDblClick);
    for (const cleanup of radioCleanups) cleanup();
    submit.dispose();
    volume.dispose();
    overlay.remove();
  };
};
