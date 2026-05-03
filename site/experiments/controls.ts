// controls experiment — every form control in the screean-components
// library, with the components.html "shatter and reform" choreography.
// Each click fires `dissolve.trigger(component)` BEFORE the state mutates;
// particles burst, the DOM mirror fades out, scene rebuilds with the new
// state, particles ease home to the new positions, mirror fades back in.
//
// Architecture notes:
//   - Scene root is created ONCE at mount and persists for the experiment's
//     lifetime. State changes mutate the camera's children in place rather
//     than replacing the whole scene tree. This keeps `createDissolve`'s
//     captured `scene` reference valid across rebuilds.
//   - Component IDs are stable across rebuilds so the DOM mirror reuses
//     elements. Cursor / focus / opacity-mid-dissolve all survive the
//     state change without flicker.
//   - Inline `<style>` tag installs per-role mirror chrome (matching the
//     button-grid demo) so the components render visibly. Without this CSS
//     the mirror divs are positioned-but-invisible — the dissolve choreo
//     would still fire but you'd only see clouds.

import {
  scene,
  camera,
  cameraOf,
  column,
  row,
  spawn,
  TRANSPARENT,
  type SceneNode,
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
  createChoreoRunner,
  dissolve,
  groupOfComponent,
  pipe,
} from '../../src/components';

import { renderNav, renderFooter } from '../layout';
import { Stage } from '../embed';
import { THEMES, DEFAULT_THEME } from '../themes';
import { attachFullscreenButton } from '../lib/ui/fullscreen';

const COLORS = ['cyan', 'magenta', 'yellow'] as const;
type ColorChoice = (typeof COLORS)[number];

