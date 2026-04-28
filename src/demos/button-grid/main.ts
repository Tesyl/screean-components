// Components showcase — proves the DOM mirror layer works end-to-end.
//
// Scene: a form-ish layout (heading + description + 2×3 button grid, one
// disabled) rendered as particles; the DOM mirror shadows it with
// accessible divs. Tab navigates, Enter/Space activates, the live a11y
// inspector HUD reports what a screen reader would announce for the
// currently-focused element.
//
// Why this demo rather than augmenting the existing shape-shifter:
// - The shape-shifter has a tight pointer-tracker loop for hover weights,
//   which conflicts with per-mirror `pointer-events: auto` click capture.
//   A purpose-built page keeps concerns separated.
// - A grid of varied buttons + a disabled button + heading/body labels
//   stresses the full mirror surface (tab order, aria-disabled, non-
//   interactive role emission) in a way the 3-button demo doesn't.

import {
  World, camera, column, createRenderer, drag, easing, neighborRepel,
  packRGBA, pointForce, pointerSensor, row, scene, shimmer, spawn,
  spring, TRANSPARENT, type Color, type SceneNode,
} from 'screean';
import {
  button, createDissolve, createDomMirror, label, type Component,
} from '../../components';

// ------------------------------ Boot ---------------------------------------
const canvas = document.getElementById('portal') as HTMLCanvasElement | null;
const mirrorHost = document.getElementById('mirror-host') as HTMLDivElement | null;
if (!canvas || !mirrorHost) throw new Error('Missing #portal or #mirror-host');

let W = window.innerWidth;
let H = window.innerHeight;

const PARTICLE_COUNT = 20_000;
const pointer = pointerSensor(window);

const world = new World({ width: W, height: H, hashCellSize: 6 });
world.setForces([
  spring(90, 14),
  drag(0.7),
  shimmer(5, 4),
  neighborRepel(5, 1000),
  pointForce(() => pointer.getPoint(), 5500, 60),
]);

const renderer = createRenderer({
  canvas,
  backend: 'auto',
  portalMode: true,
  particleSize: 1.0,
  trailAlpha: 0.25,
  onFallback: (err) => console.warn('[demo] WebGL2 unavailable:', err.message),
});
renderer.resize(W, H);
console.info(`[demo] rendering via ${renderer.backend}`);

// ------------------------------ Color palette ------------------------------
// Particles inherit a soft blue-violet hue with jitter. No click-based color
// cycling — activation feedback comes from the dissolve effect now.
const BASE_HUE = 250;
const BASE_SAT = 0.72;
const BASE_LIT = 0.62;

const hslToPackedRgb = (h: number, s: number, l: number): Color => {
  const hh = h / 360;
  const hue2rgb = (p: number, q: number, t: number): number => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  return packRGBA(
    Math.round(hue2rgb(p, q, hh + 1 / 3) * 255),
    Math.round(hue2rgb(p, q, hh) * 255),
    Math.round(hue2rgb(p, q, hh - 1 / 3) * 255),
    255,
  );
};

// Jittered palette color for one particle — called when a button is clicked
// and we want its particles to become visible for the dissolve.
const pickColor = (): Color => {
  const hueJitter = (Math.random() - 0.5) * 40;
  return hslToPackedRgb(BASE_HUE + hueJitter, BASE_SAT, BASE_LIT);
};

const hideAll = (): void => {
  for (const p of world.particles) p.color = TRANSPARENT;
};

// ------------------------------ Scene construction -------------------------
const R = Math.min(W, H);
const bodyFont = `500 ${Math.round(R * 0.018)}px system-ui`;
const titleFont = `400 ${Math.round(R * 0.038)}px system-ui`;
const descFont = `400 ${Math.round(R * 0.016)}px system-ui`;

// Heading + description as role-tagged labels so the a11y tree carries them.
const heading = label({
  label: 'Accessible components',
  font: titleFont,
  ariaRole: 'heading',
});

const description = label({
  label: 'Tab through to focus · Enter or Space to activate',
  font: descFont,
});

// Six actions. The 3×2 grid exercises the mirror with multiple tab targets.
// Each button's onClick triggers `dissolveButton(component)`: the mirror
// div hides, the particles bound to that button's subtree burst outward
// radially, the spring force pulls them home, mirror returns after ~1.3s.
// No rasterize — scene.bindAll already put those particles on the button
// shape; we're just kicking them.
type Action = {
  readonly label: string;
  readonly disabled?: boolean;
};

const actions: readonly Action[] = [
  { label: 'Save'       },
  { label: 'Duplicate'  },
  { label: 'Submit', disabled: true },
  { label: 'Reset'      },
  { label: 'Cancel'     },
  { label: 'Delete'     },
];

// Forward-declared so buttons (built before `ui` + `mirror` exist) can
// reference the handler at construction time. Filled in below once `ui`
// is constructed. Click events don't fire until the user interacts, by
// which point the assignment has happened.
let dissolveButton: (c: Component) => void = () => {};
const onButtonClick = (e: { component: Component }): void => dissolveButton(e.component);

