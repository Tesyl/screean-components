/// <reference types="vite/client" />
// six-showcase — fullscreen presentation of the GPU engine.
//
// A self-driving cycle of three (sometimes four) anchor clouds:
//   logo → text → sphere → text → repeat (heart sneaks in occasionally).
//
// Logo + sphere share a slow 2-axis rotation matrix; text snaps to
// identity so it always faces the camera. Each transition picks from
// a rotating set of spring/drag presets so the "feel" of how particles
// arrive varies — sometimes they glide, sometimes they overshoot,
// sometimes they elastic-snap. When the cloud is text, the anchor
// buffer is re-uploaded several times across ~1s using different fonts
// to produce a font-flicker effect before settling on the canonical
// font. Every 10s a multi-band Perlin glitch burst kicks the field —
// 2–3 sub-bursts with varying amplitude/frequency/octaves chained
// together feel like a smooth turbulent shake.
//
// Click to kick — same radial impulse as gpu-engine. ~8% of clicks
// surface a small perlin burst alongside the kick (an "extra splash").
//
// Backend: WebGPU + GPU world only. CPU at ~500k would crawl; the
// experiment shows a graceful fallback message on devices without an
// adapter.

import sixLogoGlb from '../assets/6ixLogo.glb?url';

import {
  createWorld,
  createRendererAsync,
  WorldGPU,
  detectBudgetFromNavigator,
  detectWebGPU,
  renderWorld,
  packRGBA,
  hslToRgb,
  mulberry32,
  easing,
  type Renderer,
  type IWorld,
  type Color,
  type GpuParticleInput,
  type Rng,
} from 'screean';
import {
  loadGlb,
  sampleSurface,
  centerAndScale,
  type LoadedMesh,
} from '../lib/loaders/gltf';
import { samplePeace, sampleHeart, sampleText } from '../lib/loaders/clouds';

const SHOWCASE = {
  // 3x bigger than launch defaults. modelRadius is the source of truth
  // for every cloud at sample-time; cloudScale below multiplies again
  // at projection-time.
  modelRadius: 780,
  modelDepth: 600,
  perspective: 700,
  // Smaller particles — the field is denser at 3x scale so each dot
  // can be smaller without losing presence.
  particleSize: 1.0,
  trailAlpha: 0.16,
  particleCount: 500_000,
  scatterKick: 1900,
  scatterSoftness: 0.06,
  dwellLogoMs: 5800,
  dwellPeaceMs: 5800,
  dwellHeartMs: 5400,
  transitionMs: 1000,
  // One-axis spin — rotXspeed stays at 0 so everything rotates around
  // the vertical (Y) axis only, like a turntable. The X-rotation knob
  // in the M panel is still wired up if you want to dial it back in.
  rotXspeed: 0,
  rotYspeed: 0.42,
  glitchIntervalMs: 10_000,
  clickPerlinChance: 0.08,
  // Post-rotation, pre-perspective scale baked into setTransform3D.
  // Stacks on modelRadius — total visual scale = modelRadius / 260 *
  // cloudScale relative to launch.
  cloudScale: 2.0,
} as const;


// Spring/drag presets cycled per-transition. Each entry biases the
// "arrival feel" of particles into the new cloud. NOTE: these are
// per-transition feels — the dwell uses REST_FEEL below. Bumped to
// match the new resting K=60.
type FeelPreset = { name: string; springK: number; springC: number; drag: number };
const FEELS: ReadonlyArray<FeelPreset> = [
  { name: 'snappy',  springK: 90, springC: 7.0, drag: 0.50 },
  { name: 'glide',   springK: 28, springC: 5.0, drag: 0.24 },
  { name: 'elastic', springK: 130, springC: 4.0, drag: 0.40 },
  { name: 'soft',    springK: 22, springC: 3.2, drag: 0.36 },
];
// "Resting" feel applied while a cloud holds. K=60 per request,
// dampening dialed back a smidge from 0.40 → 0.32. Mutable — the
// M-toggle controls panel writes through this so live tweaks affect
// the next dwell-back-to-rest lerp.
const REST_FEEL_DEFAULTS = { springK: 60, springC: 5.5, drag: 0.32 } as const;
const restFeel: FeelPreset = {
  name: 'rest',
  springK: REST_FEEL_DEFAULTS.springK,
  springC: REST_FEEL_DEFAULTS.springC,
  drag: REST_FEEL_DEFAULTS.drag,
};

// Acid theme palette: tight chartreuse jitter (hue 70°, range 12°,
// sat 95%, lit 58%) — matches site/themes.ts → acid.palette so the
// showcase reads as the same brand surface as the rest of the site.
const HUE_CENTER = 70;
const HUE_RANGE = 12;
const HUE_SAT = 0.95;
const HUE_LIT = 0.58;
const sampleColor = (rng: Rng): Color => {
  const h = (((HUE_CENTER + (rng() - 0.5) * HUE_RANGE) + 360) % 360) / 360;
  const [r, g, b] = hslToRgb(h, HUE_SAT, HUE_LIT);
  return packRGBA((r * 255) | 0, (g * 255) | 0, (b * 255) | 0, 255);
};

// Cycle: peace → heart → logo. All three rotate on the shared 2-axis
// matrix. Brand text lives in the bottom-right DOM corner (not as a
// particle cloud).
type Mode = 'peace' | 'heart' | 'logo';

