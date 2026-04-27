// Routing demo — P16 of ROADMAP.md (Chapter VII · App primitives).
//
// Three "pages" built as scene subtrees. Clicking a nav button swaps the
// active subtree under the scene root. `scene.bindAll` re-targets the
// existing particle pool onto the new layout; because `bind` only writes
// `p.tx, p.ty` (not positions), particles spring from their old positions
// to their new targets — the physics IS the route transition. No dispersal,
// no respawn, no rasterize. Same particles, new targets, spring does the work.
//
// DOM mirror auto-reconciles: removed components' divs drop from the a11y
// tree; new components' divs mount. Screen readers announce the new content
// on the next reconcile tick.
//
// Design choice: particles are always visible (subtle palette) so the
// morph is the demo's star. If we wanted "fade out old + spawn new,"
// `dismiss` and `spawn` compose — the shape below gives us that with
// ~10% the code.

import {
  World, camera, column, createRenderer, drag, neighborRepel,
  packRGBA, pointForce, pointerSensor, radialImpulse, row, scene,
  shimmer, spawn, spring, TRANSPARENT, unpackR, unpackG, unpackB,
  type Color, type SceneNode,
} from 'screean';
import {
  button, createDomMirror, label, popTo3D, type Component,
} from '../../components';

// ------------------------------ Boot ---------------------------------------
const canvas = document.getElementById('portal') as HTMLCanvasElement | null;
const mirrorHost = document.getElementById('mirror-host') as HTMLDivElement | null;
if (!canvas || !mirrorHost) throw new Error('Missing #portal or #mirror-host');

let W = window.innerWidth;
let H = window.innerHeight;

const PARTICLE_COUNT = 15_000;
const pointer = pointerSensor(window);

const world = new World({ width: W, height: H, hashCellSize: 6 });
// User toggle: when false, the pointer-attracting force is silenced by
// having its input return null — pointForce treats a null point as "no
// force this tick," so we don't need to rebuild the force stack on toggle.
let pointerActive = true;
const pointerInput = (): ReturnType<typeof pointer.getPoint> =>
  pointerActive ? pointer.getPoint() : null;

world.setForces([
  // Softer spring so the morph reads as a slow, visible reflow rather
  // than a snap. The transition aesthetic is WHY this demo exists.
  spring(60, 12),
  drag(0.72),
  shimmer(4, 4),
  neighborRepel(4, 900),
  pointForce(pointerInput, 5500, 60),
]);

const renderer = createRenderer({
  canvas,
  backend: 'auto',
  portalMode: true,
  particleSize: 0.7,
  trailAlpha: 0.15,
  onFallback: (err) => console.warn('[routing] WebGL2 unavailable:', err.message),
});
renderer.resize(W, H);
console.info(`[routing] rendering via ${renderer.backend}`);

// ------------------------------ Palette -----------------------------------
// Each route gets its own hue. The morph re-colors the cloud as it reshapes
// so the route change reads perceptually.
type Route = 'home' | 'gallery' | 'settings';
const HUES: Record<Route, number> = {
  home:     265,  // violet
  gallery:  185,  // teal
  settings: 32,   // amber
};

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

// Recolor all live particles to the current route's palette. Jitter keeps
// the cloud from looking like a flat solid color. Only called during a
// transition — at rest, particles are TRANSPARENT (hideAll).
const recolorToRoute = (route: Route): void => {
  const hue = HUES[route];
  for (const p of world.particles) {
    if (p.life > 0) {
      const jitter = (Math.random() - 0.5) * 40;
      p.color = hslToPackedRgb(hue + jitter, 0.72, 0.62);
    }
  }
};

const hideAll = (): void => {
  for (const p of world.particles) p.color = TRANSPARENT;
};

// ------------------------------ Pages --------------------------------------
// Each page is a function returning a fresh scene subtree. Called on route
// change; the returned node becomes the scene root's sole child.
//
// Why functions instead of once-constructed subtrees: components hold
// internal ids via the component factory's counter. Re-using the same
// subtree after detach/re-attach would keep stale ids around. Fresh per
// visit gives us clean id lifecycle.

const R = Math.min(W, H);
const titleFont = `300 ${Math.round(R * 0.05)}px system-ui`;
const bodyFont = `500 ${Math.round(R * 0.018)}px system-ui`;
const descFont = `400 ${Math.round(R * 0.016)}px system-ui`;

const mkButton = (lbl: string, onClick: (e: { component: Component }) => void): Component =>
  button({ label: lbl, onClick, width: 150, height: 44, radius: 10, font: bodyFont });

