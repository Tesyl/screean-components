// button experiment — proves the promoted component layer works end-to-end:
//
//   • `button({ label, onClick, onPointerEnter, onPointerLeave, onPointerDown,
//     onPointerUp })` builds a SceneNode subtree (rounded-rect chrome + text)
//     tagged as a Component.
//   • `createPointerTracker(scene)` consumes pointer events and fires the
//     button's handlers at the right moments — one onPointerEnter per
//     transition into the hit region, etc.
//   • `routePointerEvent(scene, 'click', ...)` dispatches discrete clicks.
//
// Visual feedback: each handler swaps the live particle palette by hue so
// the button's matter visibly changes color on hover, press, and click.
// Side panel shows the tracker's hover/press state and a click counter.

import { THEMES, DEFAULT_THEME } from '../themes';
import { renderNav, renderFooter } from '../layout';
import { Stage, makeColor } from '../embed';
import type { Palette } from '../themes';
import { scene, camera } from '@tesyl/screean';
import { spawn } from '@tesyl/screean';
import { TRANSPARENT } from '@tesyl/screean';
// Site code consumes components through the package barrel, same as any
// external consumer would. Keeps the subdivision (factories/, dom/, routing/)
// internal to the components package.
import {
  button,
  createPointerTracker,
  routePointerEvent,
  type Component,
} from '../../src/components';
import { attachFullscreenButton } from '../lib/ui/fullscreen';

// State-keyed palettes. Hue rotates so hover/press/click read as real
// "different states" rather than tonal jitter. Lit + sat held constant for
// coherence.
const PALETTES: Record<'idle' | 'hover' | 'press' | 'flash', Palette> = {
  idle:  { hueCenter:  70, hueRange: 12, sat: 0.95, lit: 0.58 }, // chartreuse
  hover: { hueCenter: 310, hueRange: 18, sat: 0.95, lit: 0.62 }, // hot pink
  press: { hueCenter: 200, hueRange: 18, sat: 0.95, lit: 0.62 }, // electric blue
  flash: { hueCenter:   0, hueRange: 14, sat: 0.95, lit: 0.66 }, // hot red
};

