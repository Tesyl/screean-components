// MoonshotCanvas — owns ONE <canvas>, ONE World, ONE Renderer, ONE camera,
// ONE shared particle pool. Provides a React context that exposes:
//
//   • viewport (live size; subscribe via the returned hook)
//   • pointer (live snapshot in canvas-local coordinates)
//   • setSceneSpec(spec) — submit the screen's current scene; the canvas
//     diffs against the previous spec and either soft-rebinds (same screen,
//     different revision) or runs a hard transition (different screen).
//
// Why we don't reuse Stage from embed.ts: Stage is a vanilla-TS adapter
// that defaults to one-scene-at-a-time and assumes spawn-from-edge dramatic
// boots. The moonshot needs explicit transition control, a single pool
// sized to max() across all screens, and React-friendly lifecycle. We use
// the underlying engine primitives directly.

import {
  createContext,
  useContext,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import {
  World,
  spring,
  drag,
  shimmer,
  neighborRepel,
  pointForce,
  spawn,
  dismiss,
  scene,
  camera,
  createRenderer,
  feels,
  packRGBA,
  TRANSPARENT,
  hslToRgb,
  type Renderer,
  type Force,
  type Color,
  type Scene as SceneType,
} from 'screean';
import { PALETTES, POOL_SIZE, TRANSITION_MS } from '../constant';
import type { PointerXY, SceneSpec, Viewport } from './types';

// ---- Context shape --------------------------------------------------------
type CanvasCtx = {
  readonly viewport: Viewport;
  readonly getPointer: () => PointerXY;
  readonly setSceneSpec: (spec: SceneSpec) => void;
  // Issue a one-shot impulse without rebuilding the scene. Used by submit
  // buttons and other "thwack" moments.
  readonly impulse: (cx: number, cy: number, strength?: number) => void;
};

const Ctx = createContext<CanvasCtx | null>(null);

export const useCanvas = (): CanvasCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCanvas must be inside <MoonshotCanvas>');
  return c;
};

// ---- Color sampler --------------------------------------------------------
// Returns a fresh sampler bound to a palette. Particles take a color from
// the band on bind. Re-sampling on screen change keeps each screen visually
// distinct without flipping a global theme variable.
type PaletteName = keyof typeof PALETTES;

const makeSampler = (name: PaletteName): (() => Color) => {
  const p = PALETTES[name];
  return () => {
    const h = (((p.hueCenter + (Math.random() - 0.5) * p.hueRange) + 360) % 360) / 360;
    const [r, g, b] = hslToRgb(h, p.sat, p.lit);
    return packRGBA((r * 255) | 0, (g * 255) | 0, (b * 255) | 0, 255);
  };
};

// Per-screen palette mapping. Atlas + horizon = amber; signal = warmer.
// Centralized so a screen's "color of voice" lives next to its other knobs.
const SCREEN_PALETTE: Record<SceneSpec['screen'], PaletteName> = {
  horizon: 'amber',
  atlas:   'amber',
  signal:  'signal',
};

// ---- Provider -------------------------------------------------------------
type ProviderProps = { readonly children: ReactNode };

