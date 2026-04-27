// html-in-canvas interop demo — Phase 3a (stable-path).
//
// The "DOM button ⇄ particles" demo, implemented on the portable web
// platform only. No Chromium flags. No `<canvas layoutsubtree>`,
// `drawElementImage`, `onpaint`, or any other WICG experimental API.
//
// Rasterization goes through `bitmapFieldFromElement`'s foreignObject path,
// which is hardened for inline-styled elements (Phase 1 defenses: CDATA-wrap
// Tailwind's `&` nesting, strip `url(...)` to avoid canvas tainting, use
// `data:` URLs for the SVG to keep the origin same).
//
// Interaction:
//   dom → (click) → dissolving → particles → (pointer idle + at rest)
//       → reforming → dom
//
// The button is a real DOM element — clickable, focusable, announced by
// screen readers. The particle cloud is purely visual; it inherits the
// button's palette and gets replaced by the button on reform.
//
// Phase 3b (native `drawElementImage` re-enable) stays dormant in the RFC
// and `MirrorStrategy` type, waiting for Chromium's implementation to
// stabilize. See `docs/RFC-html-in-canvas-interop.md`.
//
// StrictMode is deliberately OFF. StrictMode double-mounts in dev, which
// detaches the first <button> we capture via ref before rasterization runs.

import { createRoot } from 'react-dom/client';
import './index.css';

import {
  World,
  bitmapFieldFromElement,
  createRenderer,
  drag,
  neighborRepel,
  pointForce,
  pointerSensor,
  shimmer,
  spawn,
  spring,
  radialImpulse,
  TRANSPARENT,
  packRGBA,
  type Color,
  type BitmapField,
} from 'screean';

import { App } from './App';
import { parseCssColorToRgba } from './physics';

const log = (...args: unknown[]) => console.info('[html-interop]', ...args);

// ------------------------------ DOM setup ----------------------------------
const canvas = document.getElementById('portal') as HTMLCanvasElement | null;
const mount = document.getElementById('mount') as HTMLDivElement | null;
const statusEl = document.getElementById('status') as HTMLDivElement | null;
if (!canvas || !mount || !statusEl) {
  throw new Error('html-interop: missing #portal, #mount, or #status');
}

const setStatus = (text: string) => {
  statusEl.textContent = text;
  log('status:', text);
};

let W = window.innerWidth;
let H = window.innerHeight;

// ------------------------------ screean world ------------------------------
const PARTICLE_COUNT = 6000;
const pointer = pointerSensor(window);

const world = new World({ width: W, height: H, hashCellSize: 6 });
world.setForces([
  spring(140, 16),
  drag(0.85),
  shimmer(3, 4),
  neighborRepel(4, 900),
  pointForce(() => pointer.getPoint(), 4500, 80),
]);

const renderer = createRenderer({
  canvas,
  backend: 'auto',
  portalMode: true,
  particleSize: 0.8,
  trailAlpha: 0.22,
  fadeWindow: 0.35,
  onFallback: (err) => console.warn('[html-interop] WebGL2 unavailable:', err.message),
});
renderer.resize(W, H);
log('renderer:', renderer.backend);

// ------------------------------ State machine ------------------------------
type DemoState =
  | { kind: 'dom' }
  | { kind: 'dissolving'; since: number; field: BitmapField }
  | { kind: 'particles'; since: number; field: BitmapField }
  | { kind: 'returning'; since: number; field: BitmapField }
  | { kind: 'reforming'; since: number; field: BitmapField };

let state: DemoState = { kind: 'dom' };
let currentButton: HTMLButtonElement | null = null;
let palette: Color[] = [packRGBA(230, 230, 240, 255)];

const pickColor = (): Color => palette[(Math.random() * palette.length) | 0];

const setButtonVisuals = (opacity: number, interactive: boolean) => {
  if (!currentButton) return;
  // No CSS transition — tickState drives opacity per-frame during 'reforming'.
  // A CSS transition here would smooth each per-frame write over its duration
  // and visibly stack on top of the JS-driven fade.
  currentButton.style.opacity = String(opacity);
  currentButton.style.pointerEvents = interactive ? 'auto' : 'none';
};

