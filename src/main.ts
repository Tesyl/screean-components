// screean-components demo.
//
// A minimal real app that consumes screean + the local components package.
// Proves the full pipeline end-to-end:
//
//   - Scene graph + camera from screean
//   - Label + button factories from ./components
//   - Pointer tracker for hover/press feedback
//   - Keyboard sensor for shape-shortcut keys (1 / 2 / 3)
//   - Particle weight boost on hovered/pressed components
//   - scene.replaceField() to swap the center shape without rebuilding
//     the whole scene (keeps component references stable)

import {
  World, camera, circle, column, createRenderer, drag, keyboardSensor, neighborRepel,
  node, packRGBA, pointForce, pointerSensor, polygon, rect, row, scene, shimmer, spawn,
  spring, TRANSPARENT, type Color, type SceneNode,
} from 'screean';
import {
  button, createFocusTracker, createPointerTracker, findComponentAncestor,
  label, popTo3D, routeKeyboardEvent,
  type Component,
} from './components';

// ------------------------------ Boot ---------------------------------------
const canvas = document.getElementById('portal') as HTMLCanvasElement | null;
if (!canvas) throw new Error('Missing <canvas id="portal">');

let W = window.innerWidth;
let H = window.innerHeight;

const PARTICLE_COUNT = 15_000;
const pointer = pointerSensor(window);
const keys = keyboardSensor(window);

const world = new World({
  width: W,
  height: H,
  hashCellSize: 6,
});
world.setForces([
  spring(90, 14),
  drag(0.7),
  shimmer(6, 5),
  neighborRepel(5, 1200),
  pointForce(() => pointer.getPoint(), 6000, 60),
]);

const renderer = createRenderer({
  canvas,
  backend: 'auto',
  portalMode: true,
  particleSize: 0.4,
  trailAlpha: 0.08,
  onFallback: (err) => console.warn('[demo] WebGL2 unavailable:', err.message),
});
renderer.resize(W, H);
console.info(`[demo] rendering via ${renderer.backend}`);

// ------------------------------ Shapes -------------------------------------
type ShapeKind = 'circle' | 'rect' | 'star';

const starVerts = (r: number, points: number, inset: number): [number, number][] => {
  const out: [number, number][] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inset;
    const a = -Math.PI / 2 + (i / (points * 2)) * Math.PI * 2;
    out.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  return out;
};

const makeShapeField = (kind: ShapeKind) => {
  const R = Math.min(W, H);
  switch (kind) {
    case 'circle':
      return circle({ r: R * 0.16 });
    case 'rect':
      return rect({ w: R * 0.45, h: R * 0.18, radius: 24 });
    case 'star':
      return polygon({ vertices: starVerts(R * 0.2, 5, 0.5) });
  }
};

// ------------------------------ State --------------------------------------
let currentShape: ShapeKind = 'circle';

// Color palettes per shape — pure cosmetic, signals "this is active."
type Palette = { hue: number; sat: number; lit: number };
const PALETTES: Record<ShapeKind, Palette> = {
  circle: { hue: 270, sat: 0.75, lit: 0.62 },
  rect:   { hue: 200, sat: 0.70, lit: 0.60 },
  star:   { hue: 330, sat: 0.80, lit: 0.62 },
};

const hslToPackedRgb = (h: number, s: number, l: number): Color => {
  // Inline HSL→RGB so this demo stays self-contained.
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
  const r = Math.round(hue2rgb(p, q, hh + 1 / 3) * 255);
  const g = Math.round(hue2rgb(p, q, hh) * 255);
  const b = Math.round(hue2rgb(p, q, hh - 1 / 3) * 255);
  return packRGBA(r, g, b, 255);
};

const recolorAll = (): void => {
  const p = PALETTES[currentShape];
  for (const particle of world.particles) {
    if (particle.life > 0) {
      const hueJitter = (Math.random() - 0.5) * 60;
      particle.color = hslToPackedRgb(p.hue + hueJitter, p.sat, p.lit);
    }
  }
};

