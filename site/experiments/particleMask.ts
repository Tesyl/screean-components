// particle-mask experiment — particles as a punch-through mask over a
// frosted (blurred) colorful backdrop.
//
// The effect mirrors a CSS `backdrop-filter: blur()` + `mask-composite:
// exclude` window, but with the static SVG mask replaced by a LIVE particle
// field — and, critically, with NO live backdrop-filter. The colorful
// backdrop is blurred ONCE into a bitmap; each frame is just two GPU-cheap
// drawImage calls:
//
//   1. drawImage(frostBitmap)                       — the pre-blurred glass
//   2. ctx.globalCompositeOperation = 'destination-out';
//      drawImage(particleMaskCanvas)                — particles erase glass
//
// A static SHARP copy of the same backdrop sits in a canvas behind, so the
// erased holes reveal crisp, vivid color through the frost. That is the exact
// equivalent of `mask-composite: exclude` (particle = clear window through
// the blur) without paying the per-frame blur cost that bites on mobile.
//
// Two toggles make the experiment a genuine perf probe:
//   • invert     — destination-in instead of destination-out: particles BECOME
//                  the frosted spots over a sharp backdrop (the inverse punch).
//   • live blur  — re-blur the backdrop every frame via ctx.filter, simulating
//                  the cost of a real backdrop-filter. Flip it and watch the
//                  FPS readout to feel exactly what the pre-blur path buys you.
//
// Click to scatter (radialImpulse from the cursor).

import { renderNav, renderFooter } from '../layout';
import { Stage } from '../embed';
import { THEMES, DEFAULT_THEME } from '../themes';
import { spawn, radialImpulse, TRANSPARENT, packRGBA } from '@tesyl/screean';
import { stepFlowfield } from '../lib/physics/flowfield';
import { attachFullscreenButton } from '../lib/ui/fullscreen';

const DEFAULTS: Record<string, number> = {
  particleCount: 6000,
  // ─── mask cosmetics (construction-time) ─────────────────────────────────
  particleSize: 2.4, // bigger sprite → bigger reveal hole
  trailAlpha: 0.45, // portal fade: high = crisp holes, low = reveal wakes
  // ─── force knobs ────────────────────────────────────────────────────────
  springK: 18,
  springC: 5.5,
  drag: 0.55,
  // ─── flow knobs ─────────────────────────────────────────────────────────
  flowSpeed: 1.0,
  flowScale: 0.013,
  flowLookahead: 28,
  // ─── frost knobs (rebuild the blurred bitmap) ───────────────────────────
  blurRadius: 18, // CSS-px blur applied to the backdrop
  milkiness: 0.32, // translucent white veil baked into the frost
  // ─── interaction ────────────────────────────────────────────────────────
  scatterKick: 360,
  scatterSoftness: 0.06,
};

type Knob = {
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  format?: (v: number) => string;
  apply: (v: number) => void;
};

