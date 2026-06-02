/// <reference types="vite/client" />
// six-logo · chalk — the glTF particle cloud as white particles on black.
//
// This is the light-on-dark twin of `sixLogoInk.ts` (which is black-on-white).
// The projection, cycling, and scatter logic are identical; the difference is
// entirely in the COMPOSITING:
//
//   • We run source-over alpha (`bloom: false`), not additive. White pigment
//     composites *over* black as opaque white dots — crisp chalk marks, no
//     glow halo. (Additive would also brighten here, but it blooms toward a
//     soft glow; chalk wants hard edges, so source-over is the right pick.)
//   • We run in `portal: true` (transparent canvas) and paint the canvas wrap
//     black via CSS. Portal mode reveals that black on frame 0 — no flash
//     while the cloud converges.
//   • The palette is near-white (lit ≈ 0.96). On black, the depth-cued alpha
//     reads as near = bright white / far = dim gray fading into the black
//     surface — a clean monochrome depth cue. Because the far floor blends
//     *toward* the background, we use a low ALPHA_FLOOR (recession reads as
//     darkening, the opposite of the ink version on white).
//
// See docs/rendering-blend-modes.md for the full why.
//
// Click anywhere → radialImpulse scatters the cloud; the per-frame
// projection keeps re-targeting, so the spring pulls it back into shape.

import sixLogoGlb from '../assets/6ixLogo.glb?url';

import { renderNav, renderFooter } from '../layout';
import { Stage, makeColor } from '../embed';
import { THEMES, DEFAULT_THEME, type Palette } from '../themes';
import {
  spawn,
  radialImpulse,
  TRANSPARENT,
  packRGBA,
  mulberry32,
  textField,
  type Rng,
} from '@tesyl/screean';
import { loadGlb, sampleSurface, centerAndScale, type LoadedMesh } from '../lib/loaders/gltf';
import { attachFullscreenButton } from '../lib/ui/fullscreen';
import { stepFlowfield } from '../lib/physics/flowfield';

// Near-white chalk. With sat 0 the hue is irrelevant; lit 0.96 keeps the
// brightest sprite cores just shy of clipping so dense overlaps still read
// as marks rather than a flat white blob. Shaped like the theme palette so
// it flows straight through `makeColor`.
const CHALK_PALETTE: Palette = {
  hueCenter: 0,
  hueRange: 0,
  sat: 0,
  lit: 0.96,
};

// Pure black surface revealed behind the portal-mode (transparent) canvas.
const SURFACE_BLACK = '#000000';

// Low depth-alpha floor: on black, a far particle at low alpha blends *toward*
// the background, so recession reads as a natural fade into black. This is the
// inverse of the ink version, which had to LIFT the floor to keep far
// particles from washing out on white.
const ALPHA_FLOOR = 46; // far particles; near particles still reach 255

// Visual tuning constants. Mirror the controls' default values so a "reset"
// restores the same baseline. Plain object (no `as const`) so values broaden
// to `number` for setter calls.
const DEFAULTS: Record<string, number> = {
  particleCount: 8000,
  // ─── force knobs ───────────────────────────────────────────────────────
  springK: 32,
  springC: 6.5,
  drag: 0.55,
  shimmerAmp: 4,
  shimmerFreq: 1.6,
  repelRadius: 6,
  repelStrength: 0,
  // ─── interaction knobs ─────────────────────────────────────────────────
  scatterKick: 360,
  scatterSoftness: 0.06,
  // ─── projection knobs ──────────────────────────────────────────────────
  cloudScale: 1.0,
  perspective: 580,
  // ─── motion / cycle ────────────────────────────────────────────────────
  rotYspeed: 0.0,
  rotXspeed: 0.0,
  rotZspeed: 0.0,
  cycleSec: 8,
  // ─── flowfield ─────────────────────────────────────────────────────────
  flowSpeed: 1.0,
  flowScale: 0.013,
  flowLookahead: 28,
  // ─── fixed layout constants ────────────────────────────────────────────
  modelRadius: 220,
  modelDepth: 600,
};

const WORDMARK = 'the6ixCollective';
const WORDMARK_FONT = 'bold 110px system-ui, -apple-system, "Segoe UI", sans-serif';

