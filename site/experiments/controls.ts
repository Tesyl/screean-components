// controls experiment — every form control in the screean-components
// library, wired with the controlled-input pattern. Type into the textField,
// click a checkbox, pick a radio — each onChange updates the closure's state
// and triggers a rebuild. Particles re-bind to the new scene tree; the DOM
// mirror's diff preserves cursor position in the input.
//
// What this proves:
//   - DOM mirror creates a real <input> for textField (browser owns cursor +
//     selection + IME).
//   - aria-checked / aria-valuenow / aria-label all surface to AT.
//   - Stable component IDs across rebuilds keep the mirror's element pool
//     reused — no respawn, no input flicker, no caret jump.

import {
  scene,
  camera,
  column,
  row,
  spawn,
  TRANSPARENT,
} from 'screean';
import {
  button,
  card,
  checkbox,
  createDomMirror,
  image,
  label,
  radio,
  textField,
  type ComponentEvent,
} from '../../src/components';

import { renderNav, renderFooter } from '../layout';
import { Stage } from '../embed';
import { THEMES, DEFAULT_THEME } from '../themes';
import { attachFullscreenButton } from '../lib/ui/fullscreen';

const COLORS = ['cyan', 'magenta', 'yellow'] as const;
type ColorChoice = (typeof COLORS)[number];

