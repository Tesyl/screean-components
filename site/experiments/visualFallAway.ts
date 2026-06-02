/// <reference types="vite/client" />
// visual-fallaway — visual vs physical depth, side-by-side.
//
// Two identical buttons. Click the LEFT one → `popTo3D` (PHYSICAL: per-
// particle tz + z-spring physics, real depth). Click the RIGHT one →
// `visual.fallAway` (VISUAL: scale toward centroid + alpha fade, pure
// 2D math). Both produce a "depth" feel; only one actually moves
// particles in z.
//
// What this demo proves:
//   1. The visual axis is real — no z, same perceptual outcome for
//      dismissal-style choreography.
//   2. Physical's cost (per-particle z storage, integrator z-pass) buys
//      *interactivity in 3D*, not aesthetic depth.
//   3. On a backend without z (GPU world), only the visual side runs.
//      That's not a bug — it's the architectural distinction surfaced.
//
// See docs/RFC-effect-language.md for the framing.

import {
  scene,
  spawn,
  packRGBA,
  Canvas2DRenderer,
  World,
  spring,
  drag,
} from '@tesyl/screean';
import { renderNav, renderFooter } from '../layout';
import { button } from '../../src/components/factories/button';
import { createChoreoRunner } from '../../src/components/choreography/runner';
import { groupOfComponent } from '../../src/components/choreography/group';
import { pipe } from '../../src/components/choreography/pipeline';
import { popTo3D } from '../../src/components/choreography/effects/popTo3D';
import { visual } from '../../src/components/choreography/effects/visual';
import { wait } from '../../src/components/choreography/effects/wait';

const W = 480;
const H = 320;

type Side = 'physical' | 'visual';