const composeRotXY = (rotX: number, rotY: number): Float32Array => {
  // Same convention as gpu-engine's composeRotXYZ but with rotZ = 0.
  // Column-major, matches WGSL mat4x4f.
  const cx = Math.cos(rotX), sx = Math.sin(rotX);
  const cy = Math.cos(rotY), sy = Math.sin(rotY);
  return new Float32Array([
    cy,         sx * sy,    -cx * sy,   0,
    0,          cx,         sx,         0,
    sy,         -sx * cy,   cx * cy,    0,
    0,          0,          0,          1,
  ]);
};
export const mount = (root: HTMLElement): (() => void) => {
  root.innerHTML = '';

  // Live-tunable state. Seeded from SHOWCASE constants; the M-toggle
  // controls panel mutates these in place, and the tick + scheduler
  // read them every frame. Explicit `number` annotations widen the
  // literal types SHOWCASE infers (it's `as const`). Declared up-front
  // because the controls panel below binds knobs to it.
  const state: {
    rotXspeed: number;
    rotYspeed: number;
    cloudScale: number;
    dwellLogoMs: number;
    dwellPeaceMs: number;
    dwellHeartMs: number;
    glitchIntervalMs: number;
    glitchEnabled: boolean;
    glitchAmpScale: number;     // multiplier on amplitude (0..2)
    glitchFreqScale: number;    // multiplier on frequency (0.25..3)
    glitchMaxOctaves: number;   // 1..3, caps per-beat octaves
    glitchDurationScale: number; // multiplier on per-beat durationMs (0.25..3)
    scatterKick: number;
    clickPerlinChance: number;
    particleSize: number;
    trailAlpha: number;
    // Ambient perlin knobs — drive perlin force constants live via
    // world.setForceConstants. Frequency stored as scale (1/frequency, in
    // pixels per noise cycle) since "scale" reads more naturally as a knob.
    ambientPerlinScale: number;     // pixels per cycle; set 50 = "loose swirl"
    ambientPerlinSpeed: number;     // cycles per second (time evolution)
    ambientPerlinStrength: number;  // peak velocity delta (px/s)
    ambientPerlinOctaves: number;   // 1..3
  } = {
    rotXspeed: SHOWCASE.rotXspeed,
    rotYspeed: SHOWCASE.rotYspeed,
    cloudScale: SHOWCASE.cloudScale,
    dwellLogoMs: SHOWCASE.dwellLogoMs,
    dwellPeaceMs: SHOWCASE.dwellPeaceMs,
    dwellHeartMs: SHOWCASE.dwellHeartMs,
    glitchIntervalMs: SHOWCASE.glitchIntervalMs,
    glitchEnabled: true,
    glitchAmpScale: 1,
    glitchFreqScale: 1,
    glitchMaxOctaves: 3,
    glitchDurationScale: 1,
    scatterKick: SHOWCASE.scatterKick,
    clickPerlinChance: SHOWCASE.clickPerlinChance,
    particleSize: SHOWCASE.particleSize,
    trailAlpha: SHOWCASE.trailAlpha,
    ambientPerlinScale: 50,        // 50 px/cycle ≈ medium swirl
    ambientPerlinSpeed: 0,          // frozen by default
    ambientPerlinStrength: 0,       // off by default
    ambientPerlinOctaves: 2,
  };

  // ─── DOM (fullscreen, no chrome) ────────────────────────────────────
  // We don't request the Fullscreen API (it requires a user gesture and
  // adds friction). Instead we cover the viewport with a fixed-position
  // host. The router teardown removes it cleanly.
  const host = document.createElement('div');
  Object.assign(host.style, {
    position: 'fixed',
    inset: '0',
    background:
      'radial-gradient(ellipse at center, #14141f 0%, #0a0a14 70%, #050509 100%)',
    overflow: 'hidden',
    zIndex: '9999',
  } satisfies Partial<CSSStyleDeclaration>);
  root.appendChild(host);

  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    display: 'block',
    width: '100vw',
    height: '100vh',
    cursor: 'crosshair',
  } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(canvas);

  // DPR hoisted up here because the corner-stack mini particle
  // canvases below need it at construction time. Capped at 2 — many
  // phones report 3+ which would triple fragment cost for marginal
  // visual gain.
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  // Acid theme accent — chartreuse text on the dark gradient bg.
  const ACID_ACCENT = 'rgba(212, 255, 58, 0.78)';
  const ACID_ACCENT_DIM = 'rgba(212, 255, 58, 0.40)';

  // Status pill — moved to TOP-right so the bottom-right slot belongs
  // to the clock.
  const status = document.createElement('div');
  Object.assign(status.style, {
    position: 'absolute',
    top: '24px',
    right: '28px',
    color: ACID_ACCENT_DIM,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    pointerEvents: 'none',
    transition: 'opacity 0.4s ease',
  } satisfies Partial<CSSStyleDeclaration>);
  status.textContent = 'booting…';
  host.appendChild(status);

  // Bottom-right corner stack (top → bottom):
  //   1. icons row — peace, heart, logo at correct relative scale
  //   2. clock — wall time in mono
  //   3. brand label — "the6ixCollective"
  // All right-aligned in a flex column. Icon row mirrors the cycle
  // and lights up the currently-active mode.
  const corner = document.createElement('div');
  Object.assign(corner.style, {
    position: 'absolute',
    bottom: '22px',
    right: '28px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: '12px',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(corner);

  // Icon row — three mini particle clouds (peace, heart, logo). Each
  // is its own canvas drawing a sub-sample of the corresponding big
  // cloud, projected through the same rotation matrix every frame so
  // all three spin in sync with the main scene. The active one glows
  // full-chartreuse; the other two stay dim.
  //
  // Sub-sample size 1500 reads as a clearly recognisable shape and
  // costs ~270 k canvas ops/sec across the row — well under any
  // performance threshold for Canvas 2D fillRect.
  //
  // Heights mirror the cloud scale ratios so peace appears 62 % the
  // size of logo and heart 95 % — the same numbers that drive the
  // big particle clouds' targetRadius.
  const ICON_BASE = 72;
  const ICON_SUBSAMPLE_N = 1500;
  const ICON_FILL_RATIO = 0.85; // cloud fills 85 % of its canvas

  const iconRow = document.createElement('div');
  Object.assign(iconRow.style, {
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    gap: '18px',
    height: `${ICON_BASE}px`,
  } satisfies Partial<CSSStyleDeclaration>);
  corner.appendChild(iconRow);

  // Even-stride sub-sample. Cloud points are random-uniform within
  // the source distribution, so striding gives a representative subset.
  const subsampleCloud = (cloud: Float32Array, n: number): Float32Array => {
    const total = (cloud.length / 3) | 0;
    const out = new Float32Array(n * 3);
    if (total === 0) return out;
    const step = total / n;
    for (let i = 0; i < n; i++) {
      const src = (i * step) | 0;
      out[i * 3]     = cloud[src * 3]!;
      out[i * 3 + 1] = cloud[src * 3 + 1]!;
      out[i * 3 + 2] = cloud[src * 3 + 2]!;
    }
    return out;
  };

  type IconCloud = {
    mode: Mode;
    cloud: Float32Array;     // populated post-boot via setIconCloud()
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    fitRadius: number;       // cloud's natural max radius (for canvas fit)
    cssSize: number;         // CSS pixel size of canvas
  };

  const makeIconCloud = (mode: Mode, scale: number, fitRadius: number): IconCloud => {
    const cssSize = ICON_BASE * scale;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(cssSize * dpr);
    canvas.height = Math.floor(cssSize * dpr);
    Object.assign(canvas.style, {
      width: `${cssSize}px`,
      height: `${cssSize}px`,
      opacity: '0.42',
      transition: 'opacity 0.32s ease, transform 0.32s ease',
    } satisfies Partial<CSSStyleDeclaration>);
    const ctx = canvas.getContext('2d')!;
    iconRow.appendChild(canvas);
    return {
      mode,
      cloud: new Float32Array(0),
      canvas,
      ctx,
      fitRadius,
      cssSize,
    };
  };

  // Order in the row matches the cycle: peace → heart → logo. The
  // fitRadius matches each cloud's targetRadius so all three render
  // at their natural relative scale within their canvases.
  const iconClouds: ReadonlyArray<IconCloud> = [
    makeIconCloud('peace', 0.62, SHOWCASE.modelRadius * 0.62),
    makeIconCloud('heart', 0.95, SHOWCASE.modelRadius * 0.95),
    makeIconCloud('logo',  1.0,  SHOWCASE.modelRadius),
  ];

  // Sub-sample the big clouds into the icons. Called once after boot
  // when clouds.peace / .heart / .logo are populated.
  const setIconCloud = (mode: Mode, source: Float32Array): void => {
    const target = iconClouds.find((ic) => ic.mode === mode);
    if (target) target.cloud = subsampleCloud(source, ICON_SUBSAMPLE_N);
  };

  // Highlight the icon for whichever mode is currently the particle
  // cloud. Called on every transition.
  const setActiveIcon = (m: Mode): void => {
    for (const ic of iconClouds) {
      const active = ic.mode === m;
      ic.canvas.style.opacity = active ? '1' : '0.42';
      ic.canvas.style.transform = active ? 'scale(1.08)' : 'scale(1)';
    }
  };

  // Per-frame draw — projects each icon's sub-sampled cloud through
  // the same rotation as the main scene (no perspective; icons are
  // tiny enough that orthographic reads better than depth-cued).
  const drawIcons = (rotX: number, rotY: number): void => {
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const cx = Math.cos(rotX), sx = Math.sin(rotX);
    for (const ic of iconClouds) {
      if (ic.cloud.length === 0) continue;
      const w = ic.canvas.width;
      const h = ic.canvas.height;
      ic.ctx.clearRect(0, 0, w, h);
      // Active icon = full chartreuse; inactive = dimmed (opacity is
      // also CSS-controlled so the styles compose).
      ic.ctx.fillStyle = 'rgba(212, 255, 58, 0.95)';
      const cxC = w * 0.5;
      const cyC = h * 0.5;
      const scale = (Math.min(w, h) * 0.5 * ICON_FILL_RATIO) / ic.fitRadius;
      const dot = Math.max(1, dpr | 0);
      const pts = ic.cloud;
      const n = pts.length / 3;
      for (let i = 0; i < n; i++) {
        const px = pts[i * 3]!;
        const py = pts[i * 3 + 1]!;
        const pz = pts[i * 3 + 2]!;
        // Same Rx · Ry composition as the engine's project kernel,
        // but no perspective (orthographic is enough at 50 px).
        const x1 = px * cy + pz * sy;
        const z1 = -px * sy + pz * cy;
        const y2 = py * cx - z1 * sx;
        const sxC = cxC + x1 * scale;
        const syC = cyC + y2 * scale;
        ic.ctx.fillRect(sxC, syC, dot, dot);
      }
    }
  };

  // ─── Clock + brand as particles ────────────────────────────────
  // Both lines (HH:MM:SS time + "the6ixCollective" brand) render as
  // sampled point clouds drawn on small Canvas2D elements — same as
  // the icon row above, but flat (no rotation) because they need to
  // stay readable.
  //
  // The brand bakes once at boot (text never changes). The clock
  // re-samples sampleText() every second; with the same RNG seed each
  // call, digits that *don't* change between ticks render to a
  // similar — but not identical — set of pixel positions, producing
  // a soft fluttery LED-display feel (acceptable; full stability
  // would need a per-glyph cache and a seeded shuffle, future polish).
  const LABEL_FONT = 'bold 39px ui-monospace, SFMono-Regular, Menlo, monospace';
  const LABEL_TEXT_RADIUS = 220; // sampleText targetRadius — sets cloud span
  const BRAND_POINTS = 2400;
  const LABEL_HEIGHT_CSS = 50; // CSS px for both rows; aspect → CSS width

  type ParticleLabel = {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    cloud: Float32Array;
    bbox: { minX: number; minY: number; maxX: number; maxY: number };
  };

  const computeBbox = (cloud: Float32Array): ParticleLabel['bbox'] => {
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    const n = cloud.length / 3;
    for (let i = 0; i < n; i++) {
      const x = cloud[i * 3]!;
      const y = cloud[i * 3 + 1]!;
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
    }
    return { minX, minY, maxX, maxY };
  };

  const buildLabel = (
    initialText: string,
    n: number,
    rngSeed: number,
  ): ParticleLabel => {
    const cloud = sampleText({
      text: initialText,
      font: LABEL_FONT,
      n,
      rng: mulberry32(rngSeed),
      targetRadius: LABEL_TEXT_RADIUS,
    });
    const bbox = computeBbox(cloud);
    const aspect = (bbox.maxX - bbox.minX) / Math.max(1e-3, bbox.maxY - bbox.minY);
    const cssH = LABEL_HEIGHT_CSS;
    const cssW = cssH * aspect;
    const canvas = document.createElement('canvas');
    canvas.width = Math.floor(cssW * dpr);
    canvas.height = Math.floor(cssH * dpr);
    canvas.style.width = `${cssW}px`;
    canvas.style.height = `${cssH}px`;
    const ctx = canvas.getContext('2d')!;
    return { canvas, ctx, cloud, bbox };
  };

  const drawLabel = (label: ParticleLabel): void => {
    const { ctx, cloud, bbox, canvas } = label;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = ACID_ACCENT;
    const bw = bbox.maxX - bbox.minX;
    const bh = bbox.maxY - bbox.minY;
    // Uniform scale that fits the bbox into the canvas while
    // preserving aspect. Use min so we never overflow either axis.
    const scale = Math.min(canvas.width / bw, canvas.height / bh);
    const dot = Math.max(1, dpr | 0);
    const n = cloud.length / 3;
    for (let i = 0; i < n; i++) {
      const x = (cloud[i * 3]! - bbox.minX) * scale;
      const y = (cloud[i * 3 + 1]! - bbox.minY) * scale;
      ctx.fillRect(x, y, dot, dot);
    }
  };

  // Brand bakes once with the whole-string sampler — text never
  // changes, no need for per-glyph stability.
  const brandLabel = buildLabel('the6ixCollective', BRAND_POINTS, 0xb12a);

  // ─── Clock: per-glyph cache for rock-stable digit positions ────
  // The earlier whole-string re-sample-every-second fluttered every
  // digit (different lit-pixel sets per change) — even unchanged ones.
  // Now each glyph (`0`–`9`, `:`) is sampled ONCE at boot into its
  // own cloud, centered around its own cell center. The clock draw
  // step composes the displayed string by picking the right glyph
  // per cell at fixed mono-advance offsets — digits that don't change
  // between seconds redraw at IDENTICAL pixel positions.
  type GlyphCloud = {
    cloud: Float32Array;     // points centered on the glyph cell origin
    advance: number;         // CSS-px advance width (monospace = uniform)
    cssHeight: number;       // CSS-px cell height
  };

  const CLOCK_FONT_SIZE = 39;
  const CLOCK_FONT_FAMILY = 'ui-monospace, SFMono-Regular, Menlo, monospace';
  const CLOCK_POINTS_PER_GLYPH = 180;

  const sampleGlyph = (
    ch: string,
    fontSize: number,
    fontFamily: string,
    n: number,
    rng: Rng,
  ): GlyphCloud => {
    const measureCanvas = document.createElement('canvas');
    const measureCtx = measureCanvas.getContext('2d')!;
    const fontStr = `bold ${fontSize}px ${fontFamily}`;
    measureCtx.font = fontStr;
    const metrics = measureCtx.measureText(ch);
    const advance = metrics.width;
    const ascent = metrics.actualBoundingBoxAscent ?? fontSize * 0.8;
    const descent = metrics.actualBoundingBoxDescent ?? fontSize * 0.2;
    const pad = 4;
    const cssW = Math.max(8, Math.ceil(advance + pad * 2));
    const cssH = Math.ceil(ascent + descent + pad * 2);

    const sampleDpr = 2;
    const sampleCanvas = document.createElement('canvas');
    sampleCanvas.width = cssW * sampleDpr;
    sampleCanvas.height = cssH * sampleDpr;
    const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true })!;
    ctx.scale(sampleDpr, sampleDpr);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, cssW, cssH);
    ctx.fillStyle = '#fff';
    ctx.font = fontStr;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    ctx.fillText(ch, cssW * 0.5, cssH * 0.5);

    const data = ctx.getImageData(0, 0, sampleCanvas.width, sampleCanvas.height).data;
    const eligible: number[] = [];
    const totalPx = sampleCanvas.width * sampleCanvas.height;
    for (let p = 0; p < totalPx; p++) {
      if (data[p * 4]! >= 160) eligible.push(p);
    }

    const cloud = new Float32Array(n * 3);
    if (eligible.length === 0) return { cloud, advance, cssHeight: cssH };

    // Points stored centered on the cell's origin (0, 0). The clock's
    // draw step translates by cell index × advance + cellCenter.
    for (let i = 0; i < n; i++) {
      const p = eligible[(rng() * eligible.length) | 0]!;
      const px = (p % sampleCanvas.width) / sampleDpr;
      const py = Math.floor(p / sampleCanvas.width) / sampleDpr;
      cloud[i * 3]     = px - cssW * 0.5;
      cloud[i * 3 + 1] = py - cssH * 0.5;
      cloud[i * 3 + 2] = 0;
    }
    return { cloud, advance, cssHeight: cssH };
  };

  const glyphCache = new Map<string, GlyphCloud>();
  {
    // One RNG threaded across all glyphs — each glyph consumes
    // the same number of draws, so per-glyph determinism is fine.
    const grng = mulberry32(0xc10c41e0);
    for (const ch of '0123456789:') {
      glyphCache.set(ch, sampleGlyph(ch, CLOCK_FONT_SIZE, CLOCK_FONT_FAMILY, CLOCK_POINTS_PER_GLYPH, grng));
    }
  }
  const refGlyph = glyphCache.get('0')!;
  const clockCellW = refGlyph.advance;
  const clockCellH = refGlyph.cssHeight;
  const CLOCK_LEN = '00:00:00'.length;

  const clockCanvas = document.createElement('canvas');
  const clockCssW = clockCellW * CLOCK_LEN;
  const clockCssH = clockCellH;
  clockCanvas.width = Math.floor(clockCssW * dpr);
  clockCanvas.height = Math.floor(clockCssH * dpr);
  clockCanvas.style.width = `${clockCssW}px`;
  clockCanvas.style.height = `${clockCssH}px`;
  const clockCtx = clockCanvas.getContext('2d')!;

  // Append in stack order: clock above brand.
  corner.appendChild(clockCanvas);
  corner.appendChild(brandLabel.canvas);
  drawLabel(brandLabel);

  let currentClockText = '';
  const drawClock = (text: string): void => {
    if (text === currentClockText) return;
    currentClockText = text;
    clockCtx.clearRect(0, 0, clockCanvas.width, clockCanvas.height);
    clockCtx.fillStyle = ACID_ACCENT;
    const dot = Math.max(1, dpr | 0);
    const cy = clockCanvas.height * 0.5;
    for (let i = 0; i < text.length; i++) {
      const glyph = glyphCache.get(text[i]!);
      if (!glyph) continue;
      const cx = (i + 0.5) * clockCellW * dpr;
      const cloud = glyph.cloud;
      const n = cloud.length / 3;
      for (let p = 0; p < n; p++) {
        const x = cx + cloud[p * 3]! * dpr;
        const y = cy + cloud[p * 3 + 1]! * dpr;
        clockCtx.fillRect(x, y, dot, dot);
      }
    }
  };

  const updateClock = (): void => {
    const d = new Date();
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    drawClock(`${hh}:${mm}:${ss}`);
  };
  updateClock();
  const clockInterval = setInterval(updateClock, 1000);

  // Hint (bottom-center). Fades on first click.
  const hint = document.createElement('div');
  Object.assign(hint.style, {
    position: 'absolute',
    bottom: '32px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: ACID_ACCENT_DIM,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    pointerEvents: 'none',
    transition: 'opacity 0.6s ease',
  } satisfies Partial<CSSStyleDeclaration>);
  hint.textContent = 'click to kick · f fullscreen · m controls · esc to exit';
  host.appendChild(hint);

  // Brand mark (top-left).
  const brand = document.createElement('div');
  Object.assign(brand.style, {
    position: 'absolute',
    top: '24px',
    left: '28px',
    color: ACID_ACCENT_DIM,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    letterSpacing: '0.30em',
    textTransform: 'uppercase',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  brand.textContent = 'the6ixCollective · gpu showcase';
  host.appendChild(brand);

  // Fullscreen button (bottom-left). Pairs with the F key — both call
  // the same toggle. Browser Fullscreen API needs a user gesture so we
  // can't auto-enter; the button is the canonical entry point.
  const fsBtn = document.createElement('button');
  fsBtn.type = 'button';
  fsBtn.textContent = 'FULLSCREEN';
  Object.assign(fsBtn.style, {
    position: 'absolute',
    bottom: '24px',
    left: '28px',
    padding: '8px 14px',
    background: 'rgba(10, 10, 20, 0.55)',
    border: `1px solid ${ACID_ACCENT_DIM}`,
    borderRadius: '3px',
    color: ACID_ACCENT,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    fontWeight: '700',
    letterSpacing: '0.22em',
    cursor: 'pointer',
    backdropFilter: 'blur(10px) saturate(1.2)',
    transition: 'background 0.15s ease, color 0.15s ease, border-color 0.15s ease',
    pointerEvents: 'auto',
  } satisfies Partial<CSSStyleDeclaration>);
  // @ts-expect-error WebkitBackdropFilter is non-standard but Safari needs it.
  fsBtn.style.WebkitBackdropFilter = 'blur(10px) saturate(1.2)';
  fsBtn.addEventListener('mouseenter', () => {
    fsBtn.style.background = 'rgba(212, 255, 58, 0.14)';
    fsBtn.style.borderColor = ACID_ACCENT;
  });
  fsBtn.addEventListener('mouseleave', () => {
    fsBtn.style.background = 'rgba(10, 10, 20, 0.55)';
    fsBtn.style.borderColor = ACID_ACCENT_DIM;
  });
  host.appendChild(fsBtn);

  const isFullscreen = (): boolean => document.fullscreenElement === host;
  const toggleFullscreen = (): void => {
    if (isFullscreen()) {
      void document.exitFullscreen().catch(() => {});
    } else {
      const req = host.requestFullscreen?.();
      if (req) void req.catch(() => {});
    }
  };
  fsBtn.addEventListener('click', toggleFullscreen);
  // Sync the button label + canvas size when fullscreen state flips —
  // covers explicit toggle, F key, and the user pressing Escape.
  const onFullscreenChange = (): void => {
    fsBtn.textContent = isFullscreen() ? 'EXIT FULLSCREEN' : 'FULLSCREEN';
    // Browser updates window.innerWidth/Height before this fires;
    // re-running applySize() catches the new dimensions immediately
    // (without waiting for the resize event, which lags in some browsers).
    applySize();
  };
  document.addEventListener('fullscreenchange', onFullscreenChange);

  // ─── Controls panel (M to toggle) ────────────────────────────────
  // Hidden by default; press M to slide it in. Sliders mutate the
  // appropriate live target — `state` for cycle / rotation / scale
  // tunables, `restFeel` for the dwell spring/drag profile.
  //
  // Acid-themed: chartreuse on a translucent dark surface so it sits
  // calmly over the field instead of fighting the particles for
  // attention.
  const panel = document.createElement('div');
  Object.assign(panel.style, {
    position: 'absolute',
    top: '60px',
    left: '28px',
    width: '280px',
    // Cap height to viewport minus the top offset and a comfortable bottom
    // margin; overflow knobs scroll. Without this the panel ran off the
    // bottom of the screen on shorter viewports as we kept adding knobs.
    maxHeight: 'calc(100vh - 120px)',
    overflowY: 'auto',
    padding: '18px 20px 22px',
    background: 'rgba(10, 10, 20, 0.78)',
    border: `1px solid ${ACID_ACCENT_DIM}`,
    borderRadius: '4px',
    color: ACID_ACCENT,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    letterSpacing: '0.10em',
    backdropFilter: 'blur(14px) saturate(1.2)',
    transform: 'translateX(-340px)',
    transition: 'transform 0.32s cubic-bezier(0.4, 0, 0.2, 1)',
    pointerEvents: 'auto',
    userSelect: 'none',
    // Acid-themed scrollbar so the panel doesn't break the dark glass look.
    scrollbarWidth: 'thin',
    scrollbarColor: `${ACID_ACCENT_DIM} transparent`,
  } satisfies Partial<CSSStyleDeclaration>);
  // @ts-expect-error WebkitBackdropFilter is non-standard but Safari needs it.
  panel.style.WebkitBackdropFilter = 'blur(14px) saturate(1.2)';
  host.appendChild(panel);

  const panelHeader = document.createElement('div');
  panelHeader.textContent = 'CONTROLS';
  Object.assign(panelHeader.style, {
    color: ACID_ACCENT,
    fontWeight: '700',
    letterSpacing: '0.30em',
    marginBottom: '14px',
    fontSize: '10px',
  } satisfies Partial<CSSStyleDeclaration>);
  panel.appendChild(panelHeader);

  // Knob factory — one row per tunable. Returns the input element so
  // callers can drive value updates from outside (e.g. reset).
  const makeKnob = (label: string, opts: {
    min: number;
    max: number;
    step: number;
    value: number;
    format?: (v: number) => string;
    apply: (v: number) => void;
  }): HTMLInputElement => {
    const row = document.createElement('div');
    Object.assign(row.style, {
      marginBottom: '10px',
    } satisfies Partial<CSSStyleDeclaration>);
    const head = document.createElement('div');
    Object.assign(head.style, {
      display: 'flex',
      justifyContent: 'space-between',
      marginBottom: '4px',
      fontSize: '10px',
      letterSpacing: '0.16em',
      textTransform: 'uppercase',
      color: ACID_ACCENT_DIM,
    } satisfies Partial<CSSStyleDeclaration>);
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    const fmt = opts.format ?? ((v: number) => v.toFixed(2));
    valueEl.textContent = fmt(opts.value);
    valueEl.style.color = ACID_ACCENT;
    head.appendChild(labelEl);
    head.appendChild(valueEl);
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(opts.min);
    input.max = String(opts.max);
    input.step = String(opts.step);
    input.value = String(opts.value);
    Object.assign(input.style, {
      width: '100%',
      accentColor: '#d4ff3a',
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valueEl.textContent = fmt(v);
      opts.apply(v);
    });
    row.appendChild(head);
    row.appendChild(input);
    panel.appendChild(row);
    return input;
  };

  // Build the knobs. Order: feel → rotation → cloud → cycle → glitch.
  makeKnob('spring K', {
    min: 4, max: 200, step: 1, value: restFeel.springK,
    format: (v) => v.toFixed(0),
    apply: (v) => { restFeel.springK = v; },
  });
  makeKnob('spring C', {
    min: 0.5, max: 16, step: 0.1, value: restFeel.springC,
    format: (v) => v.toFixed(1),
    apply: (v) => { restFeel.springC = v; },
  });
  makeKnob('drag', {
    min: 0.05, max: 1.2, step: 0.01, value: restFeel.drag,
    apply: (v) => { restFeel.drag = v; },
  });
  makeKnob('rot X speed', {
    min: -1.5, max: 1.5, step: 0.02, value: state.rotXspeed,
    apply: (v) => { state.rotXspeed = v; },
  });
  makeKnob('rot Y speed', {
    min: -1.5, max: 1.5, step: 0.02, value: state.rotYspeed,
    apply: (v) => { state.rotYspeed = v; },
  });
  makeKnob('cloud scale', {
    min: 0.4, max: 4.0, step: 0.05, value: state.cloudScale,
    apply: (v) => { state.cloudScale = v; },
  });
  makeKnob('dwell (s)', {
    min: 1, max: 20, step: 0.5, value: state.dwellLogoMs / 1000,
    format: (v) => v.toFixed(1),
    apply: (v) => {
      state.dwellLogoMs = v * 1000;
      state.dwellPeaceMs = v * 1000;
      state.dwellHeartMs = v * 1000;
    },
  });
  makeKnob('glitch every (s)', {
    min: 2, max: 30, step: 0.5, value: state.glitchIntervalMs / 1000,
    format: (v) => v.toFixed(1),
    apply: (v) => { state.glitchIntervalMs = v * 1000; },
  });
  // Glitch enabled — encoded as 0/1 since makeKnob only takes numbers.
  makeKnob('glitch enabled', {
    min: 0, max: 1, step: 1, value: state.glitchEnabled ? 1 : 0,
    format: (v) => (v >= 0.5 ? 'on' : 'off'),
    apply: (v) => { state.glitchEnabled = v >= 0.5; },
  });
  makeKnob('glitch amp x', {
    min: 0, max: 2, step: 0.05, value: state.glitchAmpScale,
    apply: (v) => { state.glitchAmpScale = v; },
  });
  makeKnob('glitch freq x', {
    min: 0.25, max: 3, step: 0.05, value: state.glitchFreqScale,
    apply: (v) => { state.glitchFreqScale = v; },
  });
  makeKnob('glitch octaves', {
    min: 1, max: 3, step: 1, value: state.glitchMaxOctaves,
    format: (v) => v.toFixed(0),
    apply: (v) => { state.glitchMaxOctaves = v; },
  });
  makeKnob('glitch dur x', {
    min: 0.25, max: 3, step: 0.05, value: state.glitchDurationScale,
    apply: (v) => { state.glitchDurationScale = v; },
  });
  makeKnob('scatter kick', {
    min: 200, max: 6000, step: 50, value: state.scatterKick,
    format: (v) => v.toFixed(0),
    apply: (v) => { state.scatterKick = v; },
  });
  makeKnob('click splash %', {
    min: 0, max: 1, step: 0.02, value: state.clickPerlinChance,
    format: (v) => `${(v * 100).toFixed(0)}%`,
    apply: (v) => { state.clickPerlinChance = v; },
  });
  makeKnob('particle size', {
    min: 0.5, max: 4, step: 0.1, value: state.particleSize,
    apply: (v) => {
      state.particleSize = v;
      // Renderer setter is on WebGPURenderer specifically; duck-type the
      // call so the panel stays renderer-agnostic.
      const r = renderer as unknown as { setParticleSize?: (v: number) => void };
      r.setParticleSize?.(v);
    },
  });
  makeKnob('trail alpha', {
    min: 0, max: 1, step: 0.01, value: state.trailAlpha,
    apply: (v) => {
      state.trailAlpha = v;
      const r = renderer as unknown as { setTrailAlpha?: (v: number) => void };
      r.setTrailAlpha?.(v);
    },
  });

  // ── Ambient perlin force ─────────────────────────────────────────────
  // perlin is now a regular force in the stack (Phase 2). These knobs drive
  // its constants live via world.setForceConstants — the field is sampled
  // every frame, so changes take effect immediately.
  //
  // Caveat: the auto-glitch (legacy applyPerlinGlitch shim) overrides
  // perlin* during a burst, then restores prior values. So while a glitch
  // is mid-flight, your panel-set strength is temporarily clobbered. The
  // restore lands within ~120-320ms; "ambient strength" reasserts.
  const writePerlin = (next: Partial<{ perlinFrequency: number; perlinSpeed: number; perlinStrength: number; perlinOctaves: number }>): void => {
    if (!world) return;
    world.setForceConstants(next);
  };
  makeKnob('perlin scale (px/cycle)', {
    min: 8, max: 400, step: 2, value: state.ambientPerlinScale,
    format: (v) => v.toFixed(0),
    apply: (v) => {
      state.ambientPerlinScale = v;
      // Frequency = 1 / scale; smaller scale = higher frequency = tighter chaos.
      writePerlin({ perlinFrequency: 1 / v });
    },
  });
  makeKnob('perlin speed', {
    min: 0, max: 2, step: 0.02, value: state.ambientPerlinSpeed,
    apply: (v) => {
      state.ambientPerlinSpeed = v;
      writePerlin({ perlinSpeed: v });
    },
  });
  makeKnob('perlin strength', {
    min: 0, max: 800, step: 5, value: state.ambientPerlinStrength,
    format: (v) => v.toFixed(0),
    apply: (v) => {
      state.ambientPerlinStrength = v;
      writePerlin({ perlinStrength: v });
    },
  });
  makeKnob('perlin octaves', {
    min: 1, max: 3, step: 1, value: state.ambientPerlinOctaves,
    format: (v) => v.toFixed(0),
    apply: (v) => {
      state.ambientPerlinOctaves = v;
      writePerlin({ perlinOctaves: v });
    },
  });

  const panelHint = document.createElement('div');
  panelHint.textContent = 'PRESS M TO HIDE';
  Object.assign(panelHint.style, {
    color: ACID_ACCENT_DIM,
    fontSize: '9px',
    letterSpacing: '0.30em',
    marginTop: '10px',
    textAlign: 'center',
  } satisfies Partial<CSSStyleDeclaration>);
  panel.appendChild(panelHint);

  let panelOpen = false;
  const togglePanel = (): void => {
    panelOpen = !panelOpen;
    panel.style.transform = panelOpen ? 'translateX(0)' : 'translateX(-340px)';
  };

  // Viewport dims read from the host element — `position: fixed; inset: 0`
  // makes host.clientWidth/Height equal the visual viewport without
  // counting scrollbars or browser-chrome quirks. window.innerWidth
  // sometimes drifts on ultrawide / portrait layouts (especially with
  // a vertical scrollbar present on the body), which left the scene
  // anchored off-center. (DPR hoisted up earlier so the corner-stack
  // mini particle canvases can use it at construction.)
  let W = window.innerWidth;
  let H = window.innerHeight;
  let cursorCenteredOnce = false;
  const applySize = (): void => {
    W = window.innerWidth;
    H = window.innerHeight;
    // renderer.resize expects CSS pixels (it multiplies by DPR internally).
    // It also OVERRIDES canvas.width / canvas.style.width itself, so we
    // skip the manual write — calling renderer.resize is the source of
    // truth for both the backing buffer and the layout size.
    // (Pre-renderer boot still needs canvas sized for the loading hint;
    // we compute device px here for the world's viewport, which IS device
    // pixels.)
    if (renderer) {
      renderer.resize?.(W, H);
    } else {
      // Bare-canvas fallback before renderer exists.
      canvas.width = Math.floor(W * dpr);
      canvas.height = Math.floor(H * dpr);
      canvas.style.width = `${W}px`;
      canvas.style.height = `${H}px`;
    }
    if (world) world.resize(canvas.width, canvas.height);
    // Center the cursor once at boot so parallax tilt reads zero.
    // After that, leave it where the user left it — re-centering on
    // every resize would yank the parallax mid-interaction.
    if (!cursorCenteredOnce) {
      cursor.x = canvas.width * 0.5;
      cursor.y = canvas.height * 0.5;
      cursorCenteredOnce = true;
    }
  };
  // ResizeObserver is the reliable way to track a fullscreen element's
  // size changes — it fires on browser zoom, fullscreen toggles,
  // device-orientation flips, ultrawide window resizes, and any other
  // layout change. Window 'resize' is a backup for older browsers and
  // edge cases (some F11 transitions don't notify RO immediately).
  const ro = new ResizeObserver(() => applySize());
  ro.observe(host);
  // applySize runs after renderer/world exist — call lazily after boot.

  // ─── State ─────────────────────────────────────────────────────────
  let renderer: Renderer | null = null;
  let world: IWorld | null = null;
  let mesh: LoadedMesh | null = null;
  let raf = 0;
  let glitchInterval: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  // Pre-baked clouds — populated at boot.
  const clouds: {
    logo: Float32Array;
    peace: Float32Array;
    heart: Float32Array;
  } = {
    logo: new Float32Array(0),
    peace: new Float32Array(0),
    heart: new Float32Array(0),
  };

  // Cycle state. mode = current cloud; nextMode is set at the start of
  // a transition. cycleStartT = ms timestamp when the current
  // dwell-or-transition started. transitionStart = ms when transition
  // started, or null if dwelling.
  let mode: Mode = 'peace';
  let nextMode: Mode | null = null;
  let cycleStartT = 0;
  let transitionStartT = 0; // 0 = currently dwelling
  let activeFeel: FeelPreset = restFeel;
  let feelLerpStartT = 0;
  let feelLerpFrom: FeelPreset = restFeel;
  let cycleCounter = 0; // increments each completed cycle (4-mode round)

  // Rotation accumulators — shared across every cloud (peace, heart,
  // logo). All three sample in canvas-Y-down space so the matrix
  // starts at identity and just spins.
  let rotX = 0;
  let rotY = 0;


  // Cursor for click-to-kick + subtle parallax tilt. Starts centered;
  // applySize() will set canvas-pixel coords once the canvas is real.
  const cursor = { x: 0, y: 0 };
  let firstClickHappened = false;


  const PARTICLE_CAP = Math.min(
    SHOWCASE.particleCount,
    detectBudgetFromNavigator(),
  );

  // ─── Click/key handlers ────────────────────────────────────────────
  const onPointerMove = (e: PointerEvent): void => {
    cursor.x = e.clientX * dpr;
    cursor.y = e.clientY * dpr;
  };
  const onPointerDown = (e: PointerEvent): void => {
    cursor.x = e.clientX * dpr;
    cursor.y = e.clientY * dpr;
    if (!world || world.backend !== 'gpu') return;
    (world as WorldGPU).applyRadialImpulse({
      origin: { x: cursor.x, y: cursor.y },
      kick: state.scatterKick * dpr,
      softness: SHOWCASE.scatterSoftness,
    });
    // Lucky N% — chase the kick with a tiny perlin splash.
    if (state.glitchEnabled && Math.random() < state.clickPerlinChance) {
      (world as WorldGPU).applyPerlinGlitch({
        amplitude: 240 * state.glitchAmpScale,
        frequency: 0.018 * state.glitchFreqScale,
        octaves: Math.min(1, state.glitchMaxOctaves),
        durationMs: 220 * state.glitchDurationScale,
        seed: (Math.random() * 0xffffffff) >>> 0,
      });
    }
    if (!firstClickHappened) {
      firstClickHappened = true;
      hint.style.opacity = '0';
    }
  };
  const onKeyDown = (e: KeyboardEvent): void => {
    if (e.key === 'Escape') {
      // Don't override Escape while in fullscreen — the browser's own
      // Escape exits fullscreen first; only THEN should the next press
      // navigate away. (When fullscreen is active, the browser
      // intercepts Escape before it reaches us anyway, but checking
      // here keeps the contract explicit.)
      if (isFullscreen()) return;
      window.history.pushState({}, '', '/experiments');
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else if (e.key === 'm' || e.key === 'M') {
      // Don't fire if a slider has focus — preserves text-input UX
      // even though we don't currently have any. Cheap insurance.
      if (e.target instanceof HTMLInputElement) return;
      togglePanel();
    } else if (e.key === 'f' || e.key === 'F') {
      if (e.target instanceof HTMLInputElement) return;
      toggleFullscreen();
    }
  };
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  window.addEventListener('keydown', onKeyDown);
  const onResize = () => applySize();
  window.addEventListener('resize', onResize);

  // ─── Boot ──────────────────────────────────────────────────────────
  const init = async (): Promise<void> => {
    // Hard-gate on WebGPU. If absent, surface a polite message and bail.
    const hasWebGPU = await detectWebGPU();
    if (!hasWebGPU) {
      status.textContent = 'WEBGPU REQUIRED';
      hint.textContent = 'this showcase needs a WebGPU adapter (Chrome / Edge / FF nightly)';
      hint.style.opacity = '1';
      return;
    }

    status.textContent = 'loading…';
    [renderer, mesh] = await Promise.all([
      createRendererAsync({
        canvas,
        backend: 'webgpu',
        particleSize: SHOWCASE.particleSize * dpr,
        trailAlpha: SHOWCASE.trailAlpha,
        portalMode: false,
        onFallback: (e) => console.warn('[six-showcase] renderer:', e.message),
      }),
      loadGlb(sixLogoGlb),
    ]);
    if (disposed) return;

    world = await createWorld({
      width: canvas.width,
      height: canvas.height,
      backend: 'gpu',
      capacity: PARTICLE_CAP,
      seed: 42,
      onFallback: (e) => console.warn('[six-showcase] world:', e.message),
    });
    if (disposed) return;
    if (world.backend !== 'gpu') {
      status.textContent = 'GPU WORLD UNAVAILABLE';
      return;
    }

    // Apply DPR-true canvas size now that renderer + world exist.
    applySize();

    // ─── Pre-bake every cloud ─────────────────────────────────────────
    // Each cloud is exactly PARTICLE_CAP × 3 floats so setAnchors3D's
    // length check passes without per-mode realloc.
    const rng = mulberry32(0xa1ba6c);

    // Logo from glTF. Blender export is Z-up; we bake a -π/2 rotation
    // around X (x, y, z) → (x, z, -y) into the cloud directly so it's
    // in the same Y-down screen-space convention as peace + heart and
    // the shared rotation matrix can start at identity.
    {
      const cloud = sampleSurface(mesh, PARTICLE_CAP, rng);
      centerAndScale(cloud, mesh.bbox, SHOWCASE.modelRadius);
      for (let i = 0; i < PARTICLE_CAP; i++) {
        const y = cloud[i * 3 + 1]!;
        const z = cloud[i * 3 + 2]!;
        cloud[i * 3 + 1] = z;
        cloud[i * 3 + 2] = -y;
      }
      clouds.logo = cloud;
    }
    clouds.peace = samplePeace({
      n: PARTICLE_CAP,
      rng: mulberry32(0xc4d6),
      // Smaller than logo / heart, with a chunky stencil-weight stroke
      // so the symbol reads clearly at the reduced size.
      targetRadius: SHOWCASE.modelRadius * 0.62,
      strokeThickness: 0.18,
    });
    clouds.heart = sampleHeart({
      n: PARTICLE_CAP,
      rng: mulberry32(0xbeef42),
      targetRadius: SHOWCASE.modelRadius * 0.95,
    });

    // Feed the corner-stack mini particle clouds. They render in sync
    // with the main scene every frame; the active mode glows brighter.
    setIconCloud('peace', clouds.peace);
    setIconCloud('heart', clouds.heart);
    setIconCloud('logo',  clouds.logo);

    // Seed particles from the peace cloud's projected positions so the
    // first frame already has something to spring toward (peace is the
    // first stop in the cycle).
    const initial = projectInit(clouds.peace, rotX, rotY);
    const ps: GpuParticleInput[] = new Array(PARTICLE_CAP);
    for (let i = 0; i < PARTICLE_CAP; i++) {
      const tx = initial[i * 2]!;
      const ty = initial[i * 2 + 1]!;
      ps[i] = {
        x: tx + (rng() - 0.5) * 18,
        y: ty + (rng() - 0.5) * 18,
        vx: 0, vy: 0, tx, ty,
        life: 1,
        color: sampleColor(rng) as unknown as number,
      };
    }
    (world as WorldGPU).setParticles(ps);
    (world as WorldGPU).setAnchors3D(clouds.peace);
    (world as WorldGPU).setForces(['drag', 'spring', 'perlin'], {
      drag: restFeel.drag,
      springK: restFeel.springK,
      springC: restFeel.springC,
      // Perlin force in the stack; gated by perlinStrength=0 (default) so
      // it's free until a control / glitch ramps strength. Frequency seeded
      // to a sane mid-band; control panel + glitches override live.
      perlinFrequency: 0.02,
      perlinSpeed: 0,
      perlinStrength: 0,
      perlinOctaves: 2,
    });
    activeFeel = restFeel;
    feelLerpFrom = restFeel;

    // Start the cycle on peace so the order reads peace → heart → logo.
    mode = 'peace';
    cycleStartT = performance.now();
    setActiveIcon(mode);

    // Kick off the perlin glitch metronome. We use setTimeout chaining
    // (not setInterval) so live edits to state.glitchIntervalMs take
    // effect on the *next* fire instead of being baked in.
    const scheduleNextGlitch = (): void => {
      if (disposed) return;
      glitchInterval = setTimeout(() => {
        triggerGlitch();
        scheduleNextGlitch();
      }, state.glitchIntervalMs);
    };
    scheduleNextGlitch();

    raf = requestAnimationFrame(tick);
  };

  // ─── Glitch sequencer ──────────────────────────────────────────────
  // Multi-stage burst with varying parameters — what the user asked for
  // as "varying perlin noise value combinations". Each stage runs
  // briefly with different (amp, freq, octaves) before the next stomps
  // it (last-write-wins inside WorldGPU). The chained timing creates a
  // recognisable 3-beat glitch that's distinct each time.
  const triggerGlitch = (): void => {
    if (!world || world.backend !== 'gpu') return;
    if (!state.glitchEnabled) return;
    const w = world as WorldGPU;
    const seed1 = (Math.random() * 0xffffffff) >>> 0;
    const seed2 = (Math.random() * 0xffffffff) >>> 0;
    const seed3 = (Math.random() * 0xffffffff) >>> 0;
    const ampS = state.glitchAmpScale;
    const freqS = state.glitchFreqScale;
    const durS = state.glitchDurationScale;
    const octCap = state.glitchMaxOctaves;
    // Beat 1 — fast, tight, low-amp shimmer
    w.applyPerlinGlitch({
      amplitude: (320 + Math.random() * 200) * ampS,
      frequency: (0.020 + Math.random() * 0.012) * freqS,
      octaves: Math.min(1, octCap),
      durationMs: 120 * durS,
      seed: seed1,
    });
    // Beat 2 — wider swirl, larger amp
    setTimeout(() => {
      if (disposed || !world || !state.glitchEnabled) return;
      (world as WorldGPU).applyPerlinGlitch({
        amplitude: (480 + Math.random() * 320) * ampS,
        frequency: (0.006 + Math.random() * 0.008) * freqS,
        octaves: Math.min(2, octCap),
        durationMs: 180 * durS,
        seed: seed2,
      });
    }, 130);
    // Beat 3 — fine chaos, fast decay
    setTimeout(() => {
      if (disposed || !world || !state.glitchEnabled) return;
      (world as WorldGPU).applyPerlinGlitch({
        amplitude: (220 + Math.random() * 160) * ampS,
        frequency: (0.030 + Math.random() * 0.020) * freqS,
        octaves: Math.min(3, octCap),
        durationMs: 100 * durS,
        seed: seed3,
      });
    }, 320);
  };

  // ─── Cycle state machine ───────────────────────────────────────────
  // Three-form cycle: peace → heart → logo → peace → … No surprises;
  // the heart is a regular cycle member now.
  const nextOf = (current: Mode): Mode => {
    if (current === 'peace') return 'heart';
    if (current === 'heart') return 'logo';
    return 'peace';
  };

  const dwellOf = (m: Mode): number => {
    if (m === 'logo') return state.dwellLogoMs;
    if (m === 'peace') return state.dwellPeaceMs;
    return state.dwellHeartMs;
  };

  const cloudOf = (m: Mode): Float32Array => {
    if (m === 'logo') return clouds.logo;
    if (m === 'peace') return clouds.peace;
    return clouds.heart;
  };

  // Begin a transition into `target`. Picks the next feel preset and
  // uploads the new anchor cloud (the spring physics handles the rest).
  const beginTransition = (target: Mode, now: number): void => {
    if (!world || world.backend !== 'gpu') return;
    const w = world as WorldGPU;
    transitionStartT = now;
    nextMode = target;
    // Cycle the feel preset.
    const idx = cycleCounter % FEELS.length;
    const next = FEELS[idx]!;
    feelLerpFrom = activeFeel;
    feelLerpStartT = now;
    activeFeel = next;
    w.setAnchors3D(cloudOf(target));
    // Light up the matching HUD icon as the cloud begins to assemble.
    setActiveIcon(target);
  };

  // Complete the transition — settle into dwell.
  const finishTransition = (now: number): void => {
    if (nextMode) {
      mode = nextMode;
      nextMode = null;
    }
    transitionStartT = 0;
    cycleStartT = now;
    // Restart the feel lerp so dwell glides activeFeel → restFeel
    // instead of snapping. tick's `target` resolves to restFeel while
    // transitionStartT === 0.
    feelLerpFrom = activeFeel;
    feelLerpStartT = now;
    cycleCounter++;
  };

  // ─── Initial-frame projection (CPU) — only for seeding particles ───
  // Enough math to put particles within striking distance of their
  // first targets so the "assemble" effect reads as intentional.
  const projectInit = (
    pts: Float32Array,
    rotX: number,
    rotY: number,
  ): Float32Array => {
    const n = pts.length / 3;
    const out = new Float32Array(n * 2);
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const cx = Math.cos(rotX), sx = Math.sin(rotX);
    const cxC = canvas.width / 2;
    const cyC = canvas.height / 2;
    for (let i = 0; i < n; i++) {
      const px = pts[i * 3]!;
      const py = pts[i * 3 + 1]!;
      const pz = pts[i * 3 + 2]!;
      const x1 = px * cy + pz * sy;
      const z1 = -px * sy + pz * cy;
      const y2 = py * cx - z1 * sx;
      const z2 = py * sx + z1 * cx;
      const dist = SHOWCASE.perspective + SHOWCASE.modelDepth + z2;
      const k = (SHOWCASE.perspective / Math.max(1, dist));
      out[i * 2] = cxC + x1 * k;
      out[i * 2 + 1] = cyC + y2 * k;
    }
    return out;
  };

  // ─── Per-frame loop ────────────────────────────────────────────────
  let last = performance.now();
  let fpsAcc = 0;
  let fpsCount = 0;

  const tick = async (now: number): Promise<void> => {
    if (disposed || !world || !renderer) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Auto-rotate (always advancing — paused matrix during text mode
    // means the rotation accumulator keeps ticking, so when we resume
    // logo/sphere it picks up smoothly).
    rotX += state.rotXspeed * dt;
    rotY += state.rotYspeed * dt;

    // Cursor parallax tilt — tiny offset added to the matrix when in a
    // rotated mode. Makes the cloud feel anchored to your gaze without
    // being a controllable handle.
    const tiltX =
      ((cursor.y / canvas.height) - 0.5) * 0.18; // up/down looks
    const tiltY =
      ((cursor.x / canvas.width) - 0.5) * 0.22;  // left/right looks

    const w = world as WorldGPU;

    // Cycle state machine.
    if (transitionStartT === 0) {
      // Dwelling — see if it's time to switch.
      const elapsed = now - cycleStartT;
      if (elapsed >= dwellOf(mode)) {
        beginTransition(nextOf(mode), now);
      }
    } else {
      // Transitioning — see if it's time to settle.
      if (now - transitionStartT >= SHOWCASE.transitionMs) {
        finishTransition(now);
      }
    }

    // Push the rotation matrix every frame — every cloud (logo, sphere,
    // heart) shares the same 2-axis rotation + parallax tilt.
    const liveMode = nextMode ?? mode;
    const matrix = composeRotXY(rotX + tiltX, rotY + tiltY);
    w.setTransform3D({
      matrix,
      viewport: { w: canvas.width, h: canvas.height },
      perspective: SHOWCASE.perspective,
      modelDepth: SHOWCASE.modelDepth,
      scale: state.cloudScale,
    });

    // HUD mini particle clouds — same rotation, no parallax tilt
    // (jittery on a 50 px canvas).
    drawIcons(rotX, rotY);

    // Lerp the feel preset across the transition window. After the
    // transition completes, glide back to REST_FEEL across the next
    // ~600ms so dwell uses sane defaults.
    const feelElapsed = now - feelLerpStartT;
    const feelLerpDur = transitionStartT > 0
      ? SHOWCASE.transitionMs
      : 600;
    const feelT = Math.min(1, feelElapsed / feelLerpDur);
    const feelEase = easing.outCubic(feelT);
    const target = transitionStartT > 0 ? activeFeel : restFeel;
    const liveK = feelLerpFrom.springK + (target.springK - feelLerpFrom.springK) * feelEase;
    const liveC = feelLerpFrom.springC + (target.springC - feelLerpFrom.springC) * feelEase;
    const liveD = feelLerpFrom.drag + (target.drag - feelLerpFrom.drag) * feelEase;
    w.setForceConstants({ springK: liveK, springC: liveC, drag: liveD });
    if (feelT >= 1 && transitionStartT === 0 && activeFeel !== restFeel) {
      // Snap REST_FEEL as the new "from" so future glides start clean.
      feelLerpFrom = restFeel;
      activeFeel = restFeel;
    }

    // Step physics + render.
    world.tick(dt);
    await renderWorld(renderer, world, canvas.width, canvas.height);

    // FPS readout.
    fpsAcc += dt;
    fpsCount++;
    if (fpsAcc > 0.5) {
      const fps = (fpsCount / fpsAcc).toFixed(0);
      status.textContent = `webgpu · ${PARTICLE_CAP.toLocaleString()} · ${fps} fps · ${liveMode}`;
      fpsAcc = 0;
      fpsCount = 0;
    }

    raf = requestAnimationFrame(tick);
  };

  void init();

  return () => {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    if (glitchInterval) clearTimeout(glitchInterval);
    clearInterval(clockInterval);
    if (isFullscreen()) void document.exitFullscreen().catch(() => {});
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    ro.disconnect();
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    if (world && world.backend === 'gpu') {
      (world as WorldGPU).destroy();
    }
    host.remove();
  };
};