// Sample N points from the 3D-flat projection of a text string. Reuses
// screean's `textField` rasterizer for (x, y) sampling, then promotes points
// to 3D in the XZ plane so they survive the mesh's standing-up X-rotation.
type SampledCloud = {
  points: Float32Array;
  bbox: LoadedMesh['bbox'];
};
const sampleTextCloud = (text: string, font: string, n: number, rng: Rng): SampledCloud => {
  const f = textField({ text, x: 0, y: 0, font });
  const samples = f.sample(n);
  const points = new Float32Array(n * 3);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const [sx, sy] = samples[i] ?? [0, 0];
    const sz = -sy; // raster Y goes down; flip so text top → +Z
    points[i * 3 + 0] = sx;
    points[i * 3 + 1] = 0;
    points[i * 3 + 2] = sz;
    if (sx < minX) minX = sx;
    if (sz < minZ) minZ = sz;
    if (sx > maxX) maxX = sx;
    if (sz > maxZ) maxZ = sz;
  }
  void rng; // textField samples via Math.random internally — not seed-stable
  return {
    points,
    bbox: { min: [minX, 0, minZ], max: [maxX, 0, maxZ] },
  };
};

// One slider definition. Tied to a feel-override key, a Stage method, or a
// custom apply function. Kept as data so we render the panel in a loop.
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
    <span class="doc-eyebrow">EXPERIMENT · 10</span>
    <h1>six-logo · chalk — white particles on black</h1>
    <p>The gltf particle cloud as light-on-dark: crisp white particles over a black surface. Runs source-over (white pigment composites as opaque chalk marks, no glow halo) with a near-white palette and a low depth-alpha floor so far particles fade into the black. Same projection, cycle, and scatter as six-logo — only the compositing changes. Click to scatter.</p>
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
        <code class="playground-code">click canvas → scatter · particles spring back</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);

  const canvas = stage.querySelector<HTMLCanvasElement>('.experiment-canvas')!;
  const wrap = stage.querySelector<HTMLDivElement>('.experiment-canvas-wrap')!;
  const knobsHost = stage.querySelector<HTMLDivElement>('[data-knobs]')!;
  const resetBtn = stage.querySelector<HTMLButtonElement>('[data-reset]')!;

  // Paint the canvas wrap black. Portal mode leaves the canvas transparent,
  // so this CSS surface is what shows through — present from frame 0, so no
  // flash before the cloud assembles.
  wrap.style.background = SURFACE_BLACK;

  // W/H mutate on fullscreen toggle. The projection loop reads them via
  // closure each frame, so resize is automatic.
  const INITIAL_W = 720;
  const INITIAL_H = 480;
  let W = INITIAL_W;
  let H = INITIAL_H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  // Build the Stage in LIGHT-ON-DARK mode:
  //   • bloom: false   → source-over alpha; white particles read as crisp
  //                       chalk marks, not soft additive glow.
  //   • portal: true   → transparent canvas; the black wrap shows through.
  //   • trailAlpha 0.9 → near-instant clear each frame: crisp dots, no wake.
  //                       (Portal erase fades the canvas back to transparent,
  //                       revealing the black surface.)
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
      repelRadius: 6,
      repelStrength: 0,
    },
    palette: CHALK_PALETTE,
    particleCount: DEFAULTS.particleCount,
    spawnFrom: 'edge',
    spawnSpeed: 220,
    portal: true,
    bloom: false,
    particleSize: 1.1,
    trailAlpha: 0.9,
  });

  // Mutable state owned by the experiment. The projection loop reads these;
  // controls write them. `meshCloud`/`textCloud` are both N×3 arrays sampled
  // at the current count; `points` aliases whichever drives the particles.
  type State = {
    rotY: number;
    rotX: number;
    rotZ: number;
    rotYspeed: number;
    rotXspeed: number;
    rotZspeed: number;
    meshCloud: Float32Array;
    textCloud: Float32Array;
    points: Float32Array;
    activeSource: 'mesh' | 'text' | 'flowfield';
    pointCount: number;
    particleCount: number;
    cycleSec: number;
    cycleAccum: number;
    cloudScale: number;
    perspective: number;
    scatterKick: number;
    scatterSoftness: number;
    flowSpeed: number;
  };
  const state: State = {
    rotY: 0,
    rotX: -Math.PI / 2,
    rotZ: 0,
    rotYspeed: DEFAULTS.rotYspeed,
    rotXspeed: DEFAULTS.rotXspeed,
    rotZspeed: DEFAULTS.rotZspeed,
    meshCloud: new Float32Array(0),
    textCloud: new Float32Array(0),
    points: new Float32Array(0),
    activeSource: 'mesh',
    pointCount: 0,
    particleCount: DEFAULTS.particleCount,
    cycleSec: DEFAULTS.cycleSec,
    cycleAccum: 0,
    cloudScale: DEFAULTS.cloudScale,
    perspective: DEFAULTS.perspective,
    scatterKick: DEFAULTS.scatterKick,
    scatterSoftness: DEFAULTS.scatterSoftness,
    flowSpeed: DEFAULTS.flowSpeed,
  };

  const colorSampler = makeColor(CHALK_PALETTE);

  // Replace the world's particles with N fresh ones spawned from the edges.
  // Re-samples BOTH cloud sources at the new count so switching is a pointer
  // swap against an identically-sized particle array.
  const rebuildCloud = (mesh: LoadedMesh, n: number): void => {
    state.particleCount = n;

    const meshRng = mulberry32(0xc0ffee + n);
    const meshPts = sampleSurface(mesh, n, meshRng);
    centerAndScale(meshPts, mesh.bbox, DEFAULTS.modelRadius);
    // Bake a 180° Z flip so the logo reads right-way-up at rest. RotateZ(π)
    // maps (x, y, z) → (-x, -y, z). Kept off the live rot* axes (shared with
    // the text source) so each cloud keeps its own baseline orientation.
    for (let i = 0; i < meshPts.length; i += 3) {
      meshPts[i + 0] = -meshPts[i + 0];
      meshPts[i + 1] = -meshPts[i + 1];
    }
    state.meshCloud = meshPts;

    const textCloud = sampleTextCloud(WORDMARK, WORDMARK_FONT, n, mulberry32(0xbeef));
    centerAndScale(textCloud.points, textCloud.bbox, DEFAULTS.modelRadius);
    state.textCloud = textCloud.points;

    state.points = state.activeSource === 'mesh' ? state.meshCloud : state.textCloud;
    state.pointCount = n;

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
    // Base chalk hues; the projection updater modulates alpha each frame.
    for (const p of sg.world.particles) p.color = colorSampler();
  };

  // Project every sample point and write its (sx, sy) into the matching
  // particle's tx/ty. Depth-cued alpha maps projected z to [ALPHA_FLOOR, 255]
  // so back-of-mesh particles read dimmer (fading into black) while the front
  // of the cloud stays bright white.
  const projectFrame = (): void => {
    const cy = Math.cos(state.rotY), sy = Math.sin(state.rotY);
    const cx = Math.cos(state.rotX), sx = Math.sin(state.rotX);
    const cosZ = Math.cos(state.rotZ), sinZ = Math.sin(state.rotZ);
    const f = state.perspective;
    const d = DEFAULTS.modelDepth;
    const scale = state.cloudScale;
    const cxScreen = W / 2;
    const cyScreen = H / 2;

    const pts = state.points;
    const particles = sg.world.particles;
    const n = Math.min(particles.length, state.pointCount);

    let zMin = Infinity;
    let zMax = -Infinity;

    if (depthScratch.length < n) depthScratch = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const px = pts[i * 3 + 0];
      const py = pts[i * 3 + 1];
      const pz = pts[i * 3 + 2];
      // Rotation order X → Y → Z (see sixLogo.ts for the why).
      const ax = px;
      const ay = cx * py - sx * pz;
      const az = sx * py + cx * pz;
      const rx = cy * ax + sy * az;
      const ry = ay;
      const rz = -sy * ax + cy * az;
      const rxR = cosZ * rx - sinZ * ry;
      const ryR = sinZ * rx + cosZ * ry;
      const camZ = rz + d;
      const w = Math.max(camZ, 1);
      const sxp = (rxR * scale * f) / w + cxScreen;
      const syp = -(ryR * scale * f) / w + cyScreen;
      const p = particles[i];
      p.tx = sxp;
      p.ty = syp;
      depthScratch[i] = camZ;
      if (camZ < zMin) zMin = camZ;
      if (camZ > zMax) zMax = camZ;
    }

    // Depth-cued alpha. Closest particles are full-white (alpha 255), farthest
    // fall to ALPHA_FLOOR. Linear in camera-space z.
    const zRange = zMax - zMin || 1;
    for (let i = 0; i < n; i++) {
      const p = particles[i];
      if (p.life <= 0) continue;
      const t = 1 - (depthScratch[i] - zMin) / zRange; // 1 = closest, 0 = farthest
      const alpha = Math.round(ALPHA_FLOOR + t * (255 - ALPHA_FLOOR));
      const c = p.color;
      const r = c & 0xff;
      const g = (c >> 8) & 0xff;
      const b = (c >> 16) & 0xff;
      p.color = packRGBA(r, g, b, alpha);
    }
  };

  let depthScratch = new Float32Array(0);

  // Flowfield step — bounded to the canvas; particles wrap at edges.
  const updateFlowfield = (now: number): void => {
    stepFlowfield(sg.world.particles, {
      time: now / 1000,
      scale: DEFAULTS.flowScale,
      lookahead: DEFAULTS.flowLookahead,
      speed: state.flowSpeed,
      bounds: { w: W, h: H },
    });
  };

  // Drive the projection loop at the same RAF cadence as Stage's tick.
  let raf = 0;
  let lastT = performance.now();
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    state.rotY += state.rotYspeed * dt;
    state.rotX += state.rotXspeed * dt;
    state.rotZ += state.rotZspeed * dt;

    // Cycle mesh → text → flowfield on cycleSec boundaries.
    if (state.meshCloud.length > 0 && state.textCloud.length > 0) {
      state.cycleAccum += dt;
      if (state.cycleAccum >= state.cycleSec) {
        state.cycleAccum = 0;
        const cycle = ['mesh', 'text', 'flowfield'] as const;
        const idx = cycle.indexOf(state.activeSource);
        state.activeSource = cycle[(idx + 1) % cycle.length];
        if (state.activeSource === 'mesh') state.points = state.meshCloud;
        else if (state.activeSource === 'text') state.points = state.textCloud;
      }
    }

    if (state.activeSource === 'flowfield') {
      updateFlowfield(now);
    } else if (state.points.length > 0) {
      projectFrame();
    }
  };

  // Click → scatter. radialImpulse pushes every particle outward; the spring
  // re-asserts automatically as the projection keeps re-targeting.
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

  // Fullscreen toggle. On enter/exit we resize the Stage; the projection loop
  // reads W/H via closure each frame, so the cloud re-fits without a respawn.
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

  // Wire the controls.
  let mesh: LoadedMesh | null = null;
  const knobs: Knob[] = [
    {
      label: 'particles',
      min: 1000,
      max: 20000,
      step: 500,
      initial: DEFAULTS.particleCount,
      format: (v) => String(Math.round(v)),
      apply: (v) => {
        if (!mesh) return;
        rebuildCloud(mesh, Math.round(v));
      },
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
      label: 'cloud size',
      min: 0.3,
      max: 2.5,
      step: 0.05,
      initial: DEFAULTS.cloudScale,
      format: (v) => `${v.toFixed(2)}×`,
      apply: (v) => { state.cloudScale = v; },
    },
    {
      label: 'fov',
      min: 200,
      max: 1400,
      step: 20,
      initial: DEFAULTS.perspective,
      format: (v) => v.toFixed(0),
      apply: (v) => { state.perspective = v; },
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
    {
      label: 'rotate y',
      min: -2,
      max: 2,
      step: 0.05,
      initial: DEFAULTS.rotYspeed,
      format: (v) => `${v.toFixed(2)} rad/s`,
      apply: (v) => { state.rotYspeed = v; },
    },
    {
      label: 'rotate x',
      min: -2,
      max: 2,
      step: 0.05,
      initial: DEFAULTS.rotXspeed,
      format: (v) => `${v.toFixed(2)} rad/s`,
      apply: (v) => { state.rotXspeed = v; },
    },
    {
      label: 'rotate z',
      min: -2,
      max: 2,
      step: 0.05,
      initial: DEFAULTS.rotZspeed,
      format: (v) => `${v.toFixed(2)} rad/s`,
      apply: (v) => { state.rotZspeed = v; },
    },
    {
      label: 'cycle',
      min: 1,
      max: 30,
      step: 0.5,
      initial: DEFAULTS.cycleSec,
      format: (v) => `${v.toFixed(1)}s`,
      apply: (v) => {
        state.cycleSec = v;
      },
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
    knobs.forEach((k, idx) => {
      inputs[idx].value = String(k.initial);
      valueEls[idx].textContent = k.format ? k.format(k.initial) : String(k.initial);
      k.apply(k.initial);
    });
  });

  // Boot: load the model, build the cloud, start the projection loop.
  let cancelled = false;
  loadGlb(sixLogoGlb)
    .then((m) => {
      if (cancelled) return;
      mesh = m;
      rebuildCloud(m, DEFAULTS.particleCount);
      raf = requestAnimationFrame(tick);
    })
    .catch((err) => {
      console.error('six-logo-chalk: glb load failed', err);
      const msg = document.createElement('p');
      msg.textContent = `Failed to load 6ixLogo.glb — ${String(err)}`;
      msg.style.cssText = 'color: #c00; padding: 12px; font-family: monospace; font-size: 12px;';
      stage.appendChild(msg);
    });

  root.appendChild(renderFooter());

  return () => {
    cancelled = true;
    if (raf) cancelAnimationFrame(raf);
    canvas.removeEventListener('click', onClick);
    fs.dispose();
    sg.dispose();
  };
};
