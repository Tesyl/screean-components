/// <reference types="vite/client" />
// qr-particles — a scannable QR code assembled from particles.
//
// The QR matrix is generated with `qrcode-generator` (pure JS, no canvas
// needed for the data — we only read `isDark(r, c)`). Every DARK module maps
// to a screen-space cell; particles are distributed round-robin across those
// cells and their spring targets (tx/ty) are set to a jittered point inside
// the cell. The Stage's spring force assembles the code; click anywhere →
// radialImpulse scatters it and the spring re-forms it (a satisfying reveal).
//
// SCANNABILITY is the whole point, so the defaults protect it:
//   • Dark-on-light. Standard QR is dark modules on a light field; we run
//     source-over (`bloom: false`) with a near-black ink palette over a white
//     surface, the legible-on-white combo (additive bloom can't draw black).
//   • A real quiet zone (margin of empty modules) around the code — scanners
//     need it to lock on.
//   • Shimmer defaults to 0. Per-particle jitter blurs module edges and breaks
//     decoding; it's exposed as a knob for looks, with the trade-off noted.
//   • Enough particles per dark module (count / darkModules) to fill each cell
//     solidly, with a small inset so adjacent modules stay visually distinct
//     while their centers — where scanners sample — read fully dark.
//
// Edit the payload field to re-encode live; the cloud morphs to the new code.

import qrcode from 'qrcode-generator';

import { renderNav, renderFooter } from '../layout';
import { Stage, makeColor } from '../embed';
import { THEMES, DEFAULT_THEME, type Palette } from '../themes';
import { spawn, radialImpulse, TRANSPARENT, type Rng, mulberry32 } from '@tesyl/screean';
import { attachFullscreenButton } from '../lib/ui/fullscreen';

// Near-black ink. sat 0 → hue irrelevant; lit 0.05 keeps the softest sprite
// edges from vanishing into pure #000 while still reading as solid black
// modules a scanner trusts. Shaped like a theme palette so it flows straight
// through `makeColor`.
const INK_PALETTE: Palette = {
  hueCenter: 0,
  hueRange: 0,
  sat: 0,
  lit: 0.05,
};

// Pure white surface revealed behind the portal-mode (transparent) canvas —
// present from frame 0 so there's no dark flash before the code assembles.
const SURFACE_WHITE = '#ffffff';

// Error-correction level. 'M' (~15% recovery) is the usual default and keeps
// the code compact; higher levels survive more particle noise but grow the
// module count. Kept fixed — exposed as a control would be nice but ECC is a
// discrete choice, not a slider.
const ECC_LEVEL = 'M' as const;

const DEFAULTS: Record<string, number> = {
  particleCount: 16000,
  particleSize: 2.2,  // big enough that ~count/darkModules dots fill a cell solid
  // ─── force knobs ───────────────────────────────────────────────────────
  springK: 42,        // stiff: modules should snap to crisp positions
  springC: 7.0,
  drag: 0.62,
  shimmerAmp: 0,      // 0 = scannable. Raise for life, lose decode reliability.
  shimmerFreq: 1.4,
  // ─── interaction knobs ─────────────────────────────────────────────────
  scatterKick: 420,
  scatterSoftness: 0.06,
  // ─── layout knobs ──────────────────────────────────────────────────────
  quietZone: 4,       // empty-module margin around the code (QR spec min = 4)
  moduleFill: 0.86,   // fraction of each module a particle may land in (inset)
};

const DEFAULT_PAYLOAD = 'https://the6ixcollective.com';

type Knob = {
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  format?: (v: number) => string;
  apply: (v: number) => void;
};

// A dark module's top-left in module coordinates. Screen mapping is derived
// per-frame from the live layout so resize/quiet-zone changes are free.
type Cell = { r: number; c: number };

