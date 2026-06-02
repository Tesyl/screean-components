// mountLabStory — builds a runnable lab page for one story.
//
// Owns the Stage, persistent scene root, DOM mirror, and dissolve. Exposes
// methods that the controls panel calls when the user tweaks knobs:
//
//   handle.setProps(props)          → rebuild scene with new component props
//   handle.setForces(state)         → live-apply force overrides
//   handle.setGlobals(state)        → live-apply world-level overrides
//                                      (some require a partial rebuild)
//   handle.setChoreo(state)         → recreate dissolve with new opts
//   handle.dispose()                → tear down everything
//
// Per the Pass A spec, the scene root is created ONCE and persists; rebuilds
// replace only the camera's children. This keeps `createDomMirror` and
// `createDissolve` references valid for the whole story lifetime.

import {
  scene,
  camera,
  cameraOf,
  spawn,
  TRANSPARENT,
  easing as easingCurves,
  packRGBA,
  radialImpulse,
  type Color,
  type SceneNode,
  type Easing,
} from '@tesyl/screean';
import {
  createDomMirror,
  type Component,
  type DomMirror,
  type ComponentEvent,
  createChoreoRunner,
  dissolve,
  groupOfComponent,
  pipe,
  setColor,
} from '../../src/components';
// Default visual identity for component mirrors (paint layer — geometry
// lives inline on the mirror element). Importing here gives every lab
// story a styled button/heading/etc. out of the box without per-page CSS.
import '../../src/components/styles.css';

import { Stage, windowPointer } from '../embed';
import { DEFAULT_THEME, THEMES } from '../themes';
import {
  type ChoreoState,
  type ForceState,
  type GlobalState,
  type LabStory,
} from './types';

export type LabHandle = {
  setProps: (props: Record<string, unknown>) => void;
  setForces: (state: ForceState) => void;
  setGlobals: (state: GlobalState) => void;
  setChoreo: (state: ChoreoState) => void;
  // Manual dissolve trigger for the controls panel's "Trigger" button.
  // Fires against the most-recently-built component — essential for
  // non-interactive stories (label, card, image) that don't have an
  // onClick / onChange to drive activation organically.
  triggerDissolve: () => void;
  // Kick mode toggle. When `true`, canvas clicks fire a radial impulse
  // from the cursor. When `false` (default), canvas clicks do nothing
  // and mirror divs receive their own events normally. The toggle lives
  // in the lab page UI; this is the wire from button → behavior.
  setKickMode: (on: boolean) => void;
  // Read-only accessors for the Code tab.
  getProps: () => Record<string, unknown>;
  dispose: () => void;
};

export type LabMountOpts = {
  canvas: HTMLCanvasElement;
  mirrorHost: HTMLElement;
  story: LabStory;
  initialProps: Record<string, unknown>;
  initialForces: ForceState;
  initialGlobals: GlobalState;
  initialChoreo: ChoreoState;
  // The framework wraps the story's component activation handler so a
  // single click triggers dissolve. Stories don't pass their own onClick;
  // they receive this through the framework via the `build(props)` call —
  // they include it in the component opts under the right key (`onClick`,
  // `onChange`). The story's `build` returns the Component, and the
  // framework writes the wrapped handler to the component's internals.
  // Simpler design: stories DON'T add onClick at all. The framework reads
  // the returned component and inserts a wrapped click handler that calls
  // dissolve.trigger before returning control. See activate() below.
};

const dimensions = (canvas: HTMLCanvasElement): { w: number; h: number } => {
  const rect = canvas.getBoundingClientRect();
  // CSS sizing drives the logical canvas extent; the renderer + Stage
  // figure DPR scaling internally. Read clientWidth/Height as integers.
  return {
    w: Math.max(60, Math.round(rect.width)),
    h: Math.max(60, Math.round(rect.height)),
  };
};

const easingByName = (name: string): Easing =>
  // Defensive: fall back to outCubic if the controls panel ever sends an
  // unknown name. Shouldn't happen with the dropdown, but matches our
  // engine's "graceful default" pattern elsewhere.
  (easingCurves as Record<string, Easing>)[name] ?? easingCurves.outCubic;