// ------------------------------ Scene construction -------------------------
// The shape leaf is hoisted so we can `scene.replaceField(shapeLeaf, ...)` on
// user action. Keeps the buttons and their component references stable —
// the tracker never has to be torn down and rebuilt.
const shapeLeaf = node(makeShapeField(currentShape));

const R = Math.min(W, H);
const bodyFont = `500 ${Math.round(R * 0.018)}px system-ui`;
const titleFont = `300 ${Math.round(R * 0.04)}px system-ui`;

const setShape = (kind: ShapeKind): void => {
  currentShape = kind;
  ui.replaceField(shapeLeaf, makeShapeField(kind));
  ui.tick(0);
  ui.bindAll(world.particles, { kind: 'bounds-area' });
  recolorAll();
};

// 2.5D pop: clicking a button sends its particles forward on z for ~350ms,
// then springs them back. The engine's z-spring does the motion; we just
// set tz here.
const popButton = (btn: Component): void => {
  popTo3D({
    scene: ui, subtree: btn, particles: world.particles,
    tz: 6, holdMs: 350,
  });
};

// Note: button onClick uses the registry pattern so closures work even though
// ui / tracker are defined below (TDZ-safe indirection).
const content = column({ gap: 36, align: 'center', padding: 32 }, [
  label({ text: 'screean · components', font: titleFont }),
  shapeLeaf,
  row({ gap: 14, align: 'center' }, [
    button({
      label: 'Circle',
      onClick: (e) => { popButton(e.component); setShape('circle'); },
      width: 120, height: 44, radius: 10, font: bodyFont,
    }),
    button({
      label: 'Rect',
      onClick: (e) => { popButton(e.component); setShape('rect'); },
      width: 120, height: 44, radius: 10, font: bodyFont,
    }),
    button({
      label: 'Star',
      onClick: (e) => { popButton(e.component); setShape('star'); },
      width: 120, height: 44, radius: 10, font: bodyFont,
    }),
  ]),
]);

// Center `content` in the viewport via camera pan math (same trick the
// screean lab uses — works for top-left-origin layout roots).
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

// ------------------------------ Pointer + focus trackers ------------------
const tracker = createPointerTracker(ui);
// Focus tracker is what keyboard events read. Moves on pointerdown.
const focus = createFocusTracker();

const HOVER_WEIGHT = 1.6;
const PRESS_WEIGHT = 2.2;
const REST_WEIGHT = 1.0;

const applyWeight = (indices: readonly number[], w: number): void => {
  for (const i of indices) {
    const p = world.particles[i];
    if (p && p.life > 0) p.weight = w;
  }
};

const onHoverChange = (prev: Component | null, next: Component | null): void => {
  if (prev) applyWeight(ui.indicesForSubtree(prev), REST_WEIGHT);
  if (next) applyWeight(ui.indicesForSubtree(next), HOVER_WEIGHT);
};

// NB: scene.hitTest walks from the camera-rooted tree and bakes the camera's
// transform into each leaf's effective-field position — i.e. fields live in
// screen space. We pass screen coords directly; calling `camera.toWorld`
// here would subtract the camera's pan a second time and every hit-test
// would miss.
canvas.addEventListener('pointermove', (e) => {
  const screen: [number, number] = [e.clientX, e.clientY];
  const prev = tracker.hovered;
  tracker.onPointerMove(screen, screen);
  if (tracker.hovered !== prev) onHoverChange(prev, tracker.hovered);
});

canvas.addEventListener('pointerleave', () => {
  const prev = tracker.hovered;
  tracker.onPointerLeaveCanvas();
  if (prev) applyWeight(ui.indicesForSubtree(prev), REST_WEIGHT);
});