// Recolor the live particles toward `palette`. Used inside button handlers.
const recolor = (stage: Stage, palette: Palette): void => {
  stage.setPalette(palette);
  const c = makeColor(palette);
  for (const p of stage.world.particles) {
    if (p.life > 0) p.color = c();
  }
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
    <span class="doc-eyebrow">EXPERIMENT · 01</span>
    <h1>button</h1>
    <p>The screean button() factory composes a rect + text into a single Component. Pointer events route through a stateful tracker that fires hover, press, and release at the right moments — same semantics as native HTML.</p>
  `;
  root.appendChild(head);

  // Layout: canvas + state side-panel.
  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.innerHTML = `
    <div class="experiment-canvas-wrap surface-card">
      <canvas class="experiment-canvas" aria-hidden="true"></canvas>
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
        <code>button({ label, onClick, onPointerEnter, … })</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);

  const canvas = stage.querySelector<HTMLCanvasElement>('.experiment-canvas')!;
  const wrap = stage.querySelector<HTMLDivElement>('.experiment-canvas-wrap')!;
  const INITIAL_W = 720;
  const INITIAL_H = 420;
  const W = INITIAL_W;
  const H = INITIAL_H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const stateEls = {
    hovered: stage.querySelector<HTMLElement>('[data-key="hovered"]')!,
    pressed: stage.querySelector<HTMLElement>('[data-key="pressed"]')!,
    clicks:  stage.querySelector<HTMLElement>('[data-key="clicks"]')!,
    event:   stage.querySelector<HTMLElement>('[data-key="event"]')!,
  };
  let clicks = 0;
  const setEvent = (kind: string, target: Component | null) => {
    stateEls.event.textContent = `${kind.toUpperCase()}${target ? ' / ' + (target._component.ariaLabel ?? '?') : ''}`;
  };
  const setHovered = (c: Component | null) => {
    stateEls.hovered.textContent = c ? (c._component.ariaLabel ?? '?') : '—';
  };
  const setPressed = (c: Component | null) => {
    stateEls.pressed.textContent = c ? (c._component.ariaLabel ?? '?') : '—';
  };

  // Build the screean canvas via Stage.
  const sg = new Stage({
    canvas,
    width: W,
    height: H,
    feel: theme.feel,
    feelOverrides: theme.feelOverrides,
    palette: PALETTES.idle,
    particleCount: 2200,
    spawnFrom: 'edge',
    spawnSpeed: 280,
    portal: false,
    particleSize: 1.0,
    trailAlpha: 0.18,
  });

  // Build the button. We don't use Stage.setScene here because we need to
  // construct the scene with a `camera` root so the pointer tracker can map
  // screen → world. Stage.setScene wraps content in a camera already; we
  // do it manually so we can keep the button as a top-level child.
  const btn = button({
    label: 'TAP ME',
    width: 280,
    height: 96,
    radius: 16,
    font: '700 28px ui-monospace, "SF Mono", Menlo, monospace',
    onClick: (e) => {
      clicks += 1;
      stateEls.clicks.textContent = String(clicks);
      setEvent('click', e.component);
      // Brief "flash" recolor that decays back to idle/hover after 320ms.
      recolor(sg, PALETTES.flash);
      setTimeout(() => {
        recolor(sg, tracker.hovered ? PALETTES.hover : PALETTES.idle);
      }, 320);
    },
    onPointerEnter: (e) => {
      setHovered(e.component);
      setEvent('enter', e.component);
      if (!tracker.pressed) recolor(sg, PALETTES.hover);
    },
    onPointerLeave: (e) => {
      setHovered(null);
      setEvent('leave', e.component);
      if (!tracker.pressed) recolor(sg, PALETTES.idle);
    },
    onPointerDown: (e) => {
      setPressed(e.component);
      setEvent('down', e.component);
      recolor(sg, PALETTES.press);
    },
    onPointerUp: (e) => {
      setPressed(null);
      setEvent('up', e.component);
      recolor(sg, tracker.hovered ? PALETTES.hover : PALETTES.idle);
    },
  });

  // Compose a scene with a camera root + the button centered.
  const sceneObj = scene(
    { particleCount: 2200 },
    camera({ viewport: { w: W, h: H }, pan: [W / 2 - 140, H / 2 - 48] }, btn),
  );
  // Spawn particles + bind to the button.
  sg.world.particles.length = 0;
  sg.world.addParticles(spawn({
    n: 2200,
    origin: { kind: 'edge', width: W, height: H },
    color: TRANSPARENT,
    speed: 280,
    toward: { x: W / 2, y: H / 2 },
  }));
  sceneObj.tick(0);
  sceneObj.bindAll(sg.world.particles, { kind: 'bounds-area' });
  recolor(sg, PALETTES.idle);

  // Patch Stage to use this scene by stashing it via a private field — but
  // since we built our own, we drive ticks from the same RAF Stage uses
  // (the shared ticker). Easiest path: replace Stage's currentScene so the
  // ticker steps it. We can't reach into private state, so instead we drive
  // the scene's tick from an additional RAF. Cheap.
  let extraRaf = 0;
  let lastT = performance.now();
  const driveScene = (now: number) => {
    extraRaf = requestAnimationFrame(driveScene);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    sceneObj.tick(dt);
  };
  extraRaf = requestAnimationFrame(driveScene);

  // The Stage ticker already calls sg.world.tick + renderer.draw. The
  // scene is what owns layout + bindings; we tick it independently so the
  // button stays bound at its current location even if the layout changes.
  // Note: we do NOT call sg.setScene because that would replace our
  // hand-rolled scene with a Stage-built one.

  // Pointer tracker — attaches hover/press semantics on top of the scene.
  const tracker = createPointerTracker(sceneObj);

  const handlePointer = (e: PointerEvent, kind: 'move' | 'down' | 'up' | 'click') => {
    const r = canvas.getBoundingClientRect();
    const sx = e.clientX - r.left;
    const sy = e.clientY - r.top;
    if (!sceneObj.camera) return;
    const world = sceneObj.camera.toWorld([sx, sy]);
    if (kind === 'move') tracker.onPointerMove(world, [sx, sy]);
    else if (kind === 'down') tracker.onPointerDown(world, [sx, sy]);
    else if (kind === 'up') tracker.onPointerUp(world, [sx, sy]);
    else if (kind === 'click') routePointerEvent(sceneObj, 'click', world, [sx, sy]);
  };

  canvas.addEventListener('pointermove',  (e) => handlePointer(e, 'move'));
  canvas.addEventListener('pointerdown',  (e) => handlePointer(e, 'down'));
  canvas.addEventListener('pointerup',    (e) => handlePointer(e, 'up'));
  canvas.addEventListener('click',        (e) => handlePointer(e, 'click'));
  canvas.addEventListener('pointerleave', () => tracker.onPointerLeaveCanvas());

  // Fullscreen toggle. The scene's camera pan was baked in at creation, so
  // the button stays at its original world-space position; the canvas just
  // grows around it. Acceptable trade-off for v1 — the dissolve/recolor
  // visual still reads. Re-centering would require rebuilding the scene.
  const fs = attachFullscreenButton({
    wrap,
    restoreWidth: INITIAL_W,
    restoreHeight: INITIAL_H,
    onResize: (w, h) => {
      sg.resize(w, h);
    },
  });

  root.appendChild(renderFooter());

  return () => {
    if (extraRaf) cancelAnimationFrame(extraRaf);
    fs.dispose();
    sg.dispose();
  };
};
