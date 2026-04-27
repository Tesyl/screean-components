// flowfield experiment — particles drifting through a bounded curl-like
// 2D vector field. No projection, no model, no text — just the field
// driving every particle toward a moving target each frame, with the
// spring + drag forces shaping the motion.
//
// Click to scatter (radialImpulse from the cursor).

import { renderNav, renderFooter } from '../layout';
import { Stage, makeColor } from '../embed';
import { THEMES, DEFAULT_THEME } from '../themes';
import { spawn, radialImpulse, TRANSPARENT } from 'screean';
import { stepFlowfield } from '../lib/physics/flowfield';
import { attachFullscreenButton } from '../lib/ui/fullscreen';

const DEFAULTS: Record<string, number> = {
  particleCount: 8000,
  // ─── force knobs ───────────────────────────────────────────────────────
  springK: 18,         // softer than mesh experiment — flow looks better
  springC: 5.5,        // when particles trail a bit behind their target
  drag: 0.55,
  shimmerAmp: 2,
  shimmerFreq: 1.6,
  repelRadius: 8,
  repelStrength: 0,
  // ─── flow knobs ────────────────────────────────────────────────────────
  flowSpeed: 1.0,      // overall multiplier on flow magnitude
  flowScale: 0.013,    // spatial frequency (lower = larger eddies)
  flowLookahead: 28,   // pixel distance the spring target leads the particle
  // ─── interaction ───────────────────────────────────────────────────────
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
    <span class="doc-eyebrow">EXPERIMENT · 03</span>
    <h1>flowfield</h1>
    <p>Particles drift through a bounded curl-like vector field. The spring force chases a moving target one lookahead-step ahead in the flow direction; drag + shimmer + repel shape the cloud's texture. Click to scatter.</p>
  `;
  root.appendChild(head);

  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.innerHTML = `
    <div class="experiment-canvas-wrap surface-card">
      <canvas class="experiment-canvas" aria-hidden="true"></canvas>
    </div>
    <aside class="experiment-aside surface-card">
      <header class="experiment-aside-head">
        <span class="experiment-aside-eyebrow">CONTROLS</span>
        <button type="button" class="playground-reset" data-reset>RESET</button>
      </header>
      <div class="playground-knobs" data-knobs></div>
      <footer class="experiment-aside-foot">
        <code class="playground-code">click → scatter · particles wrap at canvas edges</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);

  const canvas = stage.querySelector<HTMLCanvasElement>('.experiment-canvas')!;
  const wrap = stage.querySelector<HTMLDivElement>('.experiment-canvas-wrap')!;
  const knobsHost = stage.querySelector<HTMLDivElement>('[data-knobs]')!;
  const resetBtn = stage.querySelector<HTMLButtonElement>('[data-reset]')!;

  const INITIAL_W = 720;
  const INITIAL_H = 480;
  let W = INITIAL_W;
  let H = INITIAL_H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  const sg = new Stage({
    canvas,
    width: W,
    height: H,
    feel: theme.feel,
    feelOverrides: {
      springK: DEFAULTS.springK,
      springC: DEFAULTS.springC,
      drag: DEFAULTS.drag,
      shimmerAmp: DEFAULTS.shimmerAmp,
      shimmerFreq: DEFAULTS.shimmerFreq,
      repelRadius: DEFAULTS.repelRadius,
      repelStrength: DEFAULTS.repelStrength,
    },
    palette: theme.palette,
    particleCount: DEFAULTS.particleCount,
    spawnFrom: 'edge',
    spawnSpeed: 220,
    portal: false,
    particleSize: 0.9,
    trailAlpha: 0.18,
  });

  const state = {
    flowSpeed: DEFAULTS.flowSpeed,
    scatterKick: DEFAULTS.scatterKick,
    scatterSoftness: DEFAULTS.scatterSoftness,
    particleCount: DEFAULTS.particleCount,
  };

  const colorSampler = makeColor(theme.palette);

  // (Re)spawn N particles. Initial mount + particle-count change both call
  // this. spawnFrom='edge' gives a brief "particles fly in from the edges"
  // intro before the flow takes over; with N=8000 the visual settles in
  // about a second.
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
    for (const p of sg.world.particles) p.color = colorSampler();
  };

  respawn(DEFAULTS.particleCount);

  // Drive the flowfield at the same rAF cadence as Stage's tick so the
  // spring's `tx`/`ty` chase is current when forces resolve.
  let raf = 0;
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    stepFlowfield(sg.world.particles, {
      time: now / 1000,
      scale: DEFAULTS.flowScale,
      lookahead: DEFAULTS.flowLookahead,
      speed: state.flowSpeed,
      bounds: { w: W, h: H },
    });
  };
  raf = requestAnimationFrame(tick);

  // Click → scatter. radialImpulse from cursor with live-tunable kick + falloff.
  const onClick = (e: MouseEvent): void => {
    const r = canvas.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    radialImpulse(sg.world.particles, {
      origin: { x: cx, y: cy },
      kick: state.scatterKick,
      softness: state.scatterSoftness,
    });
  };
  canvas.addEventListener('click', onClick);

  // Fullscreen. The flowfield's `bounds` reads `W`/`H` via closure each
  // frame, so resize naturally re-bounds the field — the cloud spreads to
  // fill the new viewport without a respawn.
  const fs = attachFullscreenButton({
    wrap,
    restoreWidth: INITIAL_W,
    restoreHeight: INITIAL_H,
    onResize: (w, h) => {
      W = w;
      H = h;
      sg.resize(w, h);
    },
  });

  const knobs: Knob[] = [
    {
      label: 'particles',
      min: 1000,
      max: 20000,
      step: 500,
      initial: DEFAULTS.particleCount,
      format: (v) => String(Math.round(v)),
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
      label: 'spring k',
      min: 4,
      max: 120,
      step: 1,
      initial: DEFAULTS.springK,
      format: (v) => v.toFixed(0),
      apply: (v) => sg.setFeelOverrides({ springK: v }),
    },
    {
      label: 'damping (c)',
      min: 0.5,
      max: 20,
      step: 0.1,
      initial: DEFAULTS.springC,
      format: (v) => v.toFixed(1),
      apply: (v) => sg.setFeelOverrides({ springC: v }),
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
      label: 'shimmer amp',
      min: 0,
      max: 24,
      step: 0.5,
      initial: DEFAULTS.shimmerAmp,
      format: (v) => v.toFixed(1),
      apply: (v) => sg.setFeelOverrides({ shimmerAmp: v }),
    },
    {
      label: 'shimmer freq',
      min: 0,
      max: 6,
      step: 0.1,
      initial: DEFAULTS.shimmerFreq,
      format: (v) => v.toFixed(1),
      apply: (v) => sg.setFeelOverrides({ shimmerFreq: v }),
    },
    {
      label: 'repel radius',
      min: 0,
      max: 40,
      step: 1,
      initial: DEFAULTS.repelRadius,
      format: (v) => v.toFixed(0),
      apply: (v) => sg.setFeelOverrides({ repelRadius: v }),
    },
    {
      label: 'repel strength',
      min: 0,
      max: 2000,
      step: 25,
      initial: DEFAULTS.repelStrength,
      format: (v) => v.toFixed(0),
      apply: (v) => sg.setFeelOverrides({ repelStrength: v }),
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
    {
      label: 'scatter falloff',
      min: 0.005,
      max: 0.5,
      step: 0.005,
      initial: DEFAULTS.scatterSoftness,
      format: (v) => v.toFixed(3),
      apply: (v) => { state.scatterSoftness = v; },
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
    canvas.removeEventListener('click', onClick);
    fs.dispose();
    sg.dispose();
  };
};