// Generate the QR matrix and return its module count + the list of dark cells.
// Returns null for an empty payload (caller keeps the previous code).
type QrData = { count: number; dark: Cell[] };
const buildQr = (payload: string): QrData | null => {
  if (!payload.trim()) return null;
  // typeNumber 0 = auto-pick the smallest version that fits the data.
  const qr = qrcode(0, ECC_LEVEL);
  qr.addData(payload);
  qr.make();
  const count = qr.getModuleCount();
  const dark: Cell[] = [];
  for (let r = 0; r < count; r++) {
    for (let c = 0; c < count; c++) {
      if (qr.isDark(r, c)) dark.push({ r, c });
    }
  }
  return { count, dark };
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
    <span class="doc-eyebrow">EXPERIMENT · 11</span>
    <h1>qr-particles — a scannable code from particles</h1>
    <p>A QR code rendered as a particle field. Each dark module is filled by particles whose spring targets sit inside it; the code assembles itself and re-forms after you scatter it. Dark-on-light with a real quiet zone and shimmer off by default so a phone can actually decode it. Edit the payload to re-encode live. Click to scatter.</p>
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
      <div class="pg-knob">
        <div class="pg-knob-head">
          <span class="pg-knob-label">payload</span>
          <span class="pg-knob-value" data-payload-status></span>
        </div>
        <input class="pg-knob-text" type="text" data-payload
               style="width:100%;box-sizing:border-box;font:inherit;padding:6px 8px;" />
      </div>
      <div class="playground-knobs" data-knobs></div>
      <footer class="experiment-aside-foot">
        <code class="playground-code">click canvas → scatter · scan it with your phone</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);

  const canvas = stage.querySelector<HTMLCanvasElement>('.experiment-canvas')!;
  const wrap = stage.querySelector<HTMLDivElement>('.experiment-canvas-wrap')!;
  const knobsHost = stage.querySelector<HTMLDivElement>('[data-knobs]')!;
  const resetBtn = stage.querySelector<HTMLButtonElement>('[data-reset]')!;
  const payloadInput = stage.querySelector<HTMLInputElement>('[data-payload]')!;
  const payloadStatus = stage.querySelector<HTMLSpanElement>('[data-payload-status]')!;
  payloadInput.value = DEFAULT_PAYLOAD;

  // White surface behind the (portal/transparent) canvas. The .experiment-canvas
  // CSS sets `background: var(--bg)` (the page's cream) ON THE CANVAS ELEMENT,
  // which shows through the transparent pixels — so the override must live on the
  // canvas, not just the wrap. White maximizes QR contrast for scanners.
  canvas.style.background = SURFACE_WHITE;
  wrap.style.background = SURFACE_WHITE;

  const INITIAL_W = 720;
  const INITIAL_H = 480;
  let W = INITIAL_W;
  let H = INITIAL_H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  // Dark-on-light Stage: source-over alpha so ink darkens the white surface,
  // portal mode so the white wrap shows, crisp trail clear.
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
      repelRadius: 4,
      repelStrength: 0,
    },
    palette: INK_PALETTE,
    particleCount: DEFAULTS.particleCount,
    spawnFrom: 'edge',
    spawnSpeed: 240,
    portal: true,
    bloom: false,
    particleSize: DEFAULTS.particleSize,
    trailAlpha: 0.9,
  });

  const colorSampler = makeColor(INK_PALETTE);

  const state = {
    particleCount: DEFAULTS.particleCount,
    quietZone: DEFAULTS.quietZone,
    moduleFill: DEFAULTS.moduleFill,
    scatterKick: DEFAULTS.scatterKick,
    scatterSoftness: DEFAULTS.scatterSoftness,
    qr: null as QrData | null,
  };

  // Assign every particle a spring target inside a dark module. Particles are
  // spread round-robin across dark cells so the fill is even regardless of how
  // many particles vs. modules there are. The QR area is the largest centered
  // square that fits the canvas (minus a small page margin), inset by the quiet
  // zone. Jitter within each module's `moduleFill` fraction gives the field its
  // texture while keeping module centers solidly dark for the scanner.
  const PAGE_MARGIN = 0.92; // QR square uses 92% of the smaller canvas axis
  const assignTargets = (rng: Rng): void => {
    const qr = state.qr;
    if (!qr || qr.dark.length === 0) return;
    const span = qr.count + state.quietZone * 2; // modules incl. quiet zone
    const qrPx = Math.min(W, H) * PAGE_MARGIN;
    const moduleSize = qrPx / span;
    const originX = (W - qrPx) / 2 + state.quietZone * moduleSize;
    const originY = (H - qrPx) / 2 + state.quietZone * moduleSize;
    const inset = (moduleSize * (1 - state.moduleFill)) / 2;
    const usable = moduleSize - inset * 2;

    const particles = sg.world.particles;
    const dark = qr.dark;
    for (let i = 0; i < particles.length; i++) {
      const cell = dark[i % dark.length];
      const p = particles[i];
      p.tx = originX + cell.c * moduleSize + inset + rng() * usable;
      p.ty = originY + cell.r * moduleSize + inset + rng() * usable;
    }
  };

  // (Re)build the cloud for a payload + particle count. Respawns from the edges
  // only when the count changes (a fresh fly-in); otherwise keeps particles and
  // just re-targets so an edited payload MORPHS into the new code.
  const rebuild = (payload: string, count: number, opts: { respawn: boolean }): void => {
    const next = buildQr(payload);
    if (!next) {
      payloadStatus.textContent = 'empty';
      return;
    }
    state.qr = next;
    state.particleCount = count;
    payloadStatus.textContent = `${next.count}×${next.count} · ${next.dark.length} dark`;

    if (opts.respawn) {
      sg.world.particles.length = 0;
      sg.world.addParticles(
        spawn({
          n: count,
          origin: { kind: 'edge', width: W, height: H },
          color: TRANSPARENT,
          speed: 260,
          toward: { x: W / 2, y: H / 2 },
        }),
      );
      for (const p of sg.world.particles) p.color = colorSampler();
    }
    assignTargets(mulberry32(0x9a5eed));
  };

  // Click → scatter. radialImpulse pushes particles outward from the cursor;
  // the spring re-asserts the code on its own.
  const onClick = (e: MouseEvent): void => {
    const r = canvas.getBoundingClientRect();
    radialImpulse(sg.world.particles, {
      origin: { x: e.clientX - r.left, y: e.clientY - r.top },
      kick: state.scatterKick,
      softness: state.scatterSoftness,
    });
  };
  canvas.addEventListener('click', onClick);

  // Fullscreen — resize the Stage; targets re-derive from the live W/H on the
  // next assignTargets (we re-assign on resize so the code re-fits).
  const fs = attachFullscreenButton({
    wrap,
    restoreWidth: INITIAL_W,
    restoreHeight: INITIAL_H,
    onResize: (w, h) => {
      W = w;
      H = h;
      sg.resize(w, h);
      assignTargets(mulberry32(0x1ee7));
    },
  });

  // Re-encode live as the payload changes (QR gen is sub-millisecond). Keeps
  // particles — the cloud morphs from the old code to the new one.
  payloadInput.addEventListener('input', () => {
    rebuild(payloadInput.value, state.particleCount, { respawn: false });
  });

  const knobs: Knob[] = [
    {
      label: 'particles',
      min: 3000,
      max: 30000,
      step: 500,
      initial: DEFAULTS.particleCount,
      format: (v) => String(Math.round(v)),
      apply: (v) => rebuild(payloadInput.value, Math.round(v), { respawn: true }),
    },
    {
      label: 'particle size',
      min: 0.6,
      max: 6,
      step: 0.1,
      initial: DEFAULTS.particleSize,
      format: (v) => `${v.toFixed(1)} px`,
      apply: (v) => sg.renderer.setParticleSize(v),
    },
    {
      label: 'spring k',
      min: 8,
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
      max: 16,
      step: 0.5,
      initial: DEFAULTS.shimmerAmp,
      format: (v) => (v === 0 ? 'off (scannable)' : v.toFixed(1)),
      apply: (v) => sg.setFeelOverrides({ shimmerAmp: v }),
    },
    {
      label: 'quiet zone',
      min: 0,
      max: 8,
      step: 1,
      initial: DEFAULTS.quietZone,
      format: (v) => `${v.toFixed(0)} mod`,
      apply: (v) => {
        state.quietZone = v;
        assignTargets(mulberry32(0xca11ab1e));
      },
    },
    {
      label: 'module fill',
      min: 0.4,
      max: 1.0,
      step: 0.02,
      initial: DEFAULTS.moduleFill,
      format: (v) => `${(v * 100).toFixed(0)}%`,
      apply: (v) => {
        state.moduleFill = v;
        assignTargets(mulberry32(0xf111));
      },
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
    const knobWrap = document.createElement('div');
    knobWrap.className = 'pg-knob';
    knobWrap.innerHTML = `
      <div class="pg-knob-head">
        <span class="pg-knob-label">${k.label}</span>
        <span class="pg-knob-value" data-knob-value="${idx}">${k.format ? k.format(k.initial) : k.initial}</span>
      </div>
      <input class="pg-knob-slider" type="range"
             min="${k.min}" max="${k.max}" step="${k.step}" value="${k.initial}"
             data-knob-input="${idx}" />
    `;
    knobsHost.appendChild(knobWrap);
    const input = knobWrap.querySelector<HTMLInputElement>('input')!;
    const valueEl = knobWrap.querySelector<HTMLSpanElement>('.pg-knob-value')!;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valueEl.textContent = k.format ? k.format(v) : String(v);
      k.apply(v);
    });
    inputs.push(input);
    valueEls.push(valueEl);
  });

  resetBtn.addEventListener('click', () => {
    payloadInput.value = DEFAULT_PAYLOAD;
    knobs.forEach((k, idx) => {
      inputs[idx].value = String(k.initial);
      valueEls[idx].textContent = k.format ? k.format(k.initial) : String(k.initial);
    });
    // Reset live state before rebuilding so layout knobs apply cleanly.
    state.quietZone = DEFAULTS.quietZone;
    state.moduleFill = DEFAULTS.moduleFill;
    state.scatterKick = DEFAULTS.scatterKick;
    state.scatterSoftness = DEFAULTS.scatterSoftness;
    sg.setFeelOverrides({
      springK: DEFAULTS.springK,
      springC: DEFAULTS.springC,
      drag: DEFAULTS.drag,
      shimmerAmp: DEFAULTS.shimmerAmp,
      shimmerFreq: DEFAULTS.shimmerFreq,
    });
    sg.renderer.setParticleSize(DEFAULTS.particleSize);
    rebuild(DEFAULT_PAYLOAD, DEFAULTS.particleCount, { respawn: true });
  });

  // Boot.
  rebuild(DEFAULT_PAYLOAD, DEFAULTS.particleCount, { respawn: true });

  root.appendChild(renderFooter());

  return () => {
    canvas.removeEventListener('click', onClick);
    fs.dispose();
    sg.dispose();
  };
};
