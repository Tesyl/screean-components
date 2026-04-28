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
  type SceneNode,
  type Easing,
} from 'screean';
import {
  createDissolve,
  createDomMirror,
  type Dissolve,
  type DomMirror,
  type ComponentEvent,
} from '../../src/components';

import { Stage } from '../embed';
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
    portal: false,
    particleSize: globals.particleSize,
    trailAlpha: globals.trailAlpha,
  });

  // Inline activation wrapper: each component's onClick / onChange also
  // fires dissolve.trigger. The story's build() returns a component
  // without any click handler; we install our wrapped one here, after
  // the dissolve instance exists (via the closure access below).
  const activate = (e: ComponentEvent): void => {
    // dissolve might be null briefly during recreate; guard.
    if (dissolve) dissolve.trigger(e.component);
  };

  // The story's build() receives `activate` as its onActivate arg. The
  // story wires it to the component's interactive opt (onClick / onChange).
  // Each user click on the live component fires dissolve via the same path,
  // so the choreography is consistent across every component type.
  const buildScene = (): SceneNode => story.build(props, activate);

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
  sceneObj.bindAll(sg.world.particles, { kind: 'bounds-area' });

  // Default-color the cloud from the palette so particles are visible at rest.
  const colorAll = (): void => {
    const { hueCenter, hueRange, saturation, lightness } = globals;
    for (const p of sg.world.particles) {
      const h = (((hueCenter + (Math.random() - 0.5) * hueRange) + 360) % 360) / 360;
      const [r, g, b] = hslToRgb(h, saturation, lightness);
      p.color = packRGBA((r * 255) | 0, (g * 255) | 0, (b * 255) | 0, 255);
    }
  };
  colorAll();

  // ─── DOM mirror + dissolve ────────────────────────────────────────────
  const mirror: DomMirror = createDomMirror({ scene: sceneObj, host: mirrorHost });
  mirror.reconcile();

  let dissolve: Dissolve = createDissolve({
    scene: sceneObj,
    particles: sg.world.particles,
    mirrorHost,
    onReveal: () => {},
    onHide: () => {
      // Re-color any particles that drifted to TRANSPARENT during the
      // cycle — the lab keeps the cloud visible at rest.
      colorAll();
    },
    particlePhaseMs: choreo.particlePhaseMs,
    returnMs: choreo.returnMs,
    fadeMs: choreo.fadeMs,
    burstKick: choreo.burstKick,
    burstSoftness: choreo.burstSoftness,
    returnEasing: easingByName(choreo.returnEasing),
  });

  // ─── Rebuild — swap camera children, re-tick, re-bind ─────────────────
  const rebuild = (): void => {
    const next = buildScene();
    cameraNode.children.length = 0;
    cameraNode.children.push(next);
    next.parent = cameraNode;
    sceneObj.tick(0);
    sceneObj.bindAll(sg.world.particles, { kind: 'bounds-area' });
    mirror.reconcile();
  };

  // ─── Per-frame: scene tick + mirror reconcile ─────────────────────────
  let raf = 0;
  let lastT = performance.now();
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    sceneObj.tick(dt);
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
        colorAll();
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
        colorAll();
      }
      // particleSize / trailAlpha are renderer opts — Stage doesn't
      // currently re-expose those at runtime. We swallow the change for
      // now and document in the panel (or wire when we extend Stage's
      // surface in a follow-up).
      void cameraOf; // referenced to silence the unused-import lint
    },
    setChoreo: (next) => {
      choreo = { ...choreo, ...next };
      dissolve.dispose();
      dissolve = createDissolve({
        scene: sceneObj,
        particles: sg.world.particles,
        mirrorHost,
        onReveal: () => {},
        onHide: () => colorAll(),
        particlePhaseMs: choreo.particlePhaseMs,
        returnMs: choreo.returnMs,
        fadeMs: choreo.fadeMs,
        burstKick: choreo.burstKick,
        burstSoftness: choreo.burstSoftness,
        returnEasing: easingByName(choreo.returnEasing),
      });
    },
    getProps: () => ({ ...props }),
    dispose: () => {
      if (raf) cancelAnimationFrame(raf);
      dissolve.dispose();
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