const pages: Record<Route, () => SceneNode> = {
  home: () => column({ gap: 28, align: 'center', padding: 32 }, [
    label({ label: 'screean', ariaRole: 'heading', font: titleFont }),
    label({ label: 'physics-on-ui · routing · the particles are the transition', font: descFont }),
    row({ gap: 14, align: 'center' }, [
      mkButton('Gallery →', (e) => navigate('gallery', e.component)),
      mkButton('Settings →', (e) => navigate('settings', e.component)),
    ]),
  ]),

  gallery: () => column({ gap: 28, align: 'center', padding: 32 }, [
    label({ label: 'Gallery', ariaRole: 'heading', font: titleFont }),
    label({ label: 'imagine thumbnails here · each click re-routes', font: descFont }),
    row({ gap: 14, align: 'center' }, [
      mkButton('Item A', () => {}),
      mkButton('Item B', () => {}),
      mkButton('Item C', () => {}),
    ]),
    row({ gap: 14, align: 'center' }, [
      mkButton('← Home', (e) => navigate('home', e.component)),
      mkButton('Settings →', (e) => navigate('settings', e.component)),
    ]),
  ]),

  settings: () => column({ gap: 28, align: 'center', padding: 32 }, [
    label({ label: 'Settings', ariaRole: 'heading', font: titleFont }),
    label({ label: 'also hypothetical · Tab navigates, Enter activates', font: descFont }),
    row({ gap: 14, align: 'center' }, [
      mkButton('Toggle A', () => {}),
      mkButton('Toggle B', () => {}),
    ]),
    row({ gap: 14, align: 'center' }, [
      mkButton('← Home', (e) => navigate('home', e.component)),
      mkButton('Gallery →', (e) => navigate('gallery', e.component)),
    ]),
  ]),
};

// ------------------------------ Scene construction -------------------------
// Build the first page, wrap in a camera for centering. The camera's pan
// is set once to roughly center the home page; other pages drift a bit
// depending on their size, which reads fine given the morph is the focus.
let currentRoute: Route = 'home';
let currentPage: SceneNode = pages[currentRoute]();

// Estimate pan from the initial page's intrinsic size. Re-centering on
// every route change is tempting but introduces a "camera jump" mid-morph.
// Keeping pan fixed gives a steady visual anchor so the particle motion
// stays the hero.
const initial = currentPage.intrinsic ?? { x: 0, y: 0, w: 0, h: 0 };
const pan: [number, number] = [
  (W - initial.w) / 2 - initial.x,
  (H - initial.h) / 2 - initial.y,
];

const ui = scene(
  { particleCount: PARTICLE_COUNT },
  camera({ viewport: { w: W, h: H }, pan }, currentPage),
);

// ------------------------------ Particles ----------------------------------
world.addParticles(
  spawn({
    n: PARTICLE_COUNT,
    origin: { kind: 'edge', width: W, height: H },
    color: TRANSPARENT,
    speed: 260,
    toward: { x: W / 2, y: H / 2 },
  }),
);
ui.tick(0);
ui.bindAll(world.particles, { kind: 'bounds-area' });
// Particles invisible at rest — the DOM mirrors are the only visible UI
// between transitions. The transition is what makes particles appear.
hideAll();

// ------------------------------ DOM mirror ---------------------------------
const mirror = createDomMirror({ scene: ui, host: mirrorHost });
mirror.reconcile();

// ------------------------------ HUD ----------------------------------------
const hudRoute = document.getElementById('hud-route')!;
const hudCount = document.getElementById('hud-count')!;
const togglePointer = document.getElementById('toggle-pointer') as HTMLInputElement;
let visitCount = 1;
const updateHud = (): void => {
  hudRoute.textContent = currentRoute;
  hudCount.textContent = String(visitCount);
  // Drive the CSS theme variables via an attribute on <html>. CSS selectors
  // `:root[data-route="gallery"]` etc. pick up each route's accent colors
  // so button backgrounds/borders shift in sync with the particle hue.
  document.documentElement.dataset.route = currentRoute;
};
updateHud();

// Pointer-pull toggle. The `pointerActive` flag gates pointForce's input
// function above — no re-subscription needed; the force just sees null and
// applies no impulse. Sync on load in case the browser restored a prior
// state (Firefox / Safari persist form state across reloads).
pointerActive = togglePointer.checked;
togglePointer.addEventListener('change', () => {
  pointerActive = togglePointer.checked;
});

