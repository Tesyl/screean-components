// visual-fallaway — visual vs physical depth, side-by-side, on Pattern A.
//
// Two REAL DOM buttons. Click the LEFT one → `popTo3D` (PHYSICAL: per-
// particle tz + z-spring physics, real depth). Click the RIGHT one →
// `visual.fallAway` (VISUAL: scale toward centroid + alpha fade, pure 2D
// math). Both produce a "depth" feel; only one actually moves particles
// in z.
//
// Migration note (audit §4 Step 3): the comparison used to run on Pattern B
// — a `button()` SDF factory bound to a persistent particle pool via
// `scene.bindAll`. Now each button is a real element: clicking rasterizes
// it as painted (`bitmapFieldFromElement`, Pattern-A BitmapField), spawns a
// particle stand-in directly ON the silhouette, hides the DOM, runs the
// SAME choreography recipe over the cloud, then restores the DOM when the
// motion settles. The choreography subsystem is deliberately retained —
// the recipes are what this experiment compares; only the field source
// changed (SDF scene → rasterized real DOM).
//
// What this demo proves:
//   1. The visual axis is real — no z, same perceptual outcome for
//      dismissal-style choreography.
//   2. Physical's cost (per-particle z storage, integrator z-pass) buys
//      *interactivity in 3D*, not aesthetic depth.
//   3. Choreography recipes are field-agnostic: they operate on particles,
//      so a Pattern-A rasterized silhouette feeds them exactly like a
//      Pattern-B SDF binding did.
//
// See docs/RFC-effect-language.md for the visual-vs-physical framing.

import {
  Canvas2DRenderer,
  World,
  bitmapFieldFromElement,
  drag,
  spawn,
  spring,
  node,
  scene,
  TRANSPARENT,
  type BitmapField,
} from '@tesyl/screean';
import { renderNav, renderFooter } from '../layout';
// Site code consumes components through the package barrel, same as any
// external consumer would.
import {
  createChoreoRunner,
  groupAll,
  pipe,
  popTo3D,
  visual,
  wait,
  pickFromPalette,
  resolveParticlePalette,
  applyStyles,
  DEFAULT_ALPHA_THRESHOLD,
} from '../../src/components';

const PANEL_W = 480;
const PANEL_H = 320;
const PARTICLE_COUNT = 800;

// Recipe timing — same numbers as the Pattern-B version so the comparison
// is unchanged: both sides do "recede, hold, return", repeatable.
const FALL_MS = 380;
const HOLD_MS = 220;
const RISE_MS = 380;
const POP_TZ = -8;
const POP_HOLD_MS = 380;
const FALL_SCALE_TO = 0.3;

// Post-pipeline settle before the real DOM swaps back in. The physical
// side's pipeline ENDS at the instant setTz(0) write — the z-spring
// (k=80, c=18) then needs real time to carry particles back to the screen
// plane. The visual side's riseUp lands particles at the silhouette on its
// final eased frame; it only needs a beat.
const SETTLE_MS = { physical: 700, visual: 160 } as const;

// DOM fade-back window when the particle stand-in hands off to the element.
const DOM_RESTORE_FADE_MS = 160;

type Side = keyof typeof SETTLE_MS;

const SIDE_ACCENT: Record<Side, string> = {
  physical: '#8cc8ff', // electric blue — matches the old packRGBA(140,200,255)
  visual: '#ffa0dc', // pink — matches the old packRGBA(255,160,220)
};

// Inline, foreignObject-safe button skin (no classes, no url(), system mono
// only) — the element is the rasterize source, so what you see is what the
// cloud samples.
const buttonSkinFor = (side: Side): Partial<CSSStyleDeclaration> => ({
  width: '180px',
  height: '56px',
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  font: '700 16px ui-monospace, "SF Mono", Menlo, monospace',
  letterSpacing: '0.08em',
  color: '#0c0d10',
  background: SIDE_ACCENT[side],
  border: 'none',
  borderRadius: '8px',
  cursor: 'pointer',
  outlineOffset: '3px',
  position: 'relative',
  zIndex: '1',
});