canvas.addEventListener('pointerdown', (e) => {
  const screen: [number, number] = [e.clientX, e.clientY];
  tracker.onPointerDown(screen, screen);
  if (tracker.pressed) applyWeight(ui.indicesForSubtree(tracker.pressed), PRESS_WEIGHT);
  // Pointer-driven focus move: whatever got pressed is now keyboard-focused.
  // Clicking empty canvas clears focus so arrow-key/enter don't fire on
  // a stale target.
  focus.setFocus(tracker.pressed ?? null);
});

canvas.addEventListener('pointerup', (e) => {
  const screen: [number, number] = [e.clientX, e.clientY];
  const pressed = tracker.pressed;
  tracker.onPointerUp(screen, screen);
  if (pressed) {
    // Fire click iff pointerup landed on the same component.
    if (pressed === tracker.hovered) {
      pressed._component.handlers.onClick?.({
        type: 'click',
        x: screen[0],
        y: screen[1],
        world: screen,
        screen,
        get local() { return screen; },
        component: pressed,
      });
    }
    applyWeight(
      ui.indicesForSubtree(pressed),
      pressed === tracker.hovered ? HOVER_WEIGHT : REST_WEIGHT,
    );
  }
});

// ------------------------------ Keyboard -----------------------------------
// Two paths share this listener:
//   1. routeKeyboardEvent: Enter/Space activates the focused button (fires
//      its onClick). This is the component-library-canonical path.
//   2. Number shortcuts (1/2/3) remain as a demo convenience.
window.addEventListener('keydown', (e) => {
  // Component-level activation first.
  const fired = routeKeyboardEvent(focus, e);
  if (fired) {
    e.preventDefault(); // stop Space scrolling the page, etc.
    return;
  }
  if (keys.getModifiers().meta || keys.getModifiers().ctrl) return;
  if (e.key === '1') setShape('circle');
  else if (e.key === '2') setShape('rect');
  else if (e.key === '3') setShape('star');
});

// ------------------------------ Spawn + initial bind -----------------------
world.addParticles(
  spawn({
    n: PARTICLE_COUNT,
    origin: { kind: 'edge', width: W, height: H },
    color: TRANSPARENT, // re-colored below
    speed: 300,
    toward: { x: W / 2, y: H / 2 },
  }),
);
ui.tick(0);
ui.bindAll(world.particles, { kind: 'bounds-area' });
recolorAll();

// ------------------------------ RAF loop -----------------------------------
let last = performance.now();
const loop = (now: number): void => {
  requestAnimationFrame(loop);
  const dt = (now - last) / 1000;
  last = now;
  ui.tick(dt);
  world.tick(dt);
  renderer.draw(world.particles, W, H);
};
requestAnimationFrame(loop);

// ------------------------------ Resize -------------------------------------
window.addEventListener('resize', () => {
  W = window.innerWidth;
  H = window.innerHeight;
  world.resize(W, H);
  renderer.resize(W, H);
  // Scene keeps the same structure; we just re-center and re-scale the shape.
  ui.camera!.setViewport(W, H);
  // Re-center pan after viewport change.
  const rr = content.intrinsic ?? { x: 0, y: 0, w: 0, h: 0 };
  ui.camera!.pan(
    (W - rr.w) / 2 - rr.x - ui.camera!.position[0],
    (H - rr.h) / 2 - rr.y - ui.camera!.position[1],
  );
  ui.replaceField(shapeLeaf, makeShapeField(currentShape));
  ui.tick(0);
  ui.bindAll(world.particles, { kind: 'bounds-area' });
});

// Silence "imported but unused" warning for findComponentAncestor — exposed
// for future consumer experimentation in the browser console.
void findComponentAncestor;
(globalThis as unknown as { __ui: unknown }).__ui = { ui, tracker, keys, pointer };
(globalThis as unknown as { __findComponentAncestor: unknown }).__findComponentAncestor =
  findComponentAncestor;
// Suppress unused-import warnings for SceneNode which some consumers will use
// when extending this demo.
void ({} as SceneNode | undefined);