// Programmatic image source. Self-contained so the experiment doesn't
// depend on an external asset under site/assets/.
const buildImageSource = (size: number): HTMLCanvasElement => {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
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

// Per-role mirror chrome. Mirrors the styling pattern from
// `/components.html` so the controls actually look like form elements
// instead of phantom hit-areas. The selectors target the mirror's
// auto-generated `#screean-mirror > [role="..."]` divs (and the
// `<input>` for textbox role).
//
// Scoped under [data-experiment="controls"] so the styles don't leak
// to other experiments in the same SPA.
const CONTROLS_CSS = `
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div,
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > input {
  transition: opacity 220ms cubic-bezier(0.25, 0.6, 0.2, 1),
              background 160ms ease,
              border-color 160ms ease;
}

/* Buttons — translucent dark chrome, hairline border, soft glass blur. */
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div[role="button"] {
  background: rgba(16, 14, 28, 0.72);
  border: 1px solid rgba(199, 255, 81, 0.28);
  border-radius: 10px;
  backdrop-filter: blur(8px) saturate(1.1);
  color: rgba(230, 232, 240, 0.92);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 1px 0 rgba(255,255,255,0.04) inset,
              0 4px 16px rgba(0,0,0,0.3);
}
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div[role="button"]:hover {
  background: rgba(30, 28, 50, 0.82);
  border-color: rgba(199, 255, 81, 0.5);
}

/* Checkbox — square chrome. The check mark itself is in the particle
   field below; the chrome is just the click target / a11y surface. */
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div[role="checkbox"] {
  background: rgba(16, 14, 28, 0.65);
  border: 1px solid rgba(180, 180, 220, 0.28);
  border-radius: 4px;
  cursor: pointer;
}
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div[role="checkbox"][aria-checked="true"] {
  border-color: rgba(199, 255, 81, 0.7);
  background: rgba(40, 60, 20, 0.65);
}

/* Radio — circle chrome. */
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div[role="radio"] {
  background: rgba(16, 14, 28, 0.65);
  border: 1px solid rgba(180, 180, 220, 0.28);
  border-radius: 50%;
  cursor: pointer;
}
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div[role="radio"][aria-checked="true"] {
  border-color: rgba(199, 255, 81, 0.7);
  background: rgba(40, 60, 20, 0.65);
}

/* Textbox — real <input>; restyle browser defaults. */
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > input[role="textbox"] {
  background: rgba(16, 14, 28, 0.65);
  border: 1px solid rgba(180, 180, 220, 0.28);
  border-radius: 8px;
  padding: 0 14px;
  color: rgba(230, 232, 240, 0.95);
  outline: none;
  box-sizing: border-box;
}
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > input[role="textbox"]:focus {
  border-color: rgba(199, 255, 81, 0.6);
  background: rgba(20, 30, 14, 0.7);
}

/* Headings + body labels — text only, no chrome. */
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div[role="heading"] {
  color: rgba(240, 240, 248, 0.95);
  display: flex; align-items: center; justify-content: center;
  letter-spacing: -0.01em;
}
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div[role="text"] {
  color: rgba(200, 205, 220, 0.75);
  display: flex; align-items: center; justify-content: center;
}

/* Image — the bound rect serves as the visible chrome too. We nudge
   alpha so it reads as decorative. */
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div[role="img"] {
  border: 1px solid rgba(199, 255, 81, 0.18);
  border-radius: 8px;
}

/* Card — subtle chrome around the title+body block. */
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div:not([role]) {
  background: rgba(16, 14, 28, 0.5);
  border: 1px solid rgba(180, 180, 220, 0.12);
  border-radius: 10px;
  padding: 0 14px;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
}

/* Focus ring — visible only on Tab navigation, not on pointer click. */
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > div:focus-visible,
[data-experiment="controls"] [data-role="mirror-host"] #screean-mirror > input:focus-visible {
  outline: 2px solid rgb(199, 255, 81);
  outline-offset: 3px;
}
`;

export const mount = (root: HTMLElement): (() => void) => {
  const theme = THEMES[DEFAULT_THEME];
  root.innerHTML = '';

  // Scoped style tag — installed at mount, removed at teardown.
  const styleEl = document.createElement('style');
  styleEl.textContent = CONTROLS_CSS;
  document.head.appendChild(styleEl);

  const worldBehind = document.createElement('div');
  worldBehind.className = 'world-behind';
  worldBehind.setAttribute('aria-hidden', 'true');
  root.appendChild(worldBehind);

  root.appendChild(renderNav({ current: '/experiments' }));

  const head = document.createElement('section');
  head.className = 'doc-head';
  head.innerHTML = `
    <span class="doc-eyebrow">EXPERIMENT · 05</span>
    <h1>controls — shatter & reform</h1>
    <p>The full v1 component library running through the same dissolve choreography as <code>/components.html</code>. Each onChange fires <code>dissolve.trigger(component)</code> — particles burst, mirror fades, state mutates, scene rebuilds, particles ease home to the new shape, mirror fades back in. Real interactivity (typing, focus, IME) handled by the DOM mirror.</p>
  `;
  root.appendChild(head);

  // data-experiment="controls" scopes the inline CSS above.
  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.setAttribute('data-experiment', 'controls');
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
        <code>dissolve.trigger(comp) → state → rebuild → reform</code>
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

  const INITIAL_W = 720;
  const INITIAL_H = 600;
  let W = INITIAL_W;
  let H = INITIAL_H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const sg = new Stage({
    canvas,
    width: W,
    height: H,
    feel: theme.feel,
    feelOverrides: { springK: 60, springC: 12, drag: 0.6, repelStrength: 0 },
    palette: theme.palette,
    particleCount: 6000,
    spawnFrom: 'edge',
    spawnSpeed: 240,
    portal: false,
    particleSize: 1.0,
    trailAlpha: 0.2,
  });

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

  // Fonts.
  const FONT_TITLE = '500 24px system-ui, -apple-system, sans-serif';
  const FONT_BODY = '400 14px system-ui, -apple-system, sans-serif';
  const FONT_INPUT = '500 16px ui-monospace, "SF Mono", Menlo, monospace';
  const FONT_LABEL = '500 13px system-ui, -apple-system, sans-serif';

  const imgSource = buildImageSource(96);

  // Build just the column subtree (the "page content"). The camera + scene
  // root stay alive across rebuilds; we only swap the column inside the
  // camera. Stable component IDs so the mirror reuses elements.
  const buildColumn = (): SceneNode =>
    column({ gap: 22, padding: 24, align: 'center' }, [
      label({
        id: 'lbl-title',
        label: 'Form controls',
        ariaRole: 'heading',
        font: FONT_TITLE,
      }),
      label({
        id: 'lbl-blurb',
        label: 'click any control — shatter & reform',
        font: FONT_BODY,
      }),

      // Name input.
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
            // textField fires per-keystroke. Triggering dissolve on every
            // keystroke would be visually overwhelming; we rebuild silently
            // so the particle text follows the cursor without burst.
            state.name = e.value ?? '';
            rebuild();
          },
        }),
      ]),

      // Checkboxes.
      row({ gap: 22, align: 'center' }, [
        row({ gap: 8, align: 'center' }, [
          checkbox({
            id: 'cb-agree',
            checked: state.agree,
            onChange: (e) => {
              triggerDissolve(e.component);
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
            onChange: (e) => {
              triggerDissolve(e.component);
              state.newsletter = !state.newsletter;
              rebuild();
            },
          }),
          label({ id: 'lbl-news', label: 'Newsletter', font: FONT_LABEL }),
        ]),
      ]),

      // Radio group.
      row({ gap: 18, align: 'center' }, [
        ...COLORS.flatMap((c) => [
          row({ gap: 6, align: 'center' }, [
            radio({
              id: `rd-${c}`,
              checked: state.color === c,
              onChange: (e) => {
                triggerDissolve(e.component);
                state.color = c;
                rebuild();
              },
            }),
            label({ id: `lbl-${c}`, label: c, font: FONT_LABEL }),
          ]),
        ]),
      ]),

      // Image + submit button.
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
          onClick: (e) => {
            triggerDissolve(e.component);
            state.submits += 1;
            rebuild();
          },
        }),
      ]),

      // Read-only summary card.
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
    ]);

  // ─── Persistent scene root ──────────────────────────────────────────
  // Camera node is created ONCE; rebuilds replace its children in-place.
  // This is what lets `createDissolve` and `createDomMirror` capture
  // `scene` at construction and have that reference stay valid forever.
  const cameraNode = camera({ viewport: { w: W, h: H } }, buildColumn());
  const sceneObj = scene({ particleCount: 6000 }, cameraNode);

  sg.world.particles.length = 0;
  sg.world.addParticles(
    spawn({
      n: 6000,
      origin: { kind: 'edge', width: W, height: H },
      color: TRANSPARENT,
      speed: 220,
      toward: { x: W / 2, y: H / 2 },
    }),
  );
  sceneObj.tick(0);
  sceneObj.bindAll(sg.world.particles, { kind: 'bounds-area' });

  // Default chartreuse for live particles. Set once + after every dissolve
  // reveal so the cloud stays consistently colored. r=199, g=255, b=81, a=255.
  const PARTICLE_COLOR = (199 | (255 << 8) | (81 << 16) | (255 << 24)) >>> 0;
  const colorAll = (): void => {
    for (const p of sg.world.particles) {
      p.color = PARTICLE_COLOR as typeof p.color;
    }
  };
  colorAll();

  // ─── DOM mirror + dissolve ──────────────────────────────────────────
  // Both capture sceneObj at construction. Because we never replace the
  // scene root, both stay valid for the experiment's lifetime.
  const mirror = createDomMirror({ scene: sceneObj, host: mirrorHost });
  mirror.reconcile();

  const choreo = createChoreoRunner({
    scene: sceneObj,
    world: sg.world,
    particles: sg.world.particles,
    mirrorHost,
  });

  const triggerDissolve = (c: Parameters<typeof groupOfComponent>[0]): void => {
    choreo.run(
      pipe(
        // Particles are already chartreuse and visible at rest — no
        // pre-paint stage needed. (Other consumers would setColor here.)
        dissolve({ particlePhaseMs: 1000, returnMs: 480, fadeMs: 240 }),
        // Post-cycle: re-color any particles that drifted to TRANSPARENT.
        // This was onHide in the legacy API. Inline as a custom Effect
        // since colorAll() is closure-bound to mutable palette state.
        {
          scope: 'particle' as const,
          duration: 0,
          tick: () => colorAll(),
        },
      ),
      groupOfComponent(c),
      c,
    );
  };

  // ─── Rebuild — replaces the column subtree, preserves scene root ────
  const rebuild = (): void => {
    const newCol = buildColumn();
    cameraNode.children.length = 0;
    cameraNode.children.push(newCol);
    newCol.parent = cameraNode;
    sceneObj.tick(0);
    sceneObj.bindAll(sg.world.particles, { kind: 'bounds-area' });
    mirror.reconcile();
    refreshSidePanel();
  };

  refreshSidePanel();

  // ─── Per-frame: scene tick + mirror reconcile ───────────────────────
  let raf = 0;
  let lastT = performance.now();
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    sceneObj.tick(dt);
    choreo.tick(now);
    mirror.reconcile();
  };
  raf = requestAnimationFrame(tick);

  // Fullscreen.
  const fs = attachFullscreenButton({
    wrap,
    restoreWidth: INITIAL_W,
    restoreHeight: INITIAL_H,
    onResize: (w, h) => {
      W = w;
      H = h;
      sg.resize(w, h);
      // Camera viewport is stored on `_camera` internals; cameraOf reads
      // it. Mutating the live viewport object propagates on next tick.
      const ci = cameraOf(cameraNode);
      if (ci) {
        ci.viewport.w = w;
        ci.viewport.h = h;
      }
      rebuild();
    },
  });

  root.appendChild(renderFooter());

  return () => {
    if (raf) cancelAnimationFrame(raf);
    fs.dispose();
    choreo.dispose();
    mirror.dispose();
    sg.dispose();
    styleEl.remove();
  };
};