// Pull the button's rendered colors into the particle palette so the cloud
// visually reads as "the button".
const samplePalette = (el: HTMLButtonElement): Color[] => {
  const cs = window.getComputedStyle(el);
  const factory = (() => document.createElement('canvas')) as unknown as Parameters<typeof parseCssColorToRgba>[1];
  const pack = (css: string): Color | null => {
    const rgba = parseCssColorToRgba(css, factory);
    if (!rgba || rgba[3] === 0) return null;
    return packRGBA(rgba[0], rgba[1], rgba[2], 255);
  };
  const colors = [pack(cs.backgroundColor), pack(cs.color)]
    .filter((c): c is Color => c !== null);
  return colors.length ? colors : [packRGBA(230, 230, 240, 255)];
};

// ---- Phase durations -----------------------------------------------------
// One click runs one full cycle: dissolve → particles roam → return → reform.
// Automatic transitions on fixed timers; no rest detection, no pointer-idle
// gating. User gets a clear beat-by-beat effect: burst, play, snap-home, fade.
const PARTICLE_PHASE_MS = 1500;   // how long particles roam with full physics
// RETURN_MS is sized to match the lerp's visual convergence. At
// RETURN_LERP_K=0.22 the remaining distance is 0.78^n per frame, so particles
// are ~99% on target by frame 18 (~300ms @ 60 Hz). Keeping this *short* so
// the `returning → reforming` handoff happens AT the moment particles
// visually land — otherwise you see a dead-zone pause before the fade starts.
const RETURN_MS = 50;
const FADE_MS = 100;                // button fade 0→1 while particles are pinned
const RETURN_LERP_K = 0.22;

