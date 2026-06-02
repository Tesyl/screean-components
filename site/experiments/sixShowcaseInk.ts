/// <reference types="vite/client" />
// six-showcase — fullscreen GPU showcase, themeable via a colorway.
//
// Two colorways (see COLORWAYS below), selected by `SixInkOptions.theme`:
//   • 'ink' (default) — dark particles on a white surface, ink-on-light HUD.
//   • 'chalk'         — white particles on a black surface, light-on-dark HUD.
// The engine path is identical for both — the WebGPU renderer's particle blend
// is source-over alpha (no additive/bloom), so a dark palette on white and a
// light palette on black are mirror images that "just work". The colorway sets
// the particle palette, the renderer's clear/trail `background`, the host
// backdrop, and every HUD chrome color. See docs/rendering-blend-modes.md.
//
// ─── original behaviour (unchanged) ─────────────────────────────────────
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

// The default 6ix logo glTF is loaded LAZILY (dynamic import in init) so the
// 882 KB asset never lands in the eagerly-evaluated bundle. Consumers that
// pass `options.logoUrl` skip it entirely. See init().

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
} from '@tesyl/screean';
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
  // can be smaller without losing presence. Defaults below are the
  // hand-tuned "ink hero" preset (captured from a live tuning session).
  particleSize: 1.2,
  trailAlpha: 0.58,
  particleCount: 500_000,
  scatterKick: 1900,
  scatterSoftness: 0.06,
  dwellLogoMs: 5800,
  dwellPeaceMs: 5800,
  dwellHeartMs: 5800,
  transitionMs: 1000,
  // One-axis spin — rotXspeed stays at 0 so everything rotates around
  // the vertical (Y) axis only, like a turntable. The X-rotation knob
  // in the M panel is still wired up if you want to dial it back in.
  rotXspeed: 0,
  rotYspeed: 0.42,
  glitchIntervalMs: 18_000,
  clickPerlinChance: 0.72,
  // Post-rotation, pre-perspective scale baked into setTransform3D.
  // Stacks on modelRadius — total visual scale = modelRadius / 260 *
  // cloudScale relative to launch.
  cloudScale: 1.5,
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
const REST_FEEL_DEFAULTS = { springK: 105, springC: 5.4, drag: 0.11 } as const;
const restFeel: FeelPreset = {
  name: 'rest',
  springK: REST_FEEL_DEFAULTS.springK,
  springC: REST_FEEL_DEFAULTS.springC,
  drag: REST_FEEL_DEFAULTS.drag,
};