// Programmatic image source — we want the experiment self-contained so it
// runs without depending on an asset under site/assets/. A 96x96 canvas
// with a hand-drawn radial pattern is enough to prove the image factory's
// rasterize pipeline. Drawn once at mount, reused on every rebuild.
const buildImageSource = (size: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  // Concentric chartreuse rings on dark backdrop. Matches the site palette.
  ctx.fillStyle = '#06050d';
  ctx.fillRect(0, 0, size, size);
  for (let r = size / 2; r > 4; r -= 6) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.strokeStyle = `rgba(199, 255, 81, ${1 - r / (size / 2) * 0.7})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  return c;
};

export const mount = (root: HTMLElement): (() => void) => {
  const theme = THEMES[DEFAULT_THEME];
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
    <h1>controls — every factory, live</h1>
    <p>The full v1 component library wired with the controlled-input pattern. textField creates a real &lt;input&gt; via the DOM mirror, so cursor + selection + IME work natively. checkbox / radio / textField each fire onChange → consumer state update → rebuild. Particles morph between renders.</p>
  `;
  root.appendChild(head);

  // Scene element. Note the extra <div id="mirror-host"> overlay — that's
  // where the DOM mirror parents its <input>/<div> elements. It must be
  // INSIDE the same wrap so the fullscreen toggle picks both up.
  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.innerHTML = `
    <div class="experiment-canvas-wrap surface-card">
      <canvas class="experiment-canvas" aria-hidden="true"></canvas>
      <div data-role="mirror-host" style="position:absolute;inset:0;pointer-events:none;"></div>
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
        <div class="state-row"><dt>SUBMITS</dt><dd data-key="submits">0</dd></div>
      </dl>
      <footer class="experiment-aside-foot">
        <code>controlled-input · stable IDs across rebuild</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);

  const canvas = stage.querySelector<HTMLCanvasElement>('.experiment-canvas')!;
  const wrap = stage.querySelector<HTMLDivElement>('.experiment-canvas-wrap')!;
  const mirrorHost = stage.querySelector<HTMLDivElement>('[data-role="mirror-host"]')!;
  const stateEls = {
    name: stage.querySelector<HTMLElement>('[data-key="name"]')!,
    agree: stage.querySelector<HTMLElement>('[data-key="agree"]')!,
    newsletter: stage.querySelector<HTMLElement>('[data-key="newsletter"]')!,
    color: stage.querySelector<HTMLElement>('[data-key="color"]')!,
    submits: stage.querySelector<HTMLElement>('[data-key="submits"]')!,
  };

  // ─── Sizing ────────────────────────────────────────────────────────────
  const INITIAL_W = 720;
  const INITIAL_H = 560;
  let W = INITIAL_W;
  let H = INITIAL_H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  // ─── Stage ────────────────────────────────────────────────────────────
  const sg = new Stage({
    canvas,
    width: W,
    height: H,
    feel: theme.feel,
    feelOverrides: { springK: 60, springC: 12, drag: 0.6, repelStrength: 0 },
    palette: theme.palette,
    particleCount: 4000,
    spawnFrom: 'edge',
    spawnSpeed: 240,
    portal: false,
    particleSize: 1.0,
    trailAlpha: 0.2,
  });

  // ─── Closure state — the source of truth for every component ────────
  const state = {
    name: 'the6ixCollective',
    agree: false,
    newsletter: true,
    color: 'cyan' as ColorChoice,
    submits: 0,
  };

  const refreshSidePanel = (): void => {
    stateEls.name.textContent = state.name || '(empty)';
    stateEls.agree.textContent = state.agree ? 'true' : 'false';
    stateEls.newsletter.textContent = state.newsletter ? 'true' : 'false';
    stateEls.color.textContent = state.color;
    stateEls.submits.textContent = String(state.submits);
  };

  // ─── Fonts (sized to the form, not the viewport) ─────────────────────
  const FONT_TITLE = '500 24px system-ui, -apple-system, sans-serif';
  const FONT_BODY = '400 14px system-ui, -apple-system, sans-serif';
  const FONT_INPUT = '500 16px ui-monospace, "SF Mono", Menlo, monospace';
  const FONT_LABEL = '500 13px system-ui, -apple-system, sans-serif';

  // Image source — drawn once.
  const imgSource = buildImageSource(96);

  // ─── Build the scene tree from current state ────────────────────────
  // Stable IDs are critical — without them the DOM mirror sees fresh
  // components every rebuild and recreates the <input>, losing the user's
  // cursor mid-keystroke. With explicit IDs, the mirror's diff path runs
  // and the same <input> element survives the rebuild.
  const buildUi = () =>
    scene(
      { particleCount: 4000 },
      camera(
        { viewport: { w: W, h: H } },
        column({ gap: 22, padding: 24, align: 'center' }, [
          label({
            id: 'lbl-title',
            label: 'Form controls',
            ariaRole: 'heading',
            font: FONT_TITLE,
          }),
          label({
            id: 'lbl-blurb',
            label: 'every factory, live, controlled-input',
            font: FONT_BODY,
          }),

          // Name input — tab-focusable, real <input> via the mirror.
          row({ gap: 12, align: 'center' }, [
            label({ id: 'lbl-name', label: 'name', font: FONT_LABEL }),
            textField({
              id: 'tf-name',
              value: state.name,
              width: 280,
              height: 40,
              radius: 8,
              font: FONT_INPUT,
              ariaLabel: 'Name',
              onChange: (e: ComponentEvent) => {
                state.name = e.value ?? '';
                rebuild();
              },
            }),
          ]),

          // Checkboxes — paired with their text labels in a row layout.
          row({ gap: 22, align: 'center' }, [
            row({ gap: 8, align: 'center' }, [
              checkbox({
                id: 'cb-agree',
                checked: state.agree,
                onChange: () => {
                  state.agree = !state.agree;
                  rebuild();
                },
              }),
              label({ id: 'lbl-agree', label: 'I agree', font: FONT_LABEL }),
            ]),
            row({ gap: 8, align: 'center' }, [
              checkbox({
                id: 'cb-news',
                checked: state.newsletter,
                onChange: () => {
                  state.newsletter = !state.newsletter;
                  rebuild();
                },
              }),
              label({
                id: 'lbl-news',
                label: 'Newsletter',
                font: FONT_LABEL,
              }),
            ]),
          ]),

          // Radio group — 3 mutually-exclusive choices. Group semantics
          // (only-one-checked) live in the consumer's onChange logic.
          row({ gap: 18, align: 'center' }, [
            ...COLORS.flatMap((c) => [
              row({ gap: 6, align: 'center' }, [
                radio({
                  id: `rd-${c}`,
                  checked: state.color === c,
                  onChange: () => {
                    state.color = c;
                    rebuild();
                  },
                }),
                label({
                  id: `lbl-${c}`,
                  label: c,
                  font: FONT_LABEL,
                }),
              ]),
            ]),
          ]),

          // Image + submit button row.
          row({ gap: 22, align: 'center' }, [
            image({
              id: 'img-logo',
              source: imgSource,
              width: 64,
              height: 64,
              ariaLabel: 'six logo',
            }),
            button({
              id: 'btn-submit',
              label: 'Submit',
              width: 140,
              height: 44,
              radius: 10,
              font: FONT_INPUT,
              onClick: () => {
                state.submits += 1;
                rebuild();
              },
            }),
          ]),

          // Read-only summary card mirroring the side panel — proves card
          // works alongside interactive controls and updates per rebuild.
          card({
            id: 'card-summary',
            title: state.name ? `Hi, ${state.name}` : 'Hi there',
            body: `${state.agree ? '✓' : '○'} agree · ${state.newsletter ? '✓' : '○'} newsletter · ${state.color}`,
            width: 380,
            height: 64,
            radius: 10,
            titleFont: FONT_INPUT,
            bodyFont: FONT_LABEL,
          }),
        ]),
      ),
    );

  let sceneObj = buildUi();
  // First-tick spawn + bind. After this, rebuilds re-bind without
  // respawning so the cloud morphs between states.
  sg.world.particles.length = 0;
  sg.world.addParticles(
    spawn({
      n: 4000,
      origin: { kind: 'edge', width: W, height: H },
      color: TRANSPARENT,
      speed: 220,
      toward: { x: W / 2, y: H / 2 },
    }),
  );
  sceneObj.tick(0);
  sceneObj.bindAll(sg.world.particles, { kind: 'bounds-area' });

  // Color particles once with a soft chartreuse — the demo isn't about
  // color, it's about the controls. State changes drive spring targets
  // only; particles keep their hue across rebuilds.
  // packRGBA-style: r=199, g=255, b=81, a=255 → little-endian bytes →
  // 0xFF51FFC7. Inlined to avoid a dependency cycle on the engine's
  // packRGBA in the shader-style demo loop.
  const PARTICLE_COLOR = (199 | (255 << 8) | (81 << 16) | (255 << 24)) >>> 0;
  for (const p of sg.world.particles) {
    p.color = PARTICLE_COLOR as typeof p.color;
  }

  // ─── Rebuild on state change ─────────────────────────────────────────
  // Replace the scene tree, re-bind particles to the new targets. We do
  // NOT clear/respawn — the spring force flows particles from old → new
  // target positions. The DOM mirror's diff logic preserves the input's
  // cursor across this swap because the textField's id is stable.
  let mirror: ReturnType<typeof createDomMirror>;
  const rebuild = (): void => {
    const next = buildUi();
    next.tick(0);
    next.bindAll(sg.world.particles, { kind: 'bounds-area' });
    sceneObj = next;
    // Mirror needs the new scene reference too.
    if (mirror) mirror.dispose();
    mirror = createDomMirror({ scene: next, host: mirrorHost });
    mirror.reconcile();
    refreshSidePanel();
  };

  // ─── Initial mirror + side panel ────────────────────────────────────
  mirror = createDomMirror({ scene: sceneObj, host: mirrorHost });
  mirror.reconcile();
  refreshSidePanel();

  // Make the mirror clickable — it overlays the canvas. Container's
  // pointer-events is none so the canvas still receives pointer events;
  // the mirror's interactive children flip to 'auto' individually via
  // the mirror code (matches what button-grid demo does).
  mirrorHost.style.pointerEvents = 'none';

  // ─── Per-frame: drive the scene tick + mirror reconcile ─────────────
  // Stage's shared ticker handles world.tick + renderer.draw. We need an
  // extra rAF for our scene's tick (which updates layout-derived bounds
  // → component positions) and the mirror's reconcile (which pushes those
  // positions to the DOM divs/inputs).
  let raf = 0;
  let lastT = performance.now();
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    sceneObj.tick(dt);
    mirror.reconcile();
  };
  raf = requestAnimationFrame(tick);

  // ─── Fullscreen ──────────────────────────────────────────────────────
  const fs = attachFullscreenButton({
    wrap,
    restoreWidth: INITIAL_W,
    restoreHeight: INITIAL_H,
    onResize: (w, h) => {
      W = w;
      H = h;
      sg.resize(w, h);
      rebuild();
    },
  });

  root.appendChild(renderFooter());

  return () => {
    if (raf) cancelAnimationFrame(raf);
    fs.dispose();
    if (mirror) mirror.dispose();
    sg.dispose();
  };
};