// ------------------------------ Navigation ---------------------------------
// Unified transition choreography — particles + DOM mirrors + scene swap
// synchronized so the route change feels like ONE beat, not three.
//
//   t=0       click
//             popTo3D on the current page → particles lift forward on Z
//             old mirror divs: opacity 0, scale 1.12 (CSS transition runs)
//   t=SWAP    old UI is invisible, particles are forward in 3D space
//             → swap scene content, bindAll re-targets particles
//             → reconcile mirror: old divs removed, new divs mounted
//             → new divs: initial opacity 0, scale 0.88 (pre-animation)
//   t=SWAP+1  next frame: clear inline styles on new divs
//             → CSS transition animates them to (opacity 1, scale 1)
//   t=HOLD    popTo3D auto-resets — particles spring back from z=lift to z=0
//             → by now, physics has also pulled them to new layout targets
//             → they land home on the new page
//
// The routing transition has the same four-phase state machine the
// createDissolve primitive uses for in-place button dissolves — adapted to
// span a scene swap. The key insight: particles dissolve from the old page,
// the scene swaps while they're in chaotic flight, then they LERP cleanly
// to the new page's targets (physics is overridden during this phase so
// they land precisely), and finally the mirrors fade in over the pinned
// particle silhouette. No approximate "hovering near target" — particles
// arrive exactly on the new button shapes before the DOM mirrors take over.
//
// Names align with the html-interop demo's knobs on purpose: PARTICLE_PHASE_MS,
// RETURN_MS, FADE_MS, RETURN_LERP_K, BURST_KICK, BURST_SOFTNESS are the shared
// vocabulary. Routing-only knobs (SWAP_MS, LIFT_TZ, LIFT_HOLD_MS) are unique
// to the cross-scene case.
//
// Phases (measured from click, t=0):
//   particles  0 → PARTICLE_PHASE_MS   burst + 3D lift + scene swap mid-way
//   returning  (end of particles) → RETURN_MS   position lerp to new tx,ty
//   reforming  (end of returning) → FADE_MS     hold, mirrors CSS-fade in
//   idle       cycle complete — particles hidden, new UI fully visible
const PARTICLE_PHASE_MS = 450;
const SWAP_MS = 220;                 // scene swap offset INTO the particles phase
const RETURN_MS = 330;
const FADE_MS = 260;                 // button fade-in duration (opacity)
const FADE_OUT_MS = 320;             // particle alpha ramp at cycle end
const RETURN_LERP_K = 0.28;          // per-frame exponential approach
const LIFT_TZ = 7;
const LIFT_HOLD_MS = 280;            // popTo3D auto-resets before returning begins
const BURST_KICK = 500;
const BURST_SOFTNESS = 0.08;

type NavPhase =
  | { kind: 'idle' }
  | { kind: 'particles'; since: number }
  | { kind: 'returning'; since: number }
  | { kind: 'reforming'; since: number }
  | { kind: 'fading'; since: number };

let navPhase: NavPhase = { kind: 'idle' };

const listMirrorDivs = (): HTMLDivElement[] =>
  Array.from(mirrorHost.querySelectorAll<HTMLDivElement>('#screean-mirror > div'));

const getMirrorDivFor = (c: Component): HTMLDivElement | null =>
  mirrorHost.querySelector<HTMLDivElement>(
    `[data-component-id="${c._component.id}"]`,
  );

// Radial impulse on every live particle centered on (cx, cy). Wraps the
// engine's `radialImpulse` primitive with this demo's tuned defaults so the
// call site below stays one line.
const burstFrom = (cx: number, cy: number): void =>
  radialImpulse(world.particles, {
    origin: { x: cx, y: cy },
    kick: BURST_KICK,
    softness: BURST_SOFTNESS,
  });