// Colorway — every theme-varying color in one type-coupled table. The hero
// renders one of these; `SixInkOptions.theme` selects it at mount, defaulting
// to 'ink' for back-compat. The engine path is identical across themes — the
// WebGPU renderer's particle blend is source-over alpha (no additive/bloom),
// so a dark palette on a white surface (ink) and a light palette on a black
// surface (chalk) are mirror images that "just work". See
// docs/rendering-blend-modes.md.
export type SixColorway = 'ink' | 'chalk';
type ColorwaySpec = {
  // Particle palette: grayscale jitter across [litMin, litMax]. The showcase
  // has no depth-cued alpha (every particle holds alpha 255), so this spread
  // gives the silhouette internal texture instead of a flat mass. sat 0 → hue
  // is irrelevant; lit alone drives the value.
  litMin: number;
  litMax: number;
  rendererBg: string;     // renderer clear + trail color, "r,g,b"
  hostGradient: string;   // CSS backdrop behind the canvas
  accent: string;         // primary HUD text / chrome
  accentDim: string;      // secondary HUD text
  iconFill: string;       // corner-stack mini-cloud dot color
  panelSurface: string;   // controls-panel translucent fill
  buttonSurface: string;  // fullscreen-button translucent fill
  buttonHover: string;    // fullscreen-button hover fill
  sliderAccent: string;   // range-input accent-color
  buttonContrast: string; // text color when a button fills with `accent`
  label: string;          // brand-line suffix
};
const COLORWAYS: Record<SixColorway, ColorwaySpec> = {
  // Dark particles on white — the original showcase inversion.
  ink: {
    litMin: 0.0,    // pure black
    litMax: 0.12,   // dark charcoal
    rendererBg: '255,255,255',
    hostGradient: 'radial-gradient(ellipse at center, #ffffff 0%, #f3f3f5 72%, #e9e9ee 100%)',
    accent: 'rgba(11, 11, 11, 0.86)',
    accentDim: 'rgba(11, 11, 11, 0.42)',
    iconFill: 'rgba(11, 11, 11, 0.95)',
    panelSurface: 'rgba(250, 250, 252, 0.82)',
    buttonSurface: 'rgba(250, 250, 252, 0.62)',
    buttonHover: 'rgba(11, 11, 11, 0.10)',
    sliderAccent: '#0b0b0b',
    buttonContrast: '#fff',
    label: 'ink',
  },
  // Light particles on black — the color-flipped twin.
  chalk: {
    litMin: 0.88,   // soft chalk gray
    litMax: 1.0,    // pure white
    rendererBg: '0,0,0',
    hostGradient: 'radial-gradient(ellipse at center, #121215 0%, #08080a 72%, #000000 100%)',
    accent: 'rgba(244, 244, 244, 0.88)',
    accentDim: 'rgba(244, 244, 244, 0.44)',
    iconFill: 'rgba(244, 244, 244, 0.95)',
    panelSurface: 'rgba(10, 10, 12, 0.82)',
    buttonSurface: 'rgba(10, 10, 12, 0.62)',
    buttonHover: 'rgba(244, 244, 244, 0.12)',
    sliderAccent: '#f4f4f4',
    buttonContrast: '#000',
    label: 'chalk',
  },
};
const sampleColor = (rng: Rng, cw: ColorwaySpec): Color => {
  const lit = cw.litMin + rng() * (cw.litMax - cw.litMin);
  const [r, g, b] = hslToRgb(0, 0, lit);
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
// ─── Public API surface ──────────────────────────────────────────────────────
// The showcase is consumed two ways:
//   1. as a standalone experiment — `mount(root)` with no options (router path);
//   2. embedded — `mount(root, { chrome: false, controls: {...} })`, where the
//      host app renders its OWN menu and drives the animation through the
//      returned handle's `setControl` / `getControls`.

// Stable identifiers for every tunable. Type-coupled: adding a control here
// (and to `controlSpecs` below) is the only place a new knob is declared.
export type SixInkControlKey =
  | 'springK'
  | 'springC'
  | 'drag'
  | 'rotXspeed'
  | 'rotYspeed'
  | 'cloudScale'
  | 'dwellSeconds'
  | 'glitchIntervalSeconds'
  | 'glitchEnabled'
  | 'glitchAmpScale'
  | 'glitchFreqScale'
  | 'glitchMaxOctaves'
  | 'glitchDurationScale'
  | 'scatterKick'
  | 'clickPerlinChance'
  | 'particleSize'
  | 'trailAlpha'
  | 'perlinScale'
  | 'perlinSpeed'
  | 'perlinStrength'
  | 'perlinOctaves';

// Serializable descriptor — everything a host menu needs to render a control
// (label, range, baked default, value formatter). No functions that touch
// internals; mutate via `handle.setControl`.
export type SixInkControlMeta = {
  key: SixInkControlKey;
  label: string;
  min: number;
  max: number;
  step: number;
  default: number;
  format: (v: number) => string;
};

// Per-overlay visibility. `mount` defaults every flag to OFF (bare canvas);
// pass `chrome: true` for the full dev HUD or an object for a subset.
export type SixInkChromeFlags = {
  status?: boolean;
  cornerStack?: boolean;
  hint?: boolean;
  brand?: boolean;
  fullscreenButton?: boolean;
  controlsPanel?: boolean;
};

export type SixInkOptions = {
  // How the host fills space:
  //   'viewport'  (default) → position:fixed; inset:0; z-index:9999. The
  //                standalone experiment takes over the screen.
  //   'container' → position:absolute; inset:0; 100%×100%, no z-index. Fills
  //                whatever positioned `root` the caller provides (e.g. an
  //                embed wrapper that owns its own fixed/z-index). Required
  //                when layering UI on top — a fixed z-9999 host would paint
  //                over the host app's content.
  fill?: 'viewport' | 'container';
  // Called when WebGPU is unavailable (or the GPU world/renderer fall back).
  // The host can render its own fallback layer behind the glass. The canvas
  // is left blank (no overlays) when this fires.
  onFallback?: (reason: string) => void;
  // false (default) → no DOM overlays. true → all. Object → per-overlay.
  chrome?: boolean | SixInkChromeFlags;
  // T (cycle drag mode) · F (fullscreen) · M (toggle panel) · Esc (exit).
  // Default true. Pointer drag-to-disturb is always on (it's the interaction).
  keyboard?: boolean;
  // History-API target for Esc. null → Esc is a no-op (embed-safe).
  // Default '/experiments' to preserve standalone behavior.
  exitTo?: string | null;
  // Initial control overrides, applied over the baked defaults once the
  // world is live.
  controls?: Partial<Record<SixInkControlKey, number>>;
  // URL of the 6ix logo glTF used for the logo cloud. Defaults to the asset
  // bundled with this module. Embedders that can't resolve the bundled
  // `?url` import (e.g. a different bundler) pass their own self-hosted copy.
  logoUrl?: string;
  // Colorway: 'ink' (dark particles on white, default) or 'chalk' (white
  // particles on black). Resolved once at mount — it drives the particle
  // palette, the renderer's clear/trail color, and all HUD chrome. Not a live
  // control (the control surface is numeric-only).
  theme?: SixColorway;
};

// What `mount` returns. It IS the teardown function (call it, or `.dispose()`)
// AND carries the live control surface for a host menu.
export type SixInkHandle = (() => void) & {
  dispose: () => void;
  controls: readonly SixInkControlMeta[];
  getControl: (key: SixInkControlKey) => number;
  getControls: () => Record<SixInkControlKey, number>;
  setControl: (key: SixInkControlKey, value: number) => void;
  disturb: () => void;
};

const resolveChrome = (
  c: SixInkOptions['chrome'],
): Required<SixInkChromeFlags> => {
  const all = (b: boolean): Required<SixInkChromeFlags> => ({
    status: b,
    cornerStack: b,
    hint: b,
    brand: b,
    fullscreenButton: b,
    controlsPanel: b,
  });
  if (c === true) return all(true);
  if (!c) return all(false);
  return {
    status: c.status ?? false,
    cornerStack: c.cornerStack ?? false,
    hint: c.hint ?? false,
    brand: c.brand ?? false,
    fullscreenButton: c.fullscreenButton ?? false,
    controlsPanel: c.controlsPanel ?? false,
  };
};

export const mount = (
  root: HTMLElement,
  options: SixInkOptions = {},
): SixInkHandle => {
  root.innerHTML = '';

  // Resolved option surface. Default = bare canvas, keyboard on, Esc → router.
  const chrome = resolveChrome(options.chrome);
  const keyboardEnabled = options.keyboard ?? true;
  const exitTo = options.exitTo === undefined ? '/experiments' : options.exitTo;
  const fillMode = options.fill ?? 'viewport';
  // Resolve the colorway once — drives palette, renderer clear, and all chrome.
  const cw = COLORWAYS[options.theme ?? 'ink'];

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
    glitchAmpScale: 1.7,
    glitchFreqScale: 1,
    glitchMaxOctaves: 3,
    glitchDurationScale: 1,
    scatterKick: SHOWCASE.scatterKick,
    clickPerlinChance: SHOWCASE.clickPerlinChance,
    particleSize: SHOWCASE.particleSize,
    trailAlpha: SHOWCASE.trailAlpha,
    ambientPerlinScale: 192,        // px/cycle — wide, loose swirl
    ambientPerlinSpeed: 1.18,       // brisk evolution
    ambientPerlinStrength: 40,      // gentle background drift; bursts ride on top
    ambientPerlinOctaves: 1,
  };

  // ─── DOM ─────────────────────────────────────────────────────────────
  // 'viewport' (standalone): cover the visual viewport with a fixed host —
  // we don't request the Fullscreen API (it needs a user gesture). 'container'
  // (embed): fill the caller's positioned `root` with an absolute host that
  // claims no stacking of its own, so the host app's content can layer above.
  // Router/host teardown removes it cleanly either way.
  const host = document.createElement('div');
  Object.assign(host.style, {
    ...(fillMode === 'viewport'
      ? { position: 'fixed', zIndex: '9999' }
      : { position: 'absolute' }),
    inset: '0',
    background: cw.hostGradient,
    overflow: 'hidden',
  } satisfies Partial<CSSStyleDeclaration>);
  root.appendChild(host);

  const canvas = document.createElement('canvas');
  Object.assign(canvas.style, {
    display: 'block',
    // 100% of the host (which is the viewport or the container) — not vw/vh,
    // so a contained embed sizes to its box, not the screen.
    width: '100%',
    height: '100%',
    cursor: 'crosshair',
  } satisfies Partial<CSSStyleDeclaration>);
  host.appendChild(canvas);

  // DPR hoisted up here because the corner-stack mini particle
  // canvases below need it at construction time. Capped at 2 — many
  // phones report 3+ which would triple fragment cost for marginal
  // visual gain.
  const dpr = Math.min(2, window.devicePixelRatio || 1);

  // HUD accent — text/chrome color for the active colorway. Kept under the
  // INK_ACCENT names so the many downstream references read unchanged.
  const INK_ACCENT = cw.accent;
  const INK_ACCENT_DIM = cw.accentDim;

  // Status pill — moved to TOP-right so the bottom-right slot belongs
  // to the clock.
  const status = document.createElement('div');
  Object.assign(status.style, {
    position: 'absolute',
    top: '24px',
    right: '28px',
    color: INK_ACCENT_DIM,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    letterSpacing: '0.16em',
    textTransform: 'uppercase',
    pointerEvents: 'none',
    transition: 'opacity 0.4s ease',
  } satisfies Partial<CSSStyleDeclaration>);
  status.textContent = 'booting…';
  if (chrome.status) host.appendChild(status);

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
  if (chrome.cornerStack) host.appendChild(corner);

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
      // Active icon = full ink; inactive = dimmed (opacity is also
      // CSS-controlled so the styles compose).
      ic.ctx.fillStyle = cw.iconFill;
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
    ctx.fillStyle = INK_ACCENT;
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
    clockCtx.fillStyle = INK_ACCENT;
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
  if (chrome.cornerStack) updateClock();
  const clockInterval = chrome.cornerStack
    ? setInterval(updateClock, 1000)
    : 0;

  // Hint (bottom-center). Fades on first click.
  const hint = document.createElement('div');
  Object.assign(hint.style, {
    position: 'absolute',
    bottom: '32px',
    left: '50%',
    transform: 'translateX(-50%)',
    color: INK_ACCENT_DIM,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    letterSpacing: '0.22em',
    textTransform: 'uppercase',
    pointerEvents: 'none',
    transition: 'opacity 0.6s ease',
  } satisfies Partial<CSSStyleDeclaration>);
  hint.textContent = 'drag to disturb · t to cycle modes · f fullscreen · m controls · esc to exit';
  if (chrome.hint) host.appendChild(hint);

  // Brand mark (top-left).
  const brand = document.createElement('div');
  Object.assign(brand.style, {
    position: 'absolute',
    top: '24px',
    left: '28px',
    color: INK_ACCENT_DIM,
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: '11px',
    letterSpacing: '0.30em',
    textTransform: 'uppercase',
    pointerEvents: 'none',
  } satisfies Partial<CSSStyleDeclaration>);
  brand.textContent = `the6ixCollective · gpu showcase · ${cw.label}`;
  if (chrome.brand) host.appendChild(brand);

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
    background: cw.buttonSurface,
    border: `1px solid ${INK_ACCENT_DIM}`,
    borderRadius: '3px',
    color: INK_ACCENT,
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
    fsBtn.style.background = cw.buttonHover;
    fsBtn.style.borderColor = INK_ACCENT;
  });
  fsBtn.addEventListener('mouseleave', () => {
    fsBtn.style.background = cw.buttonSurface;
    fsBtn.style.borderColor = INK_ACCENT_DIM;
  });
  if (chrome.fullscreenButton) host.appendChild(fsBtn);

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
    background: cw.panelSurface,
    border: `1px solid ${INK_ACCENT_DIM}`,
    borderRadius: '4px',
    color: INK_ACCENT,
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
    scrollbarColor: `${INK_ACCENT_DIM} transparent`,
  } satisfies Partial<CSSStyleDeclaration>);
  // @ts-expect-error WebkitBackdropFilter is non-standard but Safari needs it.
  panel.style.WebkitBackdropFilter = 'blur(14px) saturate(1.2)';
  if (chrome.controlsPanel) host.appendChild(panel);

  const panelHeader = document.createElement('div');
  panelHeader.textContent = 'CONTROLS';
  Object.assign(panelHeader.style, {
    color: INK_ACCENT,
    fontWeight: '700',
    letterSpacing: '0.30em',
    marginBottom: '14px',
    fontSize: '10px',
  } satisfies Partial<CSSStyleDeclaration>);
  panel.appendChild(panelHeader);

  // Disturb button — fires per-particle independent velocity impulses
  // through the IBinding bridge (P24). Distinct from a click impulse
  // (which is radial-from-cursor); this one gives every particle its
  // OWN angle and magnitude. The spring snaps everything back to the
  // bound shape, producing a "dancing" feel because each particle
  // takes its own crooked path home.
  const disturbBtn = document.createElement('button');
  disturbBtn.type = 'button';
  disturbBtn.textContent = 'DISTURB';
  Object.assign(disturbBtn.style, {
    width: '100%',
    padding: '10px 12px',
    marginBottom: '14px',
    background: 'transparent',
    border: `1px solid ${INK_ACCENT}`,
    color: INK_ACCENT,
    fontFamily: 'inherit',
    fontSize: '11px',
    letterSpacing: '0.30em',
    fontWeight: '700',
    cursor: 'pointer',
    borderRadius: '4px',
    transition: 'background 120ms ease, color 120ms ease',
  } satisfies Partial<CSSStyleDeclaration>);
  disturbBtn.addEventListener('mouseenter', () => {
    disturbBtn.style.background = INK_ACCENT;
    disturbBtn.style.color = cw.buttonContrast;
  });
  disturbBtn.addEventListener('mouseleave', () => {
    disturbBtn.style.background = 'transparent';
    disturbBtn.style.color = INK_ACCENT;
  });
  // Per-particle scatter through the binding. Same idea as the new
  // `scatter` choreography effect but inlined here because the
  // showcase doesn't run a ChoreoRunner — it talks to the world
  // directly.
  const disturbAll = (): void => {
    if (!world) return;
    const n = (world as WorldGPU).count;
    if (n === 0) return;
    // Magnitude tuning: at 500k particles + springK=60, anything above
    // ~200 px/s reads as "explode and reset to original shape" because
    // the spring snaps them back faster than the eye can resolve the
    // motion. Low magnitudes (60–160) read as a dance INSIDE the
    // silhouette — particles wiggle without leaving the shape.
    const indices: number[] = new Array(n);
    const vxs = new Float32Array(n);
    const vys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      indices[i] = i;
      const angle = Math.random() * Math.PI * 2;
      const mag = 60 + Math.random() * 140;
      vxs[i] = Math.cos(angle) * mag;
      vys[i] = Math.sin(angle) * mag;
    }
    world.binding().setVelocityImpulse(indices, vxs, vys);
  };
  disturbBtn.addEventListener('click', disturbAll);
  panel.appendChild(disturbBtn);

  // ─── Control registry ────────────────────────────────────────────────
  // Single source of truth for the tunables. `makeKnob` below registers
  // each control here (keyed off its display label) as it builds the panel
  // row, so the built-in panel and the host-facing handle (setControl /
  // getControls) drive the exact same apply functions. The registry is
  // populated even when the panel is hidden — the rows are built into a
  // detached `panel` element and simply never appended.
  const LABEL_TO_KEY: Readonly<Record<string, SixInkControlKey>> = {
    'spring K': 'springK',
    'spring C': 'springC',
    drag: 'drag',
    'rot X speed': 'rotXspeed',
    'rot Y speed': 'rotYspeed',
    'cloud scale': 'cloudScale',
    'dwell (s)': 'dwellSeconds',
    'glitch every (s)': 'glitchIntervalSeconds',
    'glitch enabled': 'glitchEnabled',
    'glitch amp x': 'glitchAmpScale',
    'glitch freq x': 'glitchFreqScale',
    'glitch octaves': 'glitchMaxOctaves',
    'glitch dur x': 'glitchDurationScale',
    'scatter kick': 'scatterKick',
    'click splash %': 'clickPerlinChance',
    'particle size': 'particleSize',
    'trail alpha': 'trailAlpha',
    'perlin scale (px/cycle)': 'perlinScale',
    'perlin speed': 'perlinSpeed',
    'perlin strength': 'perlinStrength',
    'perlin octaves': 'perlinOctaves',
  };

  type ControlEntry = {
    meta: SixInkControlMeta;
    apply: (v: number) => void;
    setUI: (v: number) => void; // sync the panel row (no-op work if hidden)
  };
  const controlRegistry = new Map<SixInkControlKey, ControlEntry>();
  const currentControls = {} as Record<SixInkControlKey, number>;

  // Knob factory — one row per tunable. Also registers the control so the
  // host handle can drive it. Returns the input element.
  const makeKnob = (label: string, opts: {
    min: number;
    max: number;
    step: number;
    value: number;
    format?: (v: number) => string;
    apply: (v: number) => void;
  }): HTMLInputElement => {
    const key = LABEL_TO_KEY[label]!;
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
      color: INK_ACCENT_DIM,
    } satisfies Partial<CSSStyleDeclaration>);
    const labelEl = document.createElement('span');
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    const fmt = opts.format ?? ((v: number) => v.toFixed(2));
    valueEl.textContent = fmt(opts.value);
    valueEl.style.color = INK_ACCENT;
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
      accentColor: cw.sliderAccent,
      cursor: 'pointer',
    } satisfies Partial<CSSStyleDeclaration>);
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      currentControls[key] = v;
      valueEl.textContent = fmt(v);
      opts.apply(v);
    });
    row.appendChild(head);
    row.appendChild(input);
    panel.appendChild(row);

    controlRegistry.set(key, {
      meta: { key, label, min: opts.min, max: opts.max, step: opts.step, default: opts.value, format: fmt },
      apply: opts.apply,
      setUI: (v) => { input.value = String(v); valueEl.textContent = fmt(v); },
    });
    currentControls[key] = opts.value;
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
      // Don't write perlinStrength here — the per-frame loop writes
      // `ambient + burstSum` every tick and would clobber any direct
      // write within one frame anyway.
      state.ambientPerlinStrength = v;
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
    color: INK_ACCENT_DIM,
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

  // ─── Host-facing control surface ─────────────────────────────────────
  // Built from the registry the knobs populated above. A host menu reads
  // `controlsMeta` to render its own UI, then drives the animation through
  // `setControl`. Values are clamped to each control's declared range.
  const controlsMeta: readonly SixInkControlMeta[] = [...controlRegistry.values()].map(
    (e) => e.meta,
  );
  const setControl = (key: SixInkControlKey, value: number): void => {
    const entry = controlRegistry.get(key);
    if (!entry) return;
    const v = Math.min(entry.meta.max, Math.max(entry.meta.min, value));
    currentControls[key] = v;
    entry.apply(v);   // safe before world/renderer exist (applies guard internally)
    entry.setUI(v);   // keeps the built-in panel in sync if it's shown
  };
  const getControl = (key: SixInkControlKey): number => currentControls[key];
  const getControls = (): Record<SixInkControlKey, number> => ({ ...currentControls });

  // Viewport dims read from the host element — `position: fixed; inset: 0`
  // makes host.clientWidth/Height equal the visual viewport without
  // counting scrollbars or browser-chrome quirks. window.innerWidth
  // sometimes drifts on ultrawide / portrait layouts (especially with
  // a vertical scrollbar present on the body), which left the scene
  // anchored off-center. (DPR hoisted up earlier so the corner-stack
  // mini particle canvases can use it at construction.)
  // Read the host's own box, not the window — so a 'container' embed sizes to
  // its wrapper rather than the whole screen. Falls back to the viewport while
  // the host has no laid-out size yet (pre-attach).
  const hostSize = (): { w: number; h: number } => ({
    w: host.clientWidth || window.innerWidth,
    h: host.clientHeight || window.innerHeight,
  });
  let { w: W, h: H } = hostSize();
  let cursorCenteredOnce = false;
  const applySize = (): void => {
    ({ w: W, h: H } = hostSize());
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

  // ─── Local perlin burst registry ──────────────────────────────────────
  // Replaces the legacy WorldGPU.applyPerlinGlitch shim. Each entry is
  // a smoothstep envelope on `perlinStrength` over `durationS` seconds,
  // peaking at `amp`. Multiple bursts SUM their envelopes (free upgrade
  // over the engine shim's last-write-wins). Per-frame we compute the
  // total burst contribution and add it to the ambient strength via
  // world.setForceConstants — the perlin force kernel reads the result
  // on every tick.
  type Burst = { startT: number; durationS: number; amp: number };
  const activeBursts: Burst[] = [];
  // Wall-clock seconds reference — captured once per frame inside the
  // rAF loop and used for envelope math. Keeping it local to a tick
  // means burst expirations happen at predictable frame boundaries.
  const triggerBurst = (amp: number, durationMs: number, delayMs = 0): void => {
    const fire = (): void => {
      if (disposed) return;
      activeBursts.push({
        startT: performance.now() / 1000,
        durationS: Math.max(0, durationMs / 1000),
        amp,
      });
    };
    if (delayMs <= 0) fire();
    else setTimeout(fire, delayMs);
  };

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

  // ─── Drag-modes system (T cycles, drag activates) ─────────────────────
  // Hold the pointer down anywhere → continuous force at cursor for the
  // current mode. T cycles modes. Release → forces stop, world goes back
  // to springs + drag + perlin.
  type DragMode = 'kick' | 'attract' | 'swirl' | 'gravity';
  const DRAG_MODES: readonly DragMode[] = ['kick', 'attract', 'swirl', 'gravity'] as const;
  let dragMode: DragMode = 'kick';
  let dragging = false;


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
    // Initial kick on press for the same-as-before "click feels punchy"
    // sensation. The per-frame loop then keeps applying the current
    // dragMode's force while the pointer is held.
    dragging = true;
    canvas.setPointerCapture?.(e.pointerId);
    applyDragForce(dragMode, 1 / 60); // first-frame impulse
    if (state.glitchEnabled && Math.random() < state.clickPerlinChance) {
      triggerBurst(240 * state.glitchAmpScale, 220 * state.glitchDurationScale);
    }
    if (!firstClickHappened) {
      firstClickHappened = true;
      hint.style.opacity = '0';
    }
  };
  const onPointerUp = (e: PointerEvent): void => {
    dragging = false;
    canvas.releasePointerCapture?.(e.pointerId);
  };
  // Apply the current dragMode's force at the cursor for one frame.
  // Called from the per-frame tick while `dragging` is true. dt is in
  // seconds — used to scale per-frame contribution so behavior is
  // framerate-independent.
  const applyDragForce = (mode: DragMode, dt: number): void => {
    if (!world || world.backend !== 'gpu') return;
    const w = world as WorldGPU;
    const x = cursor.x;
    const y = cursor.y;
    switch (mode) {
      case 'kick': {
        // Continuous radial impulse outward from cursor. Gentler than a
        // single click-kick because it accumulates per frame.
        w.applyRadialImpulse({
          origin: { x, y },
          kick: state.scatterKick * dpr * dt * 16,
          softness: SHOWCASE.scatterSoftness,
        });
        break;
      }
      case 'attract': {
        // Negative kick → particles pulled TOWARD cursor.
        w.applyRadialImpulse({
          origin: { x, y },
          kick: -state.scatterKick * dpr * dt * 11,
          softness: SHOWCASE.scatterSoftness,
        });
        break;
      }
      case 'swirl': {
        // Origin offset perpendicular to (particle - cursor) direction
        // is impossible without per-particle math; we approximate
        // by alternating radial and tangential through phase. Cheap
        // proxy: combine a mild attractor with an orbital "kick" from
        // an offset point. The visual reads as swirl around cursor.
        const phase = (performance.now() / 240) % (Math.PI * 2);
        const r = state.scatterKick * dpr * dt * 9;
        w.applyRadialImpulse({
          origin: {
            x: x + Math.cos(phase) * 80 * dpr,
            y: y + Math.sin(phase) * 80 * dpr,
          },
          kick: r,
          softness: SHOWCASE.scatterSoftness * 1.5,
        });
        break;
      }
      case 'gravity': {
        // Origin far above the canvas → particles pushed away from it
        // = downward. softness very low → ~uniform magnitude across
        // the visible area. Cursor x is the gravity-well x so dragging
        // left/right shifts where things rain down.
        w.applyRadialImpulse({
          origin: { x, y: -10000 * dpr },
          kick: state.scatterKick * dpr * dt * 0.8,
          softness: 0.0001,
        });
        break;
      }
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
      // Embed-safe: when exitTo is null the host owns navigation, so Esc
      // does nothing here.
      if (exitTo == null) return;
      window.history.pushState({}, '', exitTo);
      window.dispatchEvent(new PopStateEvent('popstate'));
    } else if (e.key === 'm' || e.key === 'M') {
      // Don't fire if a slider has focus — preserves text-input UX
      // even though we don't currently have any. Cheap insurance.
      if (e.target instanceof HTMLInputElement) return;
      togglePanel();
    } else if (e.key === 'f' || e.key === 'F') {
      if (e.target instanceof HTMLInputElement) return;
      toggleFullscreen();
    } else if (e.key === 't' || e.key === 'T') {
      if (e.target instanceof HTMLInputElement) return;
      // Cycle drag modes: kick → attract → swirl → gravity → kick.
      const i = DRAG_MODES.indexOf(dragMode);
      dragMode = DRAG_MODES[(i + 1) % DRAG_MODES.length];
      // Surface the new mode briefly via the hint line so users get
      // feedback without needing the panel open.
      hint.textContent = `drag mode: ${dragMode.toUpperCase()} · t to cycle`;
      hint.style.opacity = '1';
      // Fade the hint back out after a moment.
      window.clearTimeout(hintFadeTimer);
      hintFadeTimer = window.setTimeout(() => {
        hint.style.opacity = '0';
      }, 1400);
    }
  };
  let hintFadeTimer = 0;
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  if (keyboardEnabled) window.addEventListener('keydown', onKeyDown);
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
      options.onFallback?.('webgpu-unavailable');
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
        // Surface color for the active colorway: the WebGPU renderer clears +
        // trail-paints to this each frame (opaque mode). Source-over particle
        // blend then composites over it — dark particles darken white (ink),
        // light particles brighten black (chalk). See
        // docs/rendering-blend-modes.md.
        background: cw.rendererBg,
        onFallback: (e) => console.warn('[six-showcase-ink] renderer:', e.message),
      }),
      loadGlb(
        options.logoUrl ??
          // Lazy default — kept out of the eager bundle so consumers that pass
          // their own logoUrl never download the 882 KB asset.
          (await import('../assets/6ixLogo.glb?url')).default,
      ),
    ]);
    if (disposed) return;

    world = await createWorld({
      width: canvas.width,
      height: canvas.height,
      backend: 'gpu',
      capacity: PARTICLE_CAP,
      seed: 42,
      onFallback: (e) => console.warn('[six-showcase-ink] world:', e.message),
    });
    if (disposed) return;
    if (world.backend !== 'gpu') {
      status.textContent = 'GPU WORLD UNAVAILABLE';
      options.onFallback?.('gpu-world-unavailable');
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
      // Extrude along Z so it carries the same 3D body as the heart / logo
      // instead of looking like a flat wafer when it rotates.
      depth: 0.2,
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
        color: sampleColor(rng, cw) as unknown as number,
      };
    }
    (world as WorldGPU).setParticles(ps);
    (world as WorldGPU).setAnchors3D(clouds.peace);
    (world as WorldGPU).setForces(['drag', 'spring', 'perlin'], {
      drag: restFeel.drag,
      springK: restFeel.springK,
      springC: restFeel.springC,
      // Perlin force in the stack; seeded from the ambient state defaults
      // so the showcase opens with breathing-cloud feel. Bursts in the
      // per-frame loop sum on top of `ambientPerlinStrength`. Knob drags
      // overwrite via writePerlin().
      perlinFrequency: 1 / state.ambientPerlinScale,
      perlinSpeed: state.ambientPerlinSpeed,
      perlinStrength: state.ambientPerlinStrength,
      perlinOctaves: state.ambientPerlinOctaves,
    });
    activeFeel = restFeel;
    feelLerpFrom = restFeel;

    // Apply host-supplied control overrides now that world + renderer exist
    // (perlin / particle-size / trail-alpha applies need them live).
    if (options.controls) {
      for (const k of Object.keys(options.controls) as SixInkControlKey[]) {
        const v = options.controls[k];
        if (typeof v === 'number') setControl(k, v);
      }
    }

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
  // 3-beat chained glitch. Each beat is a smoothstep envelope on
  // perlinStrength via the local burst registry; multiple beats sum
  // naturally, so overlapping envelopes blend rather than clobber.
  // The legacy API also varied frequency / octaves per-beat — we drop
  // that since the new perlin force has one global frequency. The
  // amplitude + duration variation per beat carries the rhythmic feel.
  const triggerGlitch = (): void => {
    if (!world || world.backend !== 'gpu') return;
    if (!state.glitchEnabled) return;
    const ampS = state.glitchAmpScale;
    const durS = state.glitchDurationScale;
    // Beat 1 — fast, tight, low-amp.
    triggerBurst((320 + Math.random() * 200) * ampS, 120 * durS, 0);
    // Beat 2 — wider, larger amp, mid-burst overlap.
    triggerBurst((480 + Math.random() * 320) * ampS, 180 * durS, 130);
    // Beat 3 — fine chaos, fast decay.
    triggerBurst((220 + Math.random() * 160) * ampS, 100 * durS, 320);
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
    // (jittery on a 50 px canvas). Skipped entirely when the corner stack
    // is hidden so we don't pay the per-frame canvas draw.
    if (chrome.cornerStack) drawIcons(rotX, rotY);

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

    // Process active perlin bursts. Each burst contributes a smoothstep
    // envelope on perlinStrength, summed and added to the panel's ambient
    // strength. Expired bursts get spliced out. Net write of perlinStrength
    // happens once per frame.
    const ambient = state.ambientPerlinStrength;
    let burstSum = 0;
    if (activeBursts.length > 0) {
      const nowS = now / 1000;
      for (let i = activeBursts.length - 1; i >= 0; i--) {
        const b = activeBursts[i];
        const elapsed = nowS - b.startT;
        if (elapsed >= b.durationS) {
          activeBursts.splice(i, 1);
          continue;
        }
        const halfD = Math.max(1e-6, b.durationS * 0.5);
        const dist = Math.abs(elapsed - halfD) / halfD;
        const tri = 1 - dist;
        const env = tri * tri * (3 - 2 * tri);
        burstSum += env * b.amp;
      }
    }
    if (burstSum > 0 || ambient > 0 || activeBursts.length > 0) {
      w.setForceConstants({ perlinStrength: ambient + burstSum });
    }

    // While dragging, fire the current drag-mode force at the cursor
    // every frame. Particles get a continuous push/pull/swirl/fall.
    // Releasing the pointer flips `dragging` off and the world goes
    // back to spring + drag + perlin baseline.
    if (dragging) applyDragForce(dragMode, dt);

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

  // The handle IS the teardown function (so the router's `cleanup()` and the
  // ExperimentMount contract still work), augmented with the live control
  // surface for host menus.
  const dispose = (): void => {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    if (glitchInterval) clearTimeout(glitchInterval);
    if (clockInterval) clearInterval(clockInterval);
    if (isFullscreen()) void document.exitFullscreen().catch(() => {});
    document.removeEventListener('fullscreenchange', onFullscreenChange);
    ro.disconnect();
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointercancel', onPointerUp);
    window.removeEventListener('keydown', onKeyDown);
    window.removeEventListener('resize', onResize);
    window.clearTimeout(hintFadeTimer);
    if (world && world.backend === 'gpu') {
      (world as WorldGPU).destroy();
    }
    host.remove();
  };

  const handle = dispose as SixInkHandle;
  handle.dispose = dispose;
  handle.controls = controlsMeta;
  handle.getControl = getControl;
  handle.getControls = getControls;
  handle.setControl = setControl;
  handle.disturb = disturbAll;
  return handle;
};