export const MoonshotCanvas = ({ children }: ProviderProps): ReactNode => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const rendererRef = useRef<Renderer | null>(null);
  const sceneRef = useRef<SceneType | null>(null);
  const specRef = useRef<SceneSpec | null>(null);
  const samplerRef = useRef<() => Color>(makeSampler('amber'));
  const pointerRef = useRef<PointerXY>(null);
  const [viewport, setViewport] = useState<Viewport>({ w: 0, h: 0 });

  // ---- Boot the engine on mount ------------------------------------------
  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = (): Viewport => {
      const r = canvas.getBoundingClientRect();
      return { w: Math.max(320, Math.floor(r.width)), h: Math.max(360, Math.floor(r.height)) };
    };

    const v0 = measure();
    setViewport(v0);

    const world = new World({ width: v0.w, height: v0.h, hashCellSize: 6 });
    const renderer = createRenderer({
      canvas,
      backend: 'auto',
      particleSize: 1.2,
      // No trails — clears each frame. Trails smear small text into a blur,
      // which kills legibility for sub-30px chrome. Big text reads fine
      // because strokes are wide enough to absorb a frame's residue, but
      // we'd rather lose the trail effect than the type.
      trailAlpha: 0,
      // Portal mode — let the cosmographic CSS background bleed through
      // between particles. Without this the canvas paints solid black.
      portalMode: true,
      fadeWindow: 0.45,
    });
    renderer.resize(v0.w, v0.h);

    // Force preset baseline — the magnetic feel reads as a "matter" cloud
    // at hero scale; we'll layer pointer attraction on top.
    const f = feels.crisp;
    const forces: Force[] = [
      spring(f.springK, f.springC),
      drag(f.drag),
      shimmer(f.shimmerAmp * 0.6, f.shimmerFreq),  // a little less twinkle
      neighborRepel(f.repelRadius, f.repelStrength),
      pointForce(() => pointerRef.current, 3200, 90),
    ];
    world.setForces(forces);

    worldRef.current = world;
    rendererRef.current = renderer;

    // ---- Resize ---------------------------------------------------------
    const ro = new ResizeObserver(() => {
      const v = measure();
      setViewport(v);
      world.resize(v.w, v.h);
      renderer.resize(v.w, v.h);
      // Rebuild current scene against new size so layout reflows.
      const spec = specRef.current;
      if (spec) bindSpec(spec, /* fresh */ false);
    });
    ro.observe(canvas);

    // ---- Pointer --------------------------------------------------------
    const onMove = (e: PointerEvent) => {
      const r = canvas.getBoundingClientRect();
      pointerRef.current = { x: e.clientX - r.left, y: e.clientY - r.top };
    };
    const onLeave = () => { pointerRef.current = null; };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerleave', onLeave);

    // ---- RAF loop -------------------------------------------------------
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      sceneRef.current?.tick(dt);
      world.tick(dt);
      renderer.draw(world.particles, world.width, world.height);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerleave', onLeave);
      world.particles.length = 0;
      worldRef.current = null;
      rendererRef.current = null;
      sceneRef.current = null;
      specRef.current = null;
    };
  }, []);

  // ---- Scene application -------------------------------------------------
  // `fresh = true` → spawn from edges (cross-screen transition, also first
  // mount). `fresh = false` → soft re-bind, keep particle positions but
  // re-target them at the new field.
  const bindSpec = (spec: SceneSpec, fresh: boolean): void => {
    const world = worldRef.current;
    const canvas = canvasRef.current;
    if (!world || !canvas) return;
    const r = canvas.getBoundingClientRect();
    const w = Math.max(320, Math.floor(r.width));
    const h = Math.max(360, Math.floor(r.height));

    const tree = spec.build(w, h);
    // Auto-center: pan the camera so the content's bounds land at the
    // viewport center. Layout primitives populate `intrinsic` during
    // construction, so this is available immediately.
    const intr = tree.intrinsic ?? { x: 0, y: 0, w: 0, h: 0 };
    const panX = (w - intr.w) / 2 - intr.x;
    const panY = (h - intr.h) / 2 - intr.y;
    const wrapped = camera({ viewport: { w, h }, pan: [panX, panY], zoom: 1 }, tree);
    const sc = scene({ particleCount: POOL_SIZE }, wrapped);

    sceneRef.current = sc;
    specRef.current = spec;

    if (fresh) {
      // Repopulate the pool from canvas edges flying inward.
      world.particles.length = 0;
      world.addParticles(
        spawn({
          n: POOL_SIZE,
          origin: { kind: 'edge', width: w, height: h },
          color: TRANSPARENT,
          speed: 420,
          toward: { x: w / 2, y: h / 2 },
        }),
      );
    }

    sc.tick(0);
    // `bounds-area`: big text gets more particles, small text gets fewer.
    // For text rasterization this is exactly what we want — a glyph stroke
    // 2px wide oversaturates with too many particles (smudge); a glyph
    // 30px wide is sparse without enough. Now that screen builders only
    // emit a few well-sized leaves (chrome moved to DOM), the area-based
    // ratio reads naturally.
    sc.bindAll(world.particles, { kind: 'bounds-area' });

    // Recolor — fresh transitions get a full repaint; soft re-binds only
    // recolor newly-bound (currently colorless) particles so the existing
    // cloud doesn't shimmer-shift.
    const sampler = samplerRef.current;
    for (const p of world.particles) {
      if (fresh || p.color === TRANSPARENT) {
        p.color = sampler();
      }
    }
  };

  // ---- Public API --------------------------------------------------------
  const api = useMemo<CanvasCtx>(() => ({
    viewport,
    getPointer: () => pointerRef.current,
    setSceneSpec: (spec: SceneSpec) => {
      const prev = specRef.current;
      const isFirst = prev === null;
      const isCrossScreen = prev !== null && prev.screen !== spec.screen;
      const isSameRevision = prev !== null && prev.screen === spec.screen && prev.revision === spec.revision;
      if (isSameRevision) return;

      if (isCrossScreen) {
        // Hard transition: dismiss outgoing → on next tick, bind incoming.
        const world = worldRef.current;
        const canvas = canvasRef.current;
        if (!world || !canvas) return;
        const r = canvas.getBoundingClientRect();
        // Dispersal pushes particles outward from screen center; they age
        // out via the dismiss life decay. After the configured stagger we
        // bind the incoming scene fresh — that resets life, so dispersing
        // particles smoothly become incoming particles mid-flight.
        dismiss(world.particles, {
          center: { x: r.width / 2, y: r.height / 2 },
          impulse: 700,
          life: TRANSITION_MS.dismiss / 1000,
        });
        // Switch palette mid-air so the new cloud reads as a different voice.
        samplerRef.current = makeSampler(SCREEN_PALETTE[spec.screen]);
        window.setTimeout(() => {
          bindSpec(spec, /* fresh */ true);
        }, TRANSITION_MS.stagger);
      } else if (isFirst) {
        samplerRef.current = makeSampler(SCREEN_PALETTE[spec.screen]);
        bindSpec(spec, /* fresh */ true);
      } else {
        // Same screen, new revision — soft re-bind, no dispersal.
        bindSpec(spec, /* fresh */ false);
      }
    },
    impulse: (cx: number, cy: number, strength = 600) => {
      const world = worldRef.current;
      if (!world) return;
      // Light dispersal at the click point. We DON'T re-bind here — the
      // physics will pull particles back to their scene targets via spring,
      // so the impulse reads as a "thwack" that recovers.
      for (const p of world.particles) {
        if (p.life <= 0) continue;
        const dx = p.x - cx;
        const dy = p.y - cy;
        const d = Math.hypot(dx, dy) + 0.001;
        const k = strength / (d + 60);
        p.vx += (dx / d) * k;
        p.vy += (dy / d) * k;
      }
    },
  }), [viewport]);

  return (
    <Ctx.Provider value={api}>
      <canvas ref={canvasRef} className="moonshot-canvas" aria-hidden="true" />
      {children}
    </Ctx.Provider>
  );
};