const buildSide = (
  wrap: HTMLDivElement,
  side: Side,
  fpsEl: HTMLElement,
): (() => void) => {
  // ── The real DOM button — single source of truth ──────────────────────────
  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = side === 'physical' ? 'POP TO 3D' : 'FALL AWAY';
  applyStyles(btn, buttonSkinFor(side));
  // Single-color cloud per side (the old per-side packRGBA look):
  // resolveParticlePalette reads this off the element's computed cascade.
  btn.style.setProperty('--screean-particle', SIDE_ACCENT[side]);

  const canvas = document.createElement('canvas');
  canvas.setAttribute('aria-hidden', 'true');
  applyStyles(canvas, { position: 'absolute', inset: '0' });
  wrap.append(canvas, btn);

  // ── CPU world — both sides identical so the comparison is purely about
  //    choreography flavor, not backend differences. z-spring on so the
  //    physical popTo3D side has the integrator pass; the visual side never
  //    writes tz, so it costs nothing there. ─────────────────────────────────
  const world = new World({
    width: PANEL_W,
    height: PANEL_H,
    hashCellSize: 24,
    zSpring: { k: 80, c: 18 },
  });
  // Spring + drag hold the silhouette in x/y during holds and pull the
  // cloud back after spatial effects let go.
  world.setForces([drag(0.5), spring(60, 6)]);

  const renderer = new Canvas2DRenderer({
    canvas,
    particleSize: 2.6,
    // Heavier trail-alpha (0.55) so faded particles aren't masked by the
    // previous frame's still-bright pixels. Without this, a fade-to-zero
    // alpha effect can be invisible because the trail keeps painting over
    // the dimmed particles. 0.55 = trails clear quickly, fade reads true.
    trailAlpha: 0.55,
    portalMode: false,
  });
  renderer.resize(PANEL_W, PANEL_H);

  // The runner needs a Scene dep for component-bound groups; this experiment
  // selects via groupAll (the whole pool IS the silhouette), so an empty
  // placeholder satisfies the contract without a scene graph.
  const runner = createChoreoRunner({
    scene: scene({ particleCount: 0 }, node(null)),
    world,
    particles: world.particles,
    mirrorHost: document.createElement('div'),
  });

  // ── Recipes — UNCHANGED from the Pattern-B version. ───────────────────────
  // Physical: setTz(−8) → wait → setTz(0); the z-spring integrator owns the
  // in-between motion. Visual: fallAway → wait → riseUp, explicitly composed
  // so each click shows the full cycle (fallAway alone is a one-way
  // dismissal).
  const recipeFor = (s: Side) =>
    s === 'physical'
      ? pipe(popTo3D({ tz: POP_TZ, holdMs: POP_HOLD_MS }))
      : pipe(
          // Dramatic dip so the visual axis reads unmistakably: 30% scale
          // (compressed almost to a dot) and alpha 0 (fully transparent at
          // the bottom of the dip). riseUp restores in 380ms.
          visual.fallAway({ duration: FALL_MS, scaleTo: FALL_SCALE_TO, alphaTo: 0 }),
          wait(HOLD_MS),
          visual.riseUp({ duration: RISE_MS, alphaFrom: 0, scaleFrom: FALL_SCALE_TO }),
        );

  // ── Click → rasterize → particle stand-in → recipe → restore ─────────────
  type Cycle = { handle: { done: () => boolean }; doneAt: number };
  let cycle: Cycle | null = null;
  let busy = false;

  const hideButton = (): void => {
    btn.style.transition = 'none';
    btn.style.opacity = '0';
    btn.style.pointerEvents = 'none';
  };
  const restoreButton = (): void => {
    btn.style.transition = `opacity ${DOM_RESTORE_FADE_MS}ms ease`;
    btn.style.opacity = '1';
    btn.style.pointerEvents = '';
  };

  const fireEffect = async (): Promise<void> => {
    if (busy) return;
    busy = true;

    // Pattern A: the field IS the painted element. Origin maps the
    // viewport rect into canvas-local coordinates so sample targets land
    // in world space.
    if (document.fonts && 'ready' in document.fonts) await document.fonts.ready;
    const btnRect = btn.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    let field: BitmapField;
    try {
      ({ field } = await bitmapFieldFromElement({
        element: btn,
        strategy: 'foreignObject',
        alphaThreshold: DEFAULT_ALPHA_THRESHOLD,
        origin: {
          x: btnRect.left - canvasRect.left,
          y: btnRect.top - canvasRect.top,
        },
      }));
    } catch (err) {
      console.error('[visual-fallaway] rasterize failed:', err);
      busy = false;
      return;
    }

    // Spawn the stand-in directly ON the silhouette (position = target), so
    // there's no convergence flight — the swap DOM → particles is seamless
    // and the recipe is the only motion on screen.
    const palette = resolveParticlePalette(btn);
    world.particles.length = 0;
    world.addParticles(
      spawn({
        n: PARTICLE_COUNT,
        origin: { kind: 'point', x: PANEL_W / 2, y: PANEL_H / 2 },
        color: TRANSPARENT,
        speed: 0,
      }),
    );
    const targets = field.sample(world.particles.length);
    for (let i = 0; i < world.particles.length; i++) {
      const p = world.particles[i];
      const [tx, ty] = targets[i] ?? [PANEL_W / 2, PANEL_H / 2];
      p.x = tx;
      p.y = ty;
      p.tx = tx;
      p.ty = ty;
      p.vx = 0;
      p.vy = 0;
      p.color = pickFromPalette(palette);
    }

    hideButton();
    const handle = runner.run(recipeFor(side), groupAll());
    cycle = { handle, doneAt: 0 };
  };

  const onClick = (): void => void fireEffect();
  btn.addEventListener('click', onClick);

  // ── Frame loop — independent rAF per side so the panels stay symmetric. ──
  let raf = 0;
  let last = performance.now();
  let fpsAcc = 0;
  let fpsCount = 0;
  const tick = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    runner.tick(now);
    world.tick(dt);
    renderer.draw(world.particles, PANEL_W, PANEL_H);

    // Restore the real DOM once the recipe finished AND the physics settled
    // (the physical side's z-spring return outlives its pipeline).
    if (cycle && cycle.handle.done()) {
      if (cycle.doneAt === 0) cycle.doneAt = now;
      if (now - cycle.doneAt >= SETTLE_MS[side]) {
        restoreButton();
        world.particles.length = 0;
        cycle = null;
        busy = false;
      }
    }

    fpsAcc += dt;
    fpsCount++;
    if (fpsAcc > 0.5) {
      fpsEl.textContent = `${(fpsCount / fpsAcc).toFixed(0)} fps · n=${PARTICLE_COUNT}`;
      fpsAcc = 0;
      fpsCount = 0;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    if (raf) cancelAnimationFrame(raf);
    btn.removeEventListener('click', onClick);
    runner.dispose();
    world.particles.length = 0;
  };
};