const makeActionRow = (slice: readonly Action[]): SceneNode =>
  row({ gap: 14, align: 'center' }, slice.map((a) =>
    button({
      label: a.label,
      onClick: onButtonClick,
      width: 140,
      height: 44,
      radius: 10,
      font: bodyFont,
      disabled: a.disabled,
    }),
  ));

const content = column({ gap: 28, align: 'center', padding: 32 }, [
  heading,
  description,
  makeActionRow(actions.slice(0, 3)),
  makeActionRow(actions.slice(3, 6)),
]);

// Center the content in the viewport via the camera.
const r = content.intrinsic ?? { x: 0, y: 0, w: 0, h: 0 };
const ui = scene(
  { particleCount: PARTICLE_COUNT },
  camera(
    {
      viewport: { w: W, h: H },
      pan: [(W - r.w) / 2 - r.x, (H - r.h) / 2 - r.y],
    },
    content,
  ),
);

// ------------------------------ Particles ----------------------------------
world.addParticles(
  spawn({
    n: PARTICLE_COUNT,
    origin: { kind: 'edge', width: W, height: H },
    color: TRANSPARENT,
    speed: 300,
    toward: { x: W / 2, y: H / 2 },
  }),
);
ui.tick(0);
ui.bindAll(world.particles, { kind: 'bounds-area' });
// Everyone invisible at rest. Dissolve-on-click colors the clicked
// button's particles; the reform timer returns them to transparent.
hideAll();

// ------------------------------ DOM mirror ---------------------------------
const mirror = createDomMirror({ scene: ui, host: mirrorHost });

// Run the mirror once so divs exist before the first dissolve call.
mirror.reconcile();

// ------------------------------ Dissolve primitive -------------------------
// Shared choreography primitive from screean-components. State machine is
// burst → particles → returning (lerp home) → reforming (CSS fade mirror in).
// Consumer (this demo) owns particle reveal/hide so color behavior stays
// local. Tune via the opts below; same knob names as html-interop demo.
const dissolve = createDissolve({
  scene: ui,
  particles: world.particles,
  mirrorHost,
  onReveal: (indices) => {
    for (const i of indices) {
      const p = world.particles[i];
      if (p) p.color = pickColor();
    }
  },
  onHide: (indices) => {
    for (const i of indices) {
      const p = world.particles[i];
      if (p) p.color = TRANSPARENT;
    }
  },
  particlePhaseMs: 1200,
  returnMs: 300,
  fadeMs: 220,
  returnEasing: easing.outCubic,
  burstKick: 420,
  burstSoftness: 0.12,
});

dissolveButton = (c: Component): void => dissolve.trigger(c);

// ------------------------------ A11y inspector HUD -------------------------
const hudFocused = document.getElementById('hud-focused')!;
const hudRole = document.getElementById('hud-role')!;
const hudLabel = document.getElementById('hud-label')!;
const hudDisabled = document.getElementById('hud-disabled')!;

const updateHud = (): void => {
  const el = document.activeElement as HTMLElement | null;
  if (!el || !el.dataset.componentId) {
    hudFocused.textContent = '—';
    hudFocused.className = 'val muted';
    hudRole.textContent = '—';
    hudRole.className = 'val muted';
    hudLabel.textContent = '—';
    hudLabel.className = 'val muted';
    hudDisabled.textContent = '—';
    hudDisabled.className = 'val muted';
    return;
  }
  hudFocused.textContent = el.dataset.componentId;
  hudFocused.className = 'val';
  hudRole.textContent = el.getAttribute('role') ?? '(none)';
  hudRole.className = 'val';
  hudLabel.textContent = el.getAttribute('aria-label') ?? '(none)';
  hudLabel.className = 'val';
  hudDisabled.textContent = el.getAttribute('aria-disabled') === 'true' ? 'yes' : 'no';
  hudDisabled.className = 'val';
};

document.addEventListener('focusin', updateHud);
document.addEventListener('focusout', updateHud);
updateHud();

// ------------------------------ Main loop ----------------------------------
let last = performance.now();
const loop = (now: number) => {
  requestAnimationFrame(loop);
  const dt = (now - last) / 1000;
  last = now;
  world.tick(dt);
  ui.tick(dt);
  // Advance any in-flight dissolves. This runs AFTER world.tick so the
  // `returning` / `reforming` phases' direct position writes override the
  // integrated physics for this frame. (Physics still computes — we just
  // stomp the result for these specific particles.)
  dissolve.tick(now);
  mirror.reconcile();
  renderer.draw(world.particles, W, H);
};
requestAnimationFrame(loop);

// ------------------------------ Resize -------------------------------------
window.addEventListener('resize', () => {
  W = window.innerWidth;
  H = window.innerHeight;
  world.resize(W, H);
  renderer.resize(W, H);
  if (ui.camera) {
    ui.camera.setViewport(W, H);
    // (No pan-reset API on CameraAPI — content stays anchored to its
    // boot-time center. Fine for a demo.)
  }
});