// A vivid, feature-rich backdrop. Hand-picked hue blobs over a base gradient,
// plus a few hard-edged shapes (rings, a grid) so the blur is unmistakable —
// when a particle punches through, the crisp edges underneath read instantly
// against the milky frost. Drawn in DEVICE pixels (uses the canvas's own
// width/height) so it is resolution-independent.
const paintBackdrop = (ctx: CanvasRenderingContext2D, w: number, h: number): void => {
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);

  // Base diagonal gradient.
  const base = ctx.createLinearGradient(0, 0, w, h);
  base.addColorStop(0, '#0d1b3a');
  base.addColorStop(0.5, '#3b0d4f');
  base.addColorStop(1, '#0a2e3a');
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, w, h);

  // Vivid hue blobs — the "color features".
  const blobs: ReadonlyArray<[number, number, number, string]> = [
    [0.22, 0.3, 0.34, '#ff2d75'],
    [0.74, 0.24, 0.3, '#16d9c9'],
    [0.6, 0.72, 0.4, '#ffd23f'],
    [0.32, 0.78, 0.32, '#5b8cff'],
    [0.86, 0.66, 0.26, '#9b5cff'],
  ];
  ctx.globalCompositeOperation = 'lighter';
  for (const [fx, fy, fr, color] of blobs) {
    const cx = fx * w;
    const cy = fy * h;
    const r = fr * Math.min(w, h);
    const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalCompositeOperation = 'source-over';

  // Hard-edged detail: concentric rings + a faint grid. Blur turns these to
  // mush, so the sharp reveal pops.
  ctx.strokeStyle = 'rgba(255,255,255,0.18)';
  ctx.lineWidth = Math.max(1, w * 0.0016);
  for (let i = 1; i <= 6; i++) {
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, (Math.min(w, h) * 0.07) * i, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(255,255,255,0.06)';
  const cell = Math.min(w, h) * 0.08;
  for (let x = cell; x < w; x += cell) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, h);
    ctx.stroke();
  }
  for (let y = cell; y < h; y += cell) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(w, y);
    ctx.stroke();
  }
  ctx.restore();
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
    <span class="doc-eyebrow">EXPERIMENT · 16</span>
    <h1>particle-mask</h1>
    <p>Particles as a punch-through mask over a frosted backdrop. The colorful
    background is blurred <em>once</em> into a bitmap; each frame the frost is
    drawn and the live particle field erases it (<code>destination-out</code>),
    revealing the crisp, vivid backdrop through every particle. No per-frame
    <code>backdrop-filter</code> — the trio that bites mobile. Flip
    <strong>live blur</strong> to feel the difference. Click to scatter.</p>
  `;
  root.appendChild(head);

  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.innerHTML = `
    <div class="experiment-canvas-wrap surface-card">
      <div class="pm-stack" style="position:relative;margin:0 auto;">
        <canvas class="pm-sharp" aria-hidden="true" style="position:absolute;inset:0;display:block;"></canvas>
        <canvas class="pm-frost" aria-hidden="true" style="position:absolute;inset:0;display:block;"></canvas>
        <div class="pm-hud" style="position:absolute;top:10px;left:12px;font:600 12px/1.2 ui-monospace,monospace;color:#fff;background:rgba(0,0,0,0.45);padding:4px 8px;border-radius:6px;pointer-events:none;">-- fps</div>
      </div>
    </div>
    <aside class="experiment-aside surface-card">
      <header class="experiment-aside-head">
        <span class="experiment-aside-eyebrow">CONTROLS</span>
        <button type="button" class="playground-reset" data-reset>RESET</button>
      </header>
      <div class="pm-toggles" style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;">
        <button type="button" class="playground-reset" data-toggle="invert" aria-pressed="false">invert punch</button>
        <button type="button" class="playground-reset" data-toggle="liveblur" aria-pressed="false">live blur (slow)</button>
      </div>
      <div class="playground-knobs" data-knobs></div>
      <footer class="experiment-aside-foot">
        <code class="playground-code">click → scatter · particles erase the frost to reveal sharp color</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);

  const sharpCv = stage.querySelector<HTMLCanvasElement>('.pm-sharp')!;
  const frostCv = stage.querySelector<HTMLCanvasElement>('.pm-frost')!;
  const pmStack = stage.querySelector<HTMLDivElement>('.pm-stack')!;
  const wrap = stage.querySelector<HTMLDivElement>('.experiment-canvas-wrap')!;
  const hud = stage.querySelector<HTMLDivElement>('.pm-hud')!;
  const knobsHost = stage.querySelector<HTMLDivElement>('[data-knobs]')!;
  const resetBtn = stage.querySelector<HTMLButtonElement>('[data-reset]')!;

  const INITIAL_W = 720;
  const INITIAL_H = 480;
  let W = INITIAL_W;
  let H = INITIAL_H;
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  // Detached canvas the particle Stage renders into — used purely as a mask
  // source. Never appended to the DOM; drawImage reads its backing store.
  const maskCv = document.createElement('canvas');

  // Offscreen scratch holding the SHARP backdrop at device resolution. The
  // pre-blurred frost is derived from it; live-blur re-derives per frame.
  const sharpSrc = document.createElement('canvas');
  const frostBmp = document.createElement('canvas');

  const sharpCtx = sharpCv.getContext('2d')!;
  const frostCtx = frostCv.getContext('2d')!;
  const sharpSrcCtx = sharpSrc.getContext('2d')!;
  const frostBmpCtx = frostBmp.getContext('2d')!;

  const state = {
    flowSpeed: DEFAULTS.flowSpeed,
    blurRadius: DEFAULTS.blurRadius,
    milkiness: DEFAULTS.milkiness,
    scatterKick: DEFAULTS.scatterKick,
    scatterSoftness: DEFAULTS.scatterSoftness,
    particleCount: DEFAULTS.particleCount,
    invert: false,
    liveBlur: false,
  };

  // Bake the frost bitmap = blurred sharp backdrop + milky veil. Called once
  // per backdrop/blur/milk change (NOT per frame).
  const buildFrost = (): void => {
    const wd = frostBmp.width;
    const hd = frostBmp.height;
    frostBmpCtx.setTransform(1, 0, 0, 1, 0, 0);
    frostBmpCtx.clearRect(0, 0, wd, hd);
    frostBmpCtx.filter = `blur(${state.blurRadius * dpr}px)`;
    frostBmpCtx.drawImage(sharpSrc, 0, 0);
    frostBmpCtx.filter = 'none';
    frostBmpCtx.fillStyle = `rgba(255,255,255,${state.milkiness})`;
    frostBmpCtx.fillRect(0, 0, wd, hd);
  };

  // Size every surface to the current (W, H) at device resolution, repaint the
  // backdrop, and rebuild the frost. Called on mount + on resize.
  const layout = (): void => {
    const wd = Math.round(W * dpr);
    const hd = Math.round(H * dpr);
    for (const cv of [sharpCv, frostCv, sharpSrc, frostBmp]) {
      cv.width = wd;
      cv.height = hd;
    }
    sharpCv.style.width = frostCv.style.width = `${W}px`;
    sharpCv.style.height = frostCv.style.height = `${H}px`;
    // The positioning container needs explicit size — both canvases are
    // absolute, so without this the wrap collapses to zero height.
    pmStack.style.width = `${W}px`;
    pmStack.style.height = `${H}px`;

    // Sharp backdrop: paint once into the source, blit to the visible bottom
    // canvas (it never changes after this).
    paintBackdrop(sharpSrcCtx, wd, hd);
    sharpCtx.setTransform(1, 0, 0, 1, 0, 0);
    sharpCtx.clearRect(0, 0, wd, hd);
    sharpCtx.drawImage(sharpSrc, 0, 0);

    buildFrost();
  };

  layout();

  // Particle Stage — renders white, fully-opaque sprites into the detached
  // mask canvas. Portal mode + bloom off → solid alpha coverage, which is all
  // destination-out needs. Color is irrelevant to a mask.
  const sg = new Stage({
    canvas: maskCv,
    width: W,
    height: H,
    feel: theme.feel,
    feelOverrides: {
      springK: DEFAULTS.springK,
      springC: DEFAULTS.springC,
      drag: DEFAULTS.drag,
    },
    palette: { ...theme.palette, sat: 0, lit: 1, hueRange: 0 },
    particleCount: DEFAULTS.particleCount,
    spawnFrom: 'edge',
    spawnSpeed: 220,
    portal: true,
    bloom: false,
    particleSize: DEFAULTS.particleSize,
    trailAlpha: DEFAULTS.trailAlpha,
  });

  const respawn = (n: number): void => {
    state.particleCount = n;
    sg.world.particles.length = 0;
    sg.world.addParticles(
      spawn({
        n,
        origin: { kind: 'edge', width: W, height: H },
        color: TRANSPARENT,
        speed: 240,
        toward: { x: W / 2, y: H / 2 },
      }),
    );
    // White, fully opaque — the mask wants coverage, not color.
    const white = packRGBA(255, 255, 255, 255);
    for (const p of sg.world.particles) p.color = white;
  };

  respawn(DEFAULTS.particleCount);

  // Composite + flow loop. Separate from the shared ticker (which drives the
  // Stage's particle render into maskCv); this reads the freshest mask each
  // frame. Per-frame cost: flow step + frost draw + one masked drawImage.
  let raf = 0;
  let fpsAccum = 0;
  let fpsFrames = 0;
  let fpsLast = performance.now();

  const composite = (now: number): void => {
    raf = requestAnimationFrame(composite);

    stepFlowfield(sg.world.particles, {
      time: now / 1000,
      scale: DEFAULTS.flowScale,
      lookahead: DEFAULTS.flowLookahead,
      speed: state.flowSpeed,
      bounds: { w: W, h: H },
    });

    const wd = frostCv.width;
    const hd = frostCv.height;
    frostCtx.setTransform(1, 0, 0, 1, 0, 0);
    frostCtx.globalCompositeOperation = 'source-over';
    frostCtx.clearRect(0, 0, wd, hd);

    if (state.liveBlur) {
      // The expensive path: re-blur the backdrop every frame (≈ backdrop-filter).
      frostCtx.filter = `blur(${state.blurRadius * dpr}px)`;
      frostCtx.drawImage(sharpSrc, 0, 0);
      frostCtx.filter = 'none';
      frostCtx.fillStyle = `rgba(255,255,255,${state.milkiness})`;
      frostCtx.fillRect(0, 0, wd, hd);
    } else {
      // The cheap path: blit the pre-baked frost bitmap.
      frostCtx.drawImage(frostBmp, 0, 0);
    }

    // Punch the particle field through the frost. destination-out → particles
    // erase frost (holes reveal sharp behind). destination-in → keep frost
    // only where particles are (particles become the frosted spots).
    frostCtx.globalCompositeOperation = state.invert ? 'destination-in' : 'destination-out';
    frostCtx.drawImage(maskCv, 0, 0, wd, hd);
    frostCtx.globalCompositeOperation = 'source-over';

    // FPS readout (rolling, ~4 Hz).
    fpsFrames++;
    fpsAccum += now - fpsLast;
    fpsLast = now;
    if (fpsAccum >= 250) {
      const fps = (fpsFrames * 1000) / fpsAccum;
      hud.textContent = `${fps.toFixed(0)} fps · ${(state.particleCount / 1000).toFixed(1)}k`;
      fpsAccum = 0;
      fpsFrames = 0;
    }
  };
  raf = requestAnimationFrame(composite);

  // Click → scatter, in mask/canvas-local coordinates (which equal world px).
  const onClick = (e: MouseEvent): void => {
    const r = frostCv.getBoundingClientRect();
    radialImpulse(sg.world.particles, {
      origin: { x: e.clientX - r.left, y: e.clientY - r.top },
      kick: state.scatterKick,
      softness: state.scatterSoftness,
    });
  };
  frostCv.addEventListener('click', onClick);

  const fs = attachFullscreenButton({
    wrap,
    restoreWidth: INITIAL_W,
    restoreHeight: INITIAL_H,
    onResize: (w, h) => {
      W = w;
      H = h;
      sg.resize(w, h);
      layout();
    },
  });

  // Toggle buttons.
  const toggleBtns = stage.querySelectorAll<HTMLButtonElement>('[data-toggle]');
  toggleBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      const key = btn.dataset.toggle as 'invert' | 'liveblur';
      if (key === 'invert') state.invert = !state.invert;
      else state.liveBlur = !state.liveBlur;
      const on = key === 'invert' ? state.invert : state.liveBlur;
      btn.setAttribute('aria-pressed', String(on));
      btn.style.opacity = on ? '1' : '0.55';
    });
    btn.style.opacity = '0.55';
  });

  const knobs: Knob[] = [
    {
      label: 'particles',
      min: 1000,
      max: 30000,
      step: 500,
      initial: DEFAULTS.particleCount,
      format: (v) => `${Math.round(v)}`,
      apply: (v) => respawn(Math.round(v)),
    },
    {
      label: 'flow speed',
      min: 0,
      max: 4,
      step: 0.05,
      initial: DEFAULTS.flowSpeed,
      format: (v) => `${v.toFixed(2)}×`,
      apply: (v) => { state.flowSpeed = v; },
    },
    {
      label: 'blur radius',
      min: 0,
      max: 48,
      step: 1,
      initial: DEFAULTS.blurRadius,
      format: (v) => `${v.toFixed(0)}px`,
      apply: (v) => { state.blurRadius = v; if (!state.liveBlur) buildFrost(); },
    },
    {
      label: 'glass milkiness',
      min: 0,
      max: 0.8,
      step: 0.02,
      initial: DEFAULTS.milkiness,
      format: (v) => v.toFixed(2),
      apply: (v) => { state.milkiness = v; if (!state.liveBlur) buildFrost(); },
    },
    {
      label: 'spring k',
      min: 4,
      max: 120,
      step: 1,
      initial: DEFAULTS.springK,
      format: (v) => v.toFixed(0),
      apply: (v) => sg.setFeelOverrides({ springK: v }),
    },
    {
      label: 'drag',
      min: 0.05,
      max: 1.5,
      step: 0.05,
      initial: DEFAULTS.drag,
      format: (v) => v.toFixed(2),
      apply: (v) => sg.setFeelOverrides({ drag: v }),
    },
    {
      label: 'scatter kick',
      min: 0,
      max: 1500,
      step: 20,
      initial: DEFAULTS.scatterKick,
      format: (v) => v.toFixed(0),
      apply: (v) => { state.scatterKick = v; },
    },
  ];

  const inputs: HTMLInputElement[] = [];
  const valueEls: HTMLSpanElement[] = [];

  knobs.forEach((k, idx) => {
    const w = document.createElement('div');
    w.className = 'pg-knob';
    w.innerHTML = `
      <div class="pg-knob-head">
        <span class="pg-knob-label">${k.label}</span>
        <span class="pg-knob-value" data-knob-value="${idx}">${k.format ? k.format(k.initial) : k.initial}</span>
      </div>
      <input class="pg-knob-slider" type="range"
             min="${k.min}" max="${k.max}" step="${k.step}" value="${k.initial}"
             data-knob-input="${idx}" />
    `;
    knobsHost.appendChild(w);
    const input = w.querySelector<HTMLInputElement>('input')!;
    const valueEl = w.querySelector<HTMLSpanElement>('.pg-knob-value')!;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valueEl.textContent = k.format ? k.format(v) : String(v);
      k.apply(v);
    });
    inputs.push(input);
    valueEls.push(valueEl);
  });

  resetBtn.addEventListener('click', () => {
    knobs.forEach((k, idx) => {
      inputs[idx].value = String(k.initial);
      valueEls[idx].textContent = k.format ? k.format(k.initial) : String(k.initial);
      k.apply(k.initial);
    });
  });

  root.appendChild(renderFooter());

  return () => {
    if (raf) cancelAnimationFrame(raf);
    frostCv.removeEventListener('click', onClick);
    fs.dispose();
    sg.dispose();
  };
};
