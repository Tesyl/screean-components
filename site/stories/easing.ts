// Easing story group — interpolation curves available from
// `screean`'s `easing` namespace. Each tile draws ONE curve as a
// particle-rendered line plot (x = t in [0, 1], y = easing(t)). The
// shape of the cloud IS the curve's shape.
//
// Implementation: rasterize the curve to a small bitmap via OffscreenCanvas,
// feed that bitmap to `bitmapField`, bind particles. Same pattern fields/
// stories use for arbitrary 2D shapes; we just stroke a path instead of
// filling a polygon.

import {
  bitmapField,
  type BitmapSource,
  type Easing,
  easing,
  node,
  packRGBA,
} from 'screean';
import type { ThemeId } from '../themes';
import { type TileGroup, tileStage } from './types';

// Tracer color — bright white at full alpha so it pops above the
// theme-tinted bound cloud. The static curve plot is a quiet reference;
// the tracer is the protagonist.
const TRACER_COLOR = packRGBA(240, 240, 255, 255);
// How many particles get reassigned as tracers each frame. Pulled from
// the tail of the particle array; the rest stay bound to the static
// curve plot. ~12 reads as a soft-edged moving dot, not a single sharp
// pixel — the spring-lag gives it a small comet trail at fast sections.
const TRACER_COUNT = 14;
// Active sweep + brief end-pause. The pause holds the tracer at t=1
// before resetting so the reader can register where the curve landed —
// especially important for overshoot families (back, elastic) where the
// final value is on the target line, not at the curve's peak.
const SWEEP_MS = 1500;
const PAUSE_MS = 350;
const TOTAL_MS = SWEEP_MS + PAUSE_MS;

// Padding (vertical) so overshoot curves (back, elastic) stay in-bounds
// when their output exits [0, 1] mid-curve. 18% of canvas height handles
// outBack's ~10% overshoot and outElastic's ~30% overshoot comfortably.
const VERTICAL_PAD_FRAC = 0.18;
// Horizontal padding so the line endpoints don't sit flush against the edges.
const HORIZONTAL_PAD_FRAC = 0.06;
// Stroke width as fraction of canvas height. 2.5% reads well at typical
// tile sizes (~200x150) without becoming a thick blob at small scales.
const STROKE_FRAC = 0.025;
// Number of curve samples between t=0 and t=1. 200 gives smooth curves
// even for elastic / bounce families which have rapid local oscillation.
const SAMPLES = 200;