export const mount = (root: HTMLElement): (() => void) => {
  root.innerHTML = '';
  root.appendChild(renderNav({ current: '/experiments' }));

  const head = document.createElement('section');
  head.className = 'doc-head';
  head.innerHTML = `
    <span class="doc-eyebrow">EXPERIMENT · VISUAL ↔ PHYSICAL</span>
    <h1>visual.fallAway · the depth axis split</h1>
    <p>Two real DOM buttons, two ways to express the same gesture. Click either — the element rasterizes as painted (<code>bitmapFieldFromElement</code>), a particle stand-in takes its place on the exact silhouette, the recipe plays, and the element returns. Left routes through the simulation pipeline (<code>popTo3D</code> writes per-particle <code>tz</code>; the z-spring integrator owns the in-between motion). Right is pure 2D animation (<code>visual.fallAway</code> + wait + <code>visual.riseUp</code> — scale toward centroid + alpha fade). Both produce a sense of depth on screen; the cost and composability differ. The visual version runs on every backend including future visionOS without a z field on the GPU particle struct.</p>
  `;
  root.appendChild(head);

  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.innerHTML = `
    <div class="experiment-canvas-wrap surface-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 14px;">
      <figure style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
        <figcaption style="font-size: 11px; letter-spacing: 0.10em; opacity: 0.75;">PHYSICAL · popTo3D · per-particle tz</figcaption>
        <div data-side="physical" style="position: relative; width: ${PANEL_W}px; max-width: 100%; height: ${PANEL_H}px; display: flex; align-items: center; justify-content: center; background: #0c0d10; border-radius: 6px; overflow: hidden;"></div>
        <code data-fps="physical" style="font-size: 11px; opacity: 0.7;">…</code>
      </figure>
      <figure style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
        <figcaption style="font-size: 11px; letter-spacing: 0.10em; opacity: 0.75;">VISUAL · fallAway → wait → riseUp · 2D only</figcaption>
        <div data-side="visual" style="position: relative; width: ${PANEL_W}px; max-width: 100%; height: ${PANEL_H}px; display: flex; align-items: center; justify-content: center; background: #0c0d10; border-radius: 6px; overflow: hidden;"></div>
        <code data-fps="visual" style="font-size: 11px; opacity: 0.7;">…</code>
      </figure>
    </div>
  `;
  root.appendChild(stage);
  root.appendChild(renderFooter());

  const physicalWrap = stage.querySelector<HTMLDivElement>('[data-side="physical"]')!;
  const visualWrap = stage.querySelector<HTMLDivElement>('[data-side="visual"]')!;
  const physicalFps = stage.querySelector<HTMLElement>('[data-fps="physical"]')!;
  const visualFps = stage.querySelector<HTMLElement>('[data-fps="visual"]')!;

  const teardownPhysical = buildSide(physicalWrap, 'physical', physicalFps);
  const teardownVisual = buildSide(visualWrap, 'visual', visualFps);

  return () => {
    teardownPhysical();
    teardownVisual();
  };
};