const navigate = (to: Route, from?: Component): void => {
  if (to === currentRoute) return;
  if (navPhase.kind !== 'idle') return;      // ignore mid-transition clicks

  // --- PARTICLES phase entry -------------------------------------------
  // Reveal: particles were TRANSPARENT at rest. Paint them with the current
  // route's hue — they're already bound to the OLD page's shape, so the
  // cloud's initial arrangement IS the old buttons' silhouette.
  recolorToRoute(currentRoute);

  // Radial burst from the clicked button (falls back to viewport center).
  let cx = W / 2;
  let cy = H / 2;
  if (from) {
    const div = getMirrorDivFor(from);
    if (div) {
      const rect = div.getBoundingClientRect();
      cx = rect.left + rect.width / 2;
      cy = rect.top + rect.height / 2;
    }
  }
  burstFrom(cx, cy);

  // Pop forward on Z for the 3D feel. Auto-resets before RETURNING starts
  // so particles are back on the screen plane when the lerp takes over.
  popTo3D({
    scene: ui,
    subtree: currentPage,
    particles: world.particles,
    tz: LIFT_TZ,
    holdMs: LIFT_HOLD_MS,
  });

  // Fade old mirrors out (opacity only — no scale. Scaling would create
  // a mismatch between the particle silhouette and the shrinking/growing
  // mirror, which reads as the UI "sliding into place" at the end).
  for (const d of listMirrorDivs()) {
    d.style.opacity = '0';
  }

  navPhase = { kind: 'particles', since: performance.now() };

  // --- Swap moment (still inside PARTICLES phase) ----------------------
  // Schedule the actual scene swap mid-particles. Particles are colored,
  // moving, popped-forward; swapping at this moment is visually covered
  // by the cloud's chaotic motion.
  setTimeout(() => {
    ui.remove(currentPage);
    const nextPage = pages[to]();
    ui.add(nextPage);
    currentPage = nextPage;
    currentRoute = to;

    ui.tick(0);
    ui.bindAll(world.particles, { kind: 'bounds-area' });
    recolorToRoute(to);

    // Reconcile + pin new mirrors invisible. They stay at opacity 0 through
    // the rest of the particles phase AND the whole returning phase. When
    // REFORMING begins, tickNav clears opacity → CSS transitions fade them
    // in to full visibility OVER the pixel-accurate particle silhouette.
    // No scale tween — see CSS notes.
    mirror.reconcile();
    for (const d of listMirrorDivs()) {
      d.style.opacity = '0';
    }

    visitCount++;
    updateHud();
  }, SWAP_MS);
};

// Advance the nav state machine. Called from the main RAF loop after
// world.tick and ui.tick — the RETURNING phase overrides particle positions
// that physics just wrote; REFORMING holds them pinned.
const tickNav = (now: number): void => {
  if (navPhase.kind === 'idle') return;
  const elapsed = now - navPhase.since;

  if (navPhase.kind === 'particles') {
    if (elapsed >= PARTICLE_PHASE_MS) {
      navPhase = { kind: 'returning', since: now };
    }
    return;
  }

  if (navPhase.kind === 'returning') {
    // Exponential approach to each particle's (new) target. Writes
    // positions directly and zeroes velocities each frame — spring force
    // still runs in world.tick but is effectively cancelled here.
    const k = RETURN_LERP_K;
    for (const p of world.particles) {
      if (p.life <= 0) continue;
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      p.vx = 0;
      p.vy = 0;
    }
    if (elapsed >= RETURN_MS) {
      // Snap to pixel-exact targets so the silhouette is clean before the
      // mirrors fade over it.
      for (const p of world.particles) {
        if (p.life <= 0) continue;
        p.x = p.tx;
        p.y = p.ty;
      }
      // Trigger mirror fade-in by clearing the inline opacity that was
      // holding them invisible. CSS transition animates 0 → 1 (default).
      for (const d of listMirrorDivs()) {
        d.style.opacity = '';
      }
      navPhase = { kind: 'reforming', since: now };
    }
    return;
  }

  if (navPhase.kind === 'reforming') {
    // Hold particles pinned at new targets while mirrors fade in.
    for (const p of world.particles) {
      if (p.life <= 0) continue;
      p.x = p.tx;
      p.y = p.ty;
    }
    if (elapsed >= FADE_MS) {
      navPhase = { kind: 'fading', since: now };
    }
    return;
  }

  // fading: ramp alpha 1 → 0 over FADE_OUT_MS while keeping positions pinned.
  // Smoother finish than the previous hard hide — particles appear to
  // "condense into" the now-visible DOM mirror rather than blinking out.
  const t = Math.min(1, elapsed / FADE_OUT_MS);
  const alpha = Math.round((1 - t) * 255);
  for (const p of world.particles) {
    if (p.life <= 0) continue;
    // Keep pinned.
    p.x = p.tx;
    p.y = p.ty;
    // Repack current r/g/b with ramping alpha. r/g/b are stable from frame
    // to frame (set during reveal); only the alpha byte shrinks each frame.
    p.color = packRGBA(unpackR(p.color), unpackG(p.color), unpackB(p.color), alpha);
  }
  if (t >= 1) {
    hideAll();
    navPhase = { kind: 'idle' };
  }
};

// ------------------------------ Main loop ----------------------------------
let last = performance.now();
const loop = (now: number): void => {
  requestAnimationFrame(loop);
  const dt = (now - last) / 1000;
  last = now;
  world.tick(dt);
  ui.tick(dt);
  // Nav state machine — runs AFTER world.tick so its position writes
  // during RETURNING / REFORMING override the physics integration for
  // this frame.
  tickNav(now);
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
  if (ui.camera) ui.camera.setViewport(W, H);
});