// Rasterize an easing curve into an RGBA bitmap. Stroked path = white,
// background = transparent. The `bitmapField` `alphaThreshold: 32` filter
// then picks up exactly the pixels along the line, ignoring the empty
// space — the resulting field's particles trace the curve.
const buildCurveBitmap = (fn: Easing, w: number, h: number): BitmapSource => {
  const cv = new OffscreenCanvas(w, h);
  const ctx = cv.getContext('2d');
  if (!ctx) throw new Error('easing tile: 2d context unavailable');
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = Math.max(2, h * STROKE_FRAC);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = 'white';

  const padY = h * VERTICAL_PAD_FRAC;
  const padX = w * HORIZONTAL_PAD_FRAC;
  const innerH = h - padY * 2;
  const innerW = w - padX * 2;
  ctx.beginPath();
  for (let i = 0; i <= SAMPLES; i++) {
    const t = i / SAMPLES;
    const x = padX + t * innerW;
    // Canvas Y is top-down; easing(t) = 0 should sit at the bottom, =1 at
    // the top. So we subtract from h and account for padding.
    const y = h - padY - fn(t) * innerH;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.stroke();

  return {
    data: ctx.getImageData(0, 0, w, h).data,
    width: w,
    height: h,
  };
};

// Build one tile around a single curve. Particles bind to the rasterized
// line — the cloud's silhouette IS the curve's shape.
const tileFor = (
  themeId: ThemeId,
  name: string,
  blurb: string,
  code: string,
  fn: Easing,
) => ({
  name,
  blurb,
  code,
  mount: (canvas: HTMLCanvasElement, w: number, h: number) => {
    const stage = tileStage(canvas, w, h, themeId, {
      feel: 'crisp',
      feelOverrides: {
        // Tight spring + light shimmer keeps the static curve plot
        // readable AND lets the tracer's trail show a faint comet behind
        // it during fast sweeps.
        springK: 80,
        springC: 14,
        shimmerAmp: 1.5,
      },
      particleCount: 1400,
      particleSize: 1.0,
      // Spawn from the edges so click-to-respawn has a satisfying "fly in
      // and re-form" gesture.
      spawnFrom: 'edge',
    });
    const build = () =>
      node(
        bitmapField({
          source: buildCurveBitmap(fn, w, h),
          origin: { x: 0, y: 0 },
          scale: { x: 1, y: 1 },
          alphaThreshold: 32,
        }),
      );
    stage.setScene(build, { autoPan: false });

    // Geometry constants — match buildCurveBitmap so the tracer rides
    // the same line the bitmap drew.
    const padY = h * VERTICAL_PAD_FRAC;
    const padX = w * HORIZONTAL_PAD_FRAC;
    const innerH = h - padY * 2;
    const innerW = w - padX * 2;

    // Tracer cycle. Per-frame we reassign the last N particles' targets
    // to the (t, easing(t)) point on the curve. The spring chases the
    // moving target; lag at fast sections produces a visible comet that
    // makes outQuint feel different from outCubic even though their
    // shapes look similar in plot.
    let cycleStart = performance.now();
    let lastT = 0;
    let raf = 0;
    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const elapsed = (now - cycleStart) % TOTAL_MS;
      // During the pause window we hold at t=1 so the reader sees where
      // the curve actually landed — important for overshoot families
      // whose mid-curve value can be far from the final value.
      const t = elapsed < SWEEP_MS ? elapsed / SWEEP_MS : 1;
      const x = padX + t * innerW;
      const y = h - padY - fn(t) * innerH;
      const wrapped = t < lastT;
      lastT = t;
      const particles = stage.world.particles;
      const startIdx = Math.max(0, particles.length - TRACER_COUNT);
      for (let i = startIdx; i < particles.length; i++) {
        const p = particles[i];
        p.tx = x;
        p.ty = y;
        if (wrapped) {
          // Cycle just looped back to t=0 — snap the tracer particles to
          // the new start so they teleport instead of springing across
          // the canvas. Otherwise you'd see a fast diagonal "reset" line
          // that overpowers the actual easing visualization.
          p.x = x;
          p.y = y;
          p.vx = 0;
          p.vy = 0;
        }
        // Override color so the tracer pops above the cloud's theme tint.
        p.color = TRACER_COLOR;
      }
    };
    raf = requestAnimationFrame(tick);

    // Click: drop the live cloud, respawn from edges, re-bind to the
    // curve, and reset the tracer cycle so the next sweep starts cleanly.
    const onClick = (): void => {
      cycleStart = performance.now();
      lastT = 0;
      stage.world.particles.length = 0;
      stage.setScene(build, { autoPan: false });
    };
    canvas.addEventListener('click', onClick);
    canvas.style.cursor = 'pointer';

    return {
      stage,
      dispose: () => {
        if (raf) cancelAnimationFrame(raf);
        canvas.removeEventListener('click', onClick);
        canvas.style.cursor = '';
      },
    };
  },
});

// Curated set: the most informative curve from each family, plus the
// overshooting families in full (in/out/inOut) so the difference between
// "wind-up", "overshoot", and "wind-up-then-overshoot" is visible. ~12
// tiles total — manageable density for one storybook section.
export const easingGroup = (themeId: ThemeId): TileGroup => ({
  title: 'Easing',
  blurb: "Interpolation curves from screean's easing namespace. Particles trace the curve shape — t along x, easing(t) along y. Used by dissolveAndReform's return-to-target phase and any consumer that wants a non-linear flow between states.",
  tiles: [
    tileFor(themeId, 'linear', 'Constant rate. Reference baseline.', 'easing.linear', easing.linear),
    tileFor(themeId, 'smoothstep', 'Hermite S-curve. Symmetric ease-in-out, no overshoot.', 'easing.smoothstep', easing.smoothstep),
    tileFor(themeId, 'outCubic', 'Default for dissolveAndReform. Fast start, soft landing.', 'easing.outCubic', easing.outCubic),
    tileFor(themeId, 'outQuint', 'Steeper outCubic. Almost instant arrival at the target.', 'easing.outQuint', easing.outQuint),
    tileFor(themeId, 'outExpo', 'Exponential decay. Sharpest "snap to rest" feel.', 'easing.outExpo', easing.outExpo),
    tileFor(themeId, 'inOutCubic', 'Symmetric ease. Slow start, slow finish.', 'easing.inOutCubic', easing.inOutCubic),

    tileFor(themeId, 'outBack', 'Overshoot then settle. Punchy, springy arrival.', 'easing.outBack', easing.outBack),
    tileFor(themeId, 'inBack', 'Wind-up before launch. Coil + release feel.', 'easing.inBack', easing.inBack),
    tileFor(themeId, 'inOutBack', 'Wind-up then overshoot. Drama on both ends.', 'easing.inOutBack', easing.inOutBack),

    tileFor(themeId, 'outElastic', 'Damped spring oscillation. Jelly settle.', 'easing.outElastic', easing.outElastic),
    tileFor(themeId, 'outBounce', 'Multiple decaying bounces, ground-locked.', 'easing.outBounce', easing.outBounce),
    tileFor(themeId, 'inOutElastic', 'Both ends ring. Reads as nervous energy.', 'easing.inOutElastic', easing.inOutElastic),
  ],
});