export const mountLabStory = (opts: LabMountOpts): LabHandle => {
  const { canvas, mirrorHost, story } = opts;
  const theme = THEMES[DEFAULT_THEME];
  const { w: W, h: H } = dimensions(canvas);
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  // Mutable references — closure-shared so setForces / setGlobals etc.
  // can reach into the live state.
  let props = { ...opts.initialProps };
  let forces = { ...opts.initialForces };
  let globals = { ...opts.initialGlobals };
  let choreo = { ...opts.initialChoreo };

  // ─── Stage ────────────────────────────────────────────────────────────
  const sg = new Stage({
    canvas,
    width: W,
    height: H,
    feel: theme.feel,
    feelOverrides: { ...forces, repelStrength: forces.repelStrength },
    palette: {
      hueCenter: globals.hueCenter,
      hueRange: globals.hueRange,
      sat: globals.saturation,
      lit: globals.lightness,
    },
    particleCount: globals.particleCount,
    spawnFrom: 'edge',
    spawnSpeed: globals.spawnSpeed,
    // Portal mode = translucent canvas. The gradient backdrop on
    // .lab-stage::before peeks through the cloud — same aesthetic as the
    // standalone demos. Without this, the canvas's own clear color hides
    // the backdrop entirely.
    portal: true,
    particleSize: globals.particleSize,
    trailAlpha: globals.trailAlpha,
    // Pointer attractor — matches button-grid's `pointForce(pointer, …)`.
    // Particles weakly track the cursor, giving the cloud a sense of "this
    // surface is alive and aware of you" without overpowering the spring
    // that holds them on bound targets.
    pointerProvider: windowPointer,
  });

  // Inline activation wrapper: each component's onClick / onChange also
  // fires the dissolve pipeline against the clicked component.
  const activate = (e: ComponentEvent): void => {
    choreoRunner.run(
      buildDissolvePipeline(),
      groupOfComponent(e.component),
      e.component,
    );
  };

  // Track the most-recently-built component so the controls panel's
  // "Trigger" button can fire dissolve on it. Stories that return a
  // single Component (every story today) populate this on each build.
  let currentComponent: Component | null = null;

  // The story's build() receives `activate` as its onActivate arg. The
  // story wires it to the component's interactive opt (onClick / onChange).
  // Each user click on the live component fires dissolve via the same path,
  // so the choreography is consistent across every component type.
  const buildScene = (): SceneNode => {
    const c = story.build(props, activate);
    // Stories return a Component (which IS a SceneNode). Capture it here
    // so triggerDissolve has a target.
    currentComponent = c as Component;
    return c;
  };

  // Center the camera over the current content. Same math `Stage.setScene`
  // uses for autoPan: shift world-origin so the content's bounds are
  // centered in the viewport. The camera's pan is its node `transform`
  // (camera() initializes transform.x/y from opts.pan). Mutating the
  // transform fields directly is how `Stage` does it under the hood.
  const recenter = (): void => {
    const child = cameraNode.children[0];
    const r = child?.intrinsic ?? { x: 0, y: 0, w: 0, h: 0 };
    if (!cameraNode.transform) return;
    cameraNode.transform.x = (W - r.w) / 2 - r.x;
    cameraNode.transform.y = (H - r.h) / 2 - r.y;
  };
  // cameraOf is unused after this rewrite, but kept in imports for future
  // plumbing (zoom / animated pan via the CameraAPI).
  void cameraOf;

  // Persistent camera + scene root.
  const cameraNode = camera({ viewport: { w: W, h: H } }, buildScene());
  const sceneObj = scene({ particleCount: globals.particleCount }, cameraNode);

  // Initial particle spawn + bind.
  sg.world.particles.length = 0;
  sg.world.addParticles(
    spawn({
      n: globals.particleCount,
      origin: { kind: 'edge', width: W, height: H },
      color: TRANSPARENT,
      speed: globals.spawnSpeed,
      toward: { x: W / 2, y: H / 2 },
    }),
  );
  sceneObj.tick(0);
  recenter();
  sceneObj.tick(0);
  sceneObj.bindAll(sg.world.particles, { kind: 'bounds-area' });

  // Click on empty canvas area. Default behavior: do nothing — let the
  // mirror divs handle their own clicks normally. When kickMode is on,
  // every click also fires a radial impulse from the cursor (a "play"
  // gesture for tuning forces / scattering particles to watch them
  // recover). The kick-toggle button in the UI calls setKickMode below.
  let kickMode = false;
  const onCanvasClick = (e: MouseEvent): void => {
    if (!kickMode) return;
    const r = canvas.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    radialImpulse(sg.world.particles, {
      origin: { x: cx, y: cy },
      kick: 360,
      softness: 0.12,
    });
  };
  canvas.addEventListener('click', onCanvasClick);

  // ─── Responsive: ResizeObserver → Stage.resize ───────────────────────
  // The canvas's CSS dimensions are width/height: 100% — they follow the
  // wrap. Stage's internal back-buffer needs to be told. ResizeObserver
  // fires whenever the wrap's box changes (window resize, fullscreen,
  // sidebar collapse, anything). Coalesced via rAF so a continuous resize
  // drag doesn't fire 60 Stage.resize calls per second.
  let mutableW = W;
  let mutableH = H;
  let resizeRaf = 0;
  const ro = new ResizeObserver((entries) => {
    const entry = entries[0];
    if (!entry) return;
    const { width, height } = entry.contentRect;
    const w = Math.max(60, Math.round(width));
    const h = Math.max(60, Math.round(height));
    if (w === mutableW && h === mutableH) return;
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      mutableW = w;
      mutableH = h;
      sg.resize(w, h);
      // Update camera viewport so layout math (and recenter) use new
      // dimensions. Direct mutation — same pattern as the controls
      // experiment's fullscreen handler.
      const ci = cameraOf(cameraNode);
      if (ci) {
        ci.viewport.w = w;
        ci.viewport.h = h;
      }
      // Re-bind to new positions (column layout depends on viewport for
      // padding / centering); recenter then second tick to apply.
      sceneObj.tick(0);
      // The recenter helper reads `W`/`H` from closure; we keep those in
      // sync here by reassigning at the top via mutableW/H. But the
      // recenter inside this scope still reads the original const W/H.
      // Inline the math here against the new dims.
      const child = cameraNode.children[0];
      const r = child?.intrinsic ?? { x: 0, y: 0, w: 0, h: 0 };
      if (cameraNode.transform) {
        cameraNode.transform.x = (w - r.w) / 2 - r.x;
        cameraNode.transform.y = (h - r.h) / 2 - r.y;
      }
      sceneObj.tick(0);
      sceneObj.bindAll(sg.world.particles, { kind: 'bounds-area' });
      mirror.reconcile();
    });
  });
  ro.observe(canvas);

  // Components-mode visibility: particles are TRANSPARENT at rest. The
  // mirror is what the user sees standing still; particles only become
  // visible during a dissolve cycle (onReveal → pickColor; onHide →
  // TRANSPARENT). Mirrors components.html exactly.
  //
  // Why not "visible at rest"? Two projections were fighting for the
  // viewer's eye — the mirror chrome and the always-on cloud. Going
  // invisible-at-rest cleans that up: chrome is the steady state, particles
  // are the transformation. See `docs/RFC-component-model.md` (when written).
  const hideAll = (): void => {
    for (const p of sg.world.particles) p.color = TRANSPARENT;
  };
  // Sample one color from the current palette — used by dissolve.onReveal
  // to color particles as they enter the visible phase. Reads `globals`
  // from closure so palette changes flow through without re-creating the
  // dissolve instance.
  const pickColor = (): Color => {
    const { hueCenter, hueRange, saturation, lightness } = globals;
    const h = (((hueCenter + (Math.random() - 0.5) * hueRange) + 360) % 360) / 360;
    const [r, g, b] = hslToRgb(h, saturation, lightness);
    return packRGBA((r * 255) | 0, (g * 255) | 0, (b * 255) | 0, 255);
  };
  hideAll();

  // ─── DOM mirror + choreography runner ─────────────────────────────────
  const mirror: DomMirror = createDomMirror({ scene: sceneObj, host: mirrorHost });
  mirror.reconcile();

  const choreoRunner = createChoreoRunner({
    scene: sceneObj,
    world: sg.world,
    particles: sg.world.particles,
    mirrorHost,
  });

  // Build the dissolve pipeline using the CURRENT choreo state. Recomputed
  // per trigger so setChoreo updates take effect without rebuilding the
  // runner.
  const buildDissolvePipeline = () => pipe(
    setColor({ to: pickColor }),  // was onReveal
    dissolve({
      particlePhaseMs: choreo.particlePhaseMs,
      returnMs: choreo.returnMs,
      fadeMs: choreo.fadeMs,
      burstKick: choreo.burstKick,
      burstSoftness: choreo.burstSoftness,
      returnEasing: easingByName(choreo.returnEasing),
    }),
    setColor({ to: TRANSPARENT }),  // was onHide
  );

  // ─── Rebuild — swap camera children, re-tick, re-center, re-bind ─────
  const rebuild = (): void => {
    const next = buildScene();
    cameraNode.children.length = 0;
    cameraNode.children.push(next);
    next.parent = cameraNode;
    // First tick computes intrinsic bounds; recenter then a second tick
    // applies the new pan so bindAll sees the centered targets.
    sceneObj.tick(0);
    recenter();
    sceneObj.tick(0);
    sceneObj.bindAll(sg.world.particles, { kind: 'bounds-area' });
    mirror.reconcile();
  };

  // ─── Per-frame: scene tick + choreo tick + mirror reconcile ─────────
  // choreoRunner.tick advances every live pipeline. Without this call,
  // a triggered dissolve sets opacity 0 and the cycle never finishes —
  // mirror stays invisible until rebuild. Consumers MUST wire it.
  let raf = 0;
  let lastT = performance.now();
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    sceneObj.tick(dt);
    choreoRunner.tick(now);
    mirror.reconcile();
  };
  raf = requestAnimationFrame(tick);

  // ─── Public handle ────────────────────────────────────────────────────
  return {
    setProps: (next) => {
      props = { ...props, ...next };
      rebuild();
    },
    setForces: (next) => {
      forces = { ...forces, ...next };
      sg.setFeelOverrides({ ...forces });
    },
    setGlobals: (next) => {
      const prev = globals;
      globals = { ...globals, ...next };
      // Live-tunable: palette + trailAlpha + particleSize via Stage methods.
      if (
        next.hueCenter !== undefined ||
        next.hueRange !== undefined ||
        next.saturation !== undefined ||
        next.lightness !== undefined
      ) {
        sg.setPalette({
          hueCenter: globals.hueCenter,
          hueRange: globals.hueRange,
          sat: globals.saturation,
          lit: globals.lightness,
        });
        // No recolor at rest — palette only matters when particles enter
        // the visible phase via pickColor() during a dissolve. Changing
        // the palette mid-rest would do nothing visible anyway since
        // every particle is currently TRANSPARENT.
      }
      // Particle count change requires a full respawn.
      if (next.particleCount !== undefined && next.particleCount !== prev.particleCount) {
        sg.world.particles.length = 0;
        sg.world.addParticles(
          spawn({
            n: globals.particleCount,
            origin: { kind: 'edge', width: W, height: H },
            color: TRANSPARENT,
            speed: globals.spawnSpeed,
            toward: { x: W / 2, y: H / 2 },
          }),
        );
        sceneObj.bindAll(sg.world.particles, { kind: 'bounds-area' });
        hideAll();
      }
      // particleSize / trailAlpha are renderer opts — Stage doesn't
      // currently re-expose those at runtime. We swallow the change for
      // now and document in the panel (or wire when we extend Stage's
      // surface in a follow-up).
      void cameraOf; // referenced to silence the unused-import lint
    },
    setChoreo: (next) => {
      choreo = { ...choreo, ...next };
      // No rebuild needed — buildDissolvePipeline() reads current state
      // each time triggerDissolve fires.
    },
    triggerDissolve: () => {
      if (!currentComponent) return;
      choreoRunner.run(
        buildDissolvePipeline(),
        groupOfComponent(currentComponent),
        currentComponent,
      );
    },
    setKickMode: (on) => { kickMode = on; },
    getProps: () => ({ ...props }),
    dispose: () => {
      if (raf) cancelAnimationFrame(raf);
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      ro.disconnect();
      canvas.removeEventListener('click', onCanvasClick);
      choreoRunner.dispose();
      mirror.dispose();
      sg.dispose();
    },
  };
};

// ─── Local HSL→RGB ──────────────────────────────────────────────────────────
// Inlined here so the lab doesn't depend on engine internals beyond the
// public surface. Same algorithm as embed.ts's makeColor — kept local so
// future palette tweaks here don't propagate accidentally.
const hslToRgb = (h: number, s: number, l: number): [number, number, number] => {
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
  return [hue2rgb(p, q, h + 1 / 3), hue2rgb(p, q, h), hue2rgb(p, q, h - 1 / 3)];
};