// ------------------------------ Dissolve trigger ---------------------------
const dissolve = async () => {
  if (!currentButton) return;
  // One cycle at a time. Mid-cycle clicks are ignored (the cycle finishes on
  // its own and the button is clickable again when we're back to `dom`).
  if (state.kind !== 'dom') return;

  setStatus('rasterizing…');
  if (document.fonts && 'ready' in document.fonts) await document.fonts.ready;

  let field: BitmapField;
  try {
    const result = await bitmapFieldFromElement({
      element: currentButton,
      strategy: 'foreignObject',
      alphaThreshold: 20,
    });
    field = result.field;
    log('rasterized', { strategy: result.strategy });
  } catch (err) {
    console.error('[html-interop] rasterize failed:', err);
    setStatus(`error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  setStatus('particles');
  palette = samplePalette(currentButton);

  // Spawn particles AT the field targets so the first frame IS the button.
  const rect = currentButton.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  world.particles.length = 0;
  world.addParticles(
    spawn({
      n: PARTICLE_COUNT,
      origin: { kind: 'point', x: cx, y: cy },
      color: TRANSPARENT,
      speed: 0,
    }),
  );
  const targets = field.sample(world.particles.length);
  for (let i = 0; i < world.particles.length; i++) {
    const p = world.particles[i];
    const [tx, ty] = targets[i] ?? [cx, cy];
    p.x = tx; p.y = ty;
    p.tx = tx; p.ty = ty;
    p.vx = 0; p.vy = 0;
    p.color = pickColor();
    p.weight = 1;
  }

  radialImpulse(world.particles, { origin: { x: cx, y: cy }, kick: 420 });

  setButtonVisuals(0, false);
  state = { kind: 'dissolving', since: performance.now(), field };
};

// ------------------------------ Per-frame transitions ----------------------
const tickState = (now: number) => {
  if (state.kind === 'dissolving') {
    // One frame for the burst impulse to integrate, then free physics.
    if (now - state.since > 16) {
      state = { kind: 'particles', since: now, field: state.field };
    }
    return;
  }

  if (state.kind === 'particles') {
    // Fixed-duration free-physics phase: particles respond to cursor, settle
    // nowhere in particular. Then we pull them home.
    if (now - state.since > PARTICLE_PHASE_MS) {
      state = { kind: 'returning', since: now, field: state.field };
      setStatus('returning');
    }
    return;
  }

  if (state.kind === 'returning') {
    // Exponential approach to each particle's target position. Dominates the
    // physics (spring+neighborRepel+shimmer) by writing positions directly.
    // Physics is skipped for this state in the main loop.
    const k = RETURN_LERP_K;
    for (const p of world.particles) {
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      p.vx = 0;
      p.vy = 0;
    }
    if (now - state.since >= RETURN_MS) {
      // Final snap to exact targets so the button-shape is pixel-perfect
      // before the fade.
      for (const p of world.particles) {
        p.x = p.tx;
        p.y = p.ty;
      }
      state = { kind: 'reforming', since: now, field: state.field };
      setStatus('reforming');
    }
    return;
  }

  if (state.kind === 'reforming') {
    // Particles are pinned on the button silhouette. Button fades in on top.
    const t = Math.min(1, (now - state.since) / FADE_MS);
    if (currentButton) currentButton.style.opacity = String(t);
    // Hold particles pinned — no physics in this state (see loop).
    for (const p of world.particles) {
      p.x = p.tx;
      p.y = p.ty;
    }
    if (t >= 1) {
      world.particles.length = 0;
      setButtonVisuals(1, true);
      state = { kind: 'dom' };
      setStatus('ready');
    }
  }
};

// ------------------------------ Main loop ----------------------------------
// Physics runs during 'dom' (no-op — no particles), 'dissolving', and
// 'particles'. We skip it during 'returning' and 'reforming' because
// tickState writes particle positions directly in those phases and we don't
// want spring/drag/neighborRepel fighting the lerp.
let last = performance.now();
const loop = (now: number) => {
  requestAnimationFrame(loop);
  const dt = (now - last) / 1000;
  last = now;
  if (state.kind === 'dom' || state.kind === 'dissolving' || state.kind === 'particles') {
    world.tick(dt);
  }
  renderer.draw(world.particles, W, H);
  tickState(now);
};
requestAnimationFrame(loop);

// ------------------------------ React mount --------------------------------
const root = createRoot(mount);

const waitForButton = (label: string): Promise<HTMLButtonElement> =>
  new Promise<HTMLButtonElement>((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(
      () => reject(new Error('button ref never fired within 3s')),
      3000,
    );
    const capture = (el: HTMLButtonElement | null) => {
      if (!el || !el.isConnected || resolved) return;
      resolved = true;
      clearTimeout(timeout);
      currentButton = el;
      queueMicrotask(() => resolve(el));
    };
    root.render(
      <App
        label={label}
        size="lg"
        buttonRef={capture}
        onButtonClick={() => void dissolve()}
      />,
    );
  });

const centerMount = (rect: { width: number; height: number } | null) => {
  const w = rect?.width ?? 160;
  const h = rect?.height ?? 44;
  mount.style.left = `${Math.round(W / 2 - w / 2)}px`;
  mount.style.top = `${Math.round(H / 2 - h / 2)}px`;
};

// ------------------------------ Boot ---------------------------------------
centerMount(null);
(async () => {
  const button = await waitForButton('Click me');
  centerMount(button.getBoundingClientRect());
  setButtonVisuals(1, true);
  setStatus('ready');
})().catch((err) => {
  console.error('[html-interop] boot failed:', err);
  setStatus(`error: ${err.message}`);
});

// ------------------------------ Resize -------------------------------------
let resizeTimer: ReturnType<typeof setTimeout> | null = null;
window.addEventListener('resize', () => {
  W = window.innerWidth;
  H = window.innerHeight;
  world.resize(W, H);
  renderer.resize(W, H);
  if (currentButton) centerMount(currentButton.getBoundingClientRect());
  // If we're mid-particles, the button's captured field is anchored to the
  // old center. Easiest fix is to let the user click again; for now just
  // note that a resize during particles is cosmetically off.
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { /* no-op; reserved for future smarts */ }, 180);
});