const buildSide = (
  canvas: HTMLCanvasElement,
  side: Side,
  fpsEl: HTMLElement,
): (() => void) => {
  // Components: a label + a button stacked centered on the canvas.
  const btn = button({
    label: side === 'physical' ? 'POP TO 3D' : 'FALL AWAY',
    onClick: () => {},
    width: 180,
    height: 56,
  });
  const sceneObj = scene({ particleCount: 800 }, btn);
  // Center the scene root in the canvas.
  sceneObj.root.transform = { x: W / 2, y: H / 2, sx: 1, sy: 1, rot: 0 };

  // CPU world — both sides run on CPU so the comparison is purely
  // about choreography flavor, not backend differences. (Visual works
  // on GPU world too; physical does not, by design.)
  const world = new World({
    width: W, height: H,
    hashCellSize: 24,
    // z-spring on so the physical popTo3D side has the integrator pass.
    zSpring: { k: 80, c: 18 },
  });
  const color = side === 'physical'
    ? packRGBA(140, 200, 255, 200)
    : packRGBA(255, 160, 220, 200);
  world.addParticles(spawn({
    n: 800,
    origin: { kind: 'point', x: W / 2, y: H / 2 },
    color: color as never,
  }));
  // Spring + drag so particles converge to their bound target (the
  // button silhouette). Without forces, they'd sit stacked at the
  // spawn point and never form the chrome.
  world.setForces([drag(0.5), spring(60, 6)]);

  sceneObj.tick(0);
  sceneObj.bindAll(world.particles, { kind: 'bounds-area' });

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

  const runner = createChoreoRunner({
    scene: sceneObj,
    world,
    particles: world.particles,
    mirrorHost: document.createElement('div'),
  });

  // Click handler — fires the side's signature effect directly via the
  // runner. Keeping the trigger layer out of this demo so the visual /
  // physical distinction reads as clearly as possible: the click invokes
  // exactly one effect, no wrapping.
  const fireEffect = (): void => {
    // Both sides do "fall, hold, return" so each click shows the full
    // transition cycle and lands back at the bound state — re-clickable
    // for direct comparison.
    //
    // Physical uses negative tz (recede) so the gesture mirrors visual's
    // intent. The popTo3D recipe IS already a setTz(tz) → wait → setTz(0)
    // sequence — auto-returns.
    //
    // Visual is fallAway → wait → riseUp explicitly composed here. fallAway
    // alone would be a one-way dismissal; for the demo we want to feel the
    // full cycle.
    const effect = side === 'physical'
      ? pipe(popTo3D({ tz: -8, holdMs: 380 }))
      : pipe(
          // Dramatic dip so the visual axis reads unmistakably: 30% scale
          // (compressed almost to a dot) and alpha 0 (fully transparent
          // at the bottom of the dip). riseUp restores in 380ms.
          visual.fallAway({ duration: 380, scaleTo: 0.3, alphaTo: 0 }),
          wait(220),
          visual.riseUp({ duration: 380, alphaFrom: 0, scaleFrom: 0.3 }),
        );
    runner.run(effect, groupOfComponent(btn), btn);
  };

  // Bigger click target — anywhere on the canvas triggers the effect,
  // so coordinate-mapping subtleties don't get in the way of the demo.
  canvas.addEventListener('pointerdown', () => {
    fireEffect();
  });

  // (riseUp affordance no longer needed — fireEffect now composes
  // fallAway + wait + riseUp so each click is self-contained.)

  // Frame loop — independent rAF per side so a stalled GPU readback
  // can't block the other panel (not strictly needed here since both
  // are CPU, but keeps the panels symmetrical).
  let raf = 0;
  let last = performance.now();
  let fpsAcc = 0;
  let fpsCount = 0;
  const tick = (now: number): void => {
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;
    runner.tick(dt * 1000);
    sceneObj.tick(dt);
    world.tick(dt);
    renderer.draw(world.particles, W, H);
    fpsAcc += dt;
    fpsCount++;
    if (fpsAcc > 0.5) {
      fpsEl.textContent = `${(fpsCount / fpsAcc).toFixed(0)} fps · n=800`;
      fpsAcc = 0; fpsCount = 0;
    }
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);

  return () => {
    if (raf) cancelAnimationFrame(raf);
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
    <p>Two buttons, two ways to express the same gesture. Click either canvas — both do "recede, hold, return," repeatable. Left routes through the simulation pipeline (<code>popTo3D</code> writes per-particle <code>tz</code>; the z-spring integrator owns the in-between motion). Right is pure 2D animation (<code>visual.fallAway</code> + wait + <code>visual.riseUp</code> — scale toward centroid + alpha fade). Both produce a sense of depth on screen; the cost and composability differ. The visual version runs on every backend including future visionOS without a z field on the GPU particle struct.</p>
  `;
  root.appendChild(head);

  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.innerHTML = `
    <div class="experiment-canvas-wrap surface-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 14px; padding: 14px;">
      <figure style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
        <figcaption style="font-size: 11px; letter-spacing: 0.10em; opacity: 0.75;">PHYSICAL · popTo3D · per-particle tz</figcaption>
        <canvas data-side="physical" width="${W}" height="${H}" style="width: 100%; height: auto; background: #0c0d10; border-radius: 6px; cursor: pointer;"></canvas>
        <code data-fps="physical" style="font-size: 11px; opacity: 0.7;">…</code>
      </figure>
      <figure style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
        <figcaption style="font-size: 11px; letter-spacing: 0.10em; opacity: 0.75;">VISUAL · fallAway → wait → riseUp · 2D only</figcaption>
        <canvas data-side="visual" width="${W}" height="${H}" style="width: 100%; height: auto; background: #0c0d10; border-radius: 6px; cursor: pointer;"></canvas>
        <code data-fps="visual" style="font-size: 11px; opacity: 0.7;">…</code>
      </figure>
    </div>
  `;
  root.appendChild(stage);
  root.appendChild(renderFooter());

  const physicalCanvas = stage.querySelector<HTMLCanvasElement>('[data-side="physical"]')!;
  const visualCanvas = stage.querySelector<HTMLCanvasElement>('[data-side="visual"]')!;
  const physicalFps = stage.querySelector<HTMLElement>('[data-fps="physical"]')!;
  const visualFps = stage.querySelector<HTMLElement>('[data-fps="visual"]')!;

  const teardownPhysical = buildSide(physicalCanvas, 'physical', physicalFps);
  const teardownVisual = buildSide(visualCanvas, 'visual', visualFps);

  return () => {
    teardownPhysical();
    teardownVisual();
  };
};
