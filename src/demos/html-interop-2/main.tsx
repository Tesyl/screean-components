// html-in-canvas interop — v2.
//
// Same DOM-button ⇄ particles round-trip as the original demo, with one
// targeted modernization: the hand-tuned force stack moves into a named
// engine preset (`feels.taut`). The values are *literally* the same — this
// is a port, not a re-tune — but the consumer-side surface is now a single
// preset reference instead of five inline numeric calls.
//
// Why this matters as a stepping stone: the original demo predates the feel
// preset table. Every consumer that wanted "the html-interop feel" had to
// copy the magic numbers verbatim; downstream tweaks drifted invisibly.
// The new `feels.taut` preset (added in `screean/src/feel/presets.ts`)
// canonicalizes "stiff spring + heavy damping + low shimmer + tight repel"
// as a vibe — characterized by "particles snap to silhouette and pin"
// rather than the breathing crowds of `feels.balanced` / `feels.dreamy`.
//
// Everything else is byte-for-byte the original: the state machine, the
// rasterizer call, the palette sampling, the loop. Diffing v1 vs v2 should
// surface ONLY the force-construction site. That's the whole point — prove
// the preset is a faithful port before we build on top of it.
//
// StrictMode is deliberately OFF (same reasoning as v1).

import { createRoot } from 'react-dom/client';
import './index.css';

import {
  World,
  bitmapFieldFromElement,
  createRenderer,
  drag,
  feels,
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
} from '@tesyl/screean';

import { App } from './App';
import { parseCssColorToRgba } from './physics';

const log = (...args: unknown[]) => console.info('[html-interop-2]', ...args);

// ------------------------------ DOM setup ----------------------------------
const canvas = document.getElementById('portal') as HTMLCanvasElement | null;
const mount = document.getElementById('mount') as HTMLDivElement | null;
const statusEl = document.getElementById('status') as HTMLDivElement | null;
if (!canvas || !mount || !statusEl) {
  throw new Error('html-interop-2: missing #portal, #mount, or #status');
}

const setStatus = (text: string) => {
  statusEl.textContent = text;
  log('status:', text);
};

let W = window.innerWidth;
let H = window.innerHeight;

// ------------------------------ screean world ------------------------------
// Force constants now flow through the named `feels.taut` preset.
// The preset's docstring in `screean/src/feel/presets.ts` describes the
// "particles must read AS this thing, right now" character — which is
// exactly what the dom ⇄ particles demo needs.
const PARTICLE_COUNT = 6000;
const pointer = pointerSensor(window);
const f = feels.taut;

const world = new World({ width: W, height: H, hashCellSize: f.hashCellSize });
world.setForces([
  spring(f.springK, f.springC),
  drag(f.drag),
  shimmer(f.shimmerAmp, f.shimmerFreq),
  neighborRepel(f.repelRadius, f.repelStrength),
  pointForce(() => pointer.getPoint(), f.pointerAttract, 80),
]);

const renderer = createRenderer({
  canvas,
  backend: 'auto',
  portalMode: true,
  particleSize: 0.8,
  trailAlpha: 0.22,
  fadeWindow: 0.35,
  onFallback: (err) => console.warn('[html-interop-2] WebGL2 unavailable:', err.message),
});
renderer.resize(W, H);
log('renderer:', renderer.backend, '· feel: taut');

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
  currentButton.style.opacity = String(opacity);
  currentButton.style.pointerEvents = interactive ? 'auto' : 'none';
};

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
const PARTICLE_PHASE_MS = 1500;
const RETURN_MS = 50;
const FADE_MS = 100;
const RETURN_LERP_K = 0.22;

// ------------------------------ Dissolve trigger ---------------------------
const dissolve = async () => {
  if (!currentButton) return;
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
    console.error('[html-interop-2] rasterize failed:', err);
    setStatus(`error: ${err instanceof Error ? err.message : String(err)}`);
    return;
  }

  setStatus('particles');
  palette = samplePalette(currentButton);

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
    if (now - state.since > 16) {
      state = { kind: 'particles', since: now, field: state.field };
    }
    return;
  }

  if (state.kind === 'particles') {
    if (now - state.since > PARTICLE_PHASE_MS) {
      state = { kind: 'returning', since: now, field: state.field };
      setStatus('returning');
    }
    return;
  }

  if (state.kind === 'returning') {
    const k = RETURN_LERP_K;
    for (const p of world.particles) {
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      p.vx = 0;
      p.vy = 0;
    }
    if (now - state.since >= RETURN_MS) {
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
    const t = Math.min(1, (now - state.since) / FADE_MS);
    if (currentButton) currentButton.style.opacity = String(t);
    for (const p of world.particles) {
      p.x = p.tx;
      p.y = p.ty;
    }
    if (t >= 1) {
      world.particles.length = 0;
      setButtonVisuals(1, true);
      state = { kind: 'dom' };
      setStatus('ready · taut');
    }
  }
};

// ------------------------------ Main loop ----------------------------------
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
  const button = await waitForButton('Click me · v2 (feels.taut)');
  centerMount(button.getBoundingClientRect());
  setButtonVisuals(1, true);
  setStatus('ready · taut');
})().catch((err) => {
  console.error('[html-interop-2] boot failed:', err);
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
  if (resizeTimer) clearTimeout(resizeTimer);
  resizeTimer = setTimeout(() => { /* no-op; reserved for future smarts */ }, 180);
});
