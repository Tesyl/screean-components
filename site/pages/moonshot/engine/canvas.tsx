// MoonshotCanvas — owns ONE <canvas>, ONE World, ONE Renderer, ONE shared
// particle pool. Provides an imperative React context with the choreography
// primitives the moonshot architecture is built on:
//
//   • dissolve(ref)       — DOM element ⇄ particles ⇄ same DOM element
//   • swap(fromRef, toRef) — DOM element A ⇄ particles ⇄ DOM element B
//   • thwack(x, y, k)     — one-shot impulse on currently-flying particles
//
// Lifted near-verbatim from the html-interop demo state machine
// (src/demos/html-interop/main.tsx). The rest of this file is the same
// machine generalized: parameterized by a "from" silhouette and an
// "into" silhouette (which may be the same element for a self-dissolve).
//
// One transition runs at a time. Concurrent calls return the in-flight
// promise rather than starting a new transition. A future revision will
// allow N elements to dissolve in parallel by slicing the pool; for v1
// we keep the surface narrow so the test demo can prove the lift.

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
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
  type BitmapField,
  type Color,
  type Renderer,
} from 'screean';

// ---- Tunables -------------------------------------------------------------
// Pool peaks during a transition. With one transition at a time at this
// scale, ~6000 reads as a "real" cloud while staying CPU-friendly.
const PARTICLE_COUNT = 6000;

// Phase durations — same as html-interop demo.
const PARTICLE_PHASE_MS = 1400;
const RETURN_MS = 50;
const FADE_MS = 100;
const RETURN_LERP_K = 0.22;

// Dispersal kick on the dissolving frame. Higher = wider diaspora.
const DISPERSE_KICK = 420;

// ---- Color sampling -------------------------------------------------------
// Pulls the rendered DOM element's foreground/background into a small
// palette. Particles inherit the element's actual look — the cloud reads
// AS the component visually, not just spatially.
const samplePalette = (el: HTMLElement): Color[] => {
  const cs = window.getComputedStyle(el);
  const parse = (css: string): Color | null => {
    // Lightweight rgba(...) / rgb(...) parser. Tag stylesheets that compute
    // to keywords ('white', 'transparent') hit fallback below.
    const m = css.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((s) => parseFloat(s.trim()));
    if (parts.length < 3) return null;
    const a = parts[3] === undefined ? 255 : Math.round(parts[3] * 255);
    if (a === 0) return null;
    return packRGBA(parts[0] | 0, parts[1] | 0, parts[2] | 0, 255);
  };
  const colors = [parse(cs.backgroundColor), parse(cs.color)]
    .filter((c): c is Color => c !== null);
  return colors.length ? colors : [packRGBA(230, 230, 240, 255)];
};

// ---- Internal state machine ----------------------------------------------
// Shape mirrors the html-interop demo's union, generalized to carry an
// "into" element. For a self-dissolve, into === from.
type Phase =
  | { kind: 'idle' }
  | { kind: 'dissolving'; since: number; from: HTMLElement; into: HTMLElement; fromField: BitmapField; intoField: BitmapField }
  | { kind: 'particles';  since: number; from: HTMLElement; into: HTMLElement; fromField: BitmapField; intoField: BitmapField }
  | { kind: 'returning';  since: number; from: HTMLElement; into: HTMLElement; fromField: BitmapField; intoField: BitmapField }
  | { kind: 'reforming';  since: number; from: HTMLElement; into: HTMLElement; fromField: BitmapField; intoField: BitmapField };

// ---- Public context shape ------------------------------------------------
type CanvasCtx = {
  // Round-trip a single element.
  readonly dissolve: (el: HTMLElement | null) => Promise<void>;
  // Particles fly from `from` to `into`. Both must be in the DOM and laid
  // out. `into` should be at opacity:0 BEFORE calling — the canvas fades
  // it in during the reform phase.
  readonly swap: (from: HTMLElement | null, into: HTMLElement | null) => Promise<void>;
  // Kick all live particles outward from (x, y). Useful for "submit pulse"
  // moments while particles are already in flight; no-op when idle.
  readonly thwack: (x: number, y: number, strength?: number) => void;
};

const Ctx = createContext<CanvasCtx | null>(null);

export const useCanvas = (): CanvasCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCanvas must be inside <MoonshotCanvas>');
  return c;
};

// ---- Provider -------------------------------------------------------------
type Props = { readonly children: ReactNode };

export const MoonshotCanvas = ({ children }: Props): ReactNode => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<World | null>(null);
  const rendererRef = useRef<Renderer | null>(null);

  const phaseRef = useRef<Phase>({ kind: 'idle' });
  const paletteRef = useRef<Color[]>([packRGBA(230, 230, 240, 255)]);
  // Pointer attraction is gated off during structured phases (returning,
  // reforming) so the cursor doesn't pull particles off-target. The flag
  // wraps the pointer source the pointForce reads from.
  const pointerEnabledRef = useRef(true);

  // Resolver for the in-flight transition promise. Per-call so each
  // dissolve/swap awaits its own completion.
  const resolveRef = useRef<(() => void) | null>(null);

  const [ready, setReady] = useState(false);

  // ---- Boot the engine on mount -----------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const measure = () => {
      const r = canvas.getBoundingClientRect();
      return { w: Math.max(320, Math.floor(r.width)), h: Math.max(360, Math.floor(r.height)) };
    };
    const v0 = measure();

    const f = feels.taut;
    const pointer = pointerSensor(window);
    const world = new World({ width: v0.w, height: v0.h, hashCellSize: f.hashCellSize });
    world.setForces([
      spring(f.springK, f.springC),
      drag(f.drag),
      shimmer(f.shimmerAmp, f.shimmerFreq),
      neighborRepel(f.repelRadius, f.repelStrength),
      pointForce(
        () => (pointerEnabledRef.current ? pointer.getPoint() : null),
        f.pointerAttract,
        80,
      ),
    ]);

    const renderer = createRenderer({
      canvas,
      backend: 'auto',
      portalMode: true,
      particleSize: 0.8,
      trailAlpha: 0.22,
      fadeWindow: 0.35,
      onFallback: (err) => console.warn('[moonshot] WebGL2 unavailable:', err.message),
    });
    renderer.resize(v0.w, v0.h);

    worldRef.current = world;
    rendererRef.current = renderer;
    setReady(true);

    const ro = new ResizeObserver(() => {
      const v = measure();
      world.resize(v.w, v.h);
      renderer.resize(v.w, v.h);
    });
    ro.observe(canvas);

    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      // Clamp dt — without this, a single slow frame (>50ms) compounds
      // catastrophically with the stiff spring (K=140 in feels.taut). At
      // dt=1, force*dt sends particles to NaN coordinates and the tab
      // freezes. 0.05 = 20fps floor; below that we accept slowdown over
      // explosion.
      const dt = Math.min(0.05, (now - last) / 1000);
      last = now;
      tick(now, dt);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      world.particles.length = 0;
      worldRef.current = null;
      rendererRef.current = null;
    };
  }, []);

  // ---- Per-frame state machine -------------------------------------------
  const tick = (now: number, dt: number): void => {
    const world = worldRef.current;
    const renderer = rendererRef.current;
    if (!world || !renderer) return;

    const phase = phaseRef.current;

    // Physics runs only when the cloud is meant to be free (idle does
    // nothing because pool is empty; dissolving + particles let physics
    // run; returning + reforming write positions directly so physics is
    // suspended).
    if (phase.kind === 'idle' || phase.kind === 'dissolving' || phase.kind === 'particles') {
      world.tick(dt);
    }

    if (phase.kind === 'dissolving') {
      // Single tick to let the radial impulse integrate, then free physics.
      if (now - phase.since > 16) {
        phaseRef.current = { ...phase, kind: 'particles', since: now };
      }
    } else if (phase.kind === 'particles') {
      if (now - phase.since > PARTICLE_PHASE_MS) {
        // Disable pointer attraction so the cursor doesn't hijack the
        // structured snap-back. Targets are already set on INTO from
        // beginTransition (spring physics carried particles across during
        // the particle phase), so we go straight to lerp+pin.
        pointerEnabledRef.current = false;
        phaseRef.current = { ...phase, kind: 'returning', since: now };
      }
    } else if (phase.kind === 'returning') {
      const k = RETURN_LERP_K;
      for (const p of world.particles) {
        p.x += (p.tx - p.x) * k;
        p.y += (p.ty - p.y) * k;
        p.vx = 0; p.vy = 0;
      }
      if (now - phase.since >= RETURN_MS) {
        for (const p of world.particles) {
          p.x = p.tx; p.y = p.ty;
        }
        phaseRef.current = { ...phase, kind: 'reforming', since: now };
      }
    } else if (phase.kind === 'reforming') {
      const t = Math.min(1, (now - phase.since) / FADE_MS);
      // Fade INTO element in over the pinned silhouette.
      phase.into.style.opacity = String(t);
      // Hold particles pinned.
      for (const p of world.particles) {
        p.x = p.tx; p.y = p.ty;
      }
      if (t >= 1) {
        // Cleanup: clear particles, restore INTO interactivity, reset.
        world.particles.length = 0;
        phase.into.style.opacity = '1';
        phase.into.style.pointerEvents = 'auto';
        phaseRef.current = { kind: 'idle' };
        pointerEnabledRef.current = true;
        const resolve = resolveRef.current;
        resolveRef.current = null;
        resolve?.();
      }
    }

    renderer.draw(world.particles, world.width, world.height);
  };

  // ---- Internals --------------------------------------------------------
  // Run the dissolve+swap state machine. `from` and `into` may be the
  // same element (self-dissolve) or different (swap). Returns when the
  // INTO element is fully reformed and interactive.
  const beginTransition = async (from: HTMLElement, into: HTMLElement): Promise<void> => {
    const world = worldRef.current;
    if (!world) return;
    if (phaseRef.current.kind !== 'idle') {
      // Concurrent call — wait for the in-flight transition to finish
      // before starting this one. Simpler than queueing for the test demo.
      await new Promise<void>((resolve) => {
        const prev = resolveRef.current;
        resolveRef.current = () => {
          prev?.();
          resolve();
        };
      });
    }

    if (document.fonts && 'ready' in document.fonts) await document.fonts.ready;

    let fromField: BitmapField;
    let intoField: BitmapField;
    try {
      const fromResult = await bitmapFieldFromElement({
        element: from,
        strategy: 'foreignObject',
        alphaThreshold: 20,
      });
      fromField = fromResult.field;
      if (into === from) {
        intoField = fromField;
      } else {
        // INTO may be at opacity:0 (the destination button starts hidden so
        // it doesn't visually compete with FROM at rest). foreignObject
        // rasterization respects opacity → an invisible element produces
        // an empty mask → field.sample() returns no points → spring targets
        // collapse to FROM and the cycle stalls.
        //
        // Temporarily make INTO opaque for the rasterization, then restore.
        // The element is already pointer-events:none, so the user can't
        // click it during this brief blip.
        const prevOpacity = into.style.opacity;
        const prevVisibility = into.style.visibility;
        into.style.opacity = '1';
        into.style.visibility = 'visible';
        try {
          const intoResult = await bitmapFieldFromElement({
            element: into,
            strategy: 'foreignObject',
            alphaThreshold: 20,
          });
          intoField = intoResult.field;
        } finally {
          into.style.opacity = prevOpacity;
          into.style.visibility = prevVisibility;
        }
      }
    } catch (err) {
      console.error('[moonshot] rasterize failed:', err);
      return;
    }

    paletteRef.current = samplePalette(from);

    const fromRect = from.getBoundingClientRect();
    const cx = fromRect.left + fromRect.width / 2;
    const cy = fromRect.top + fromRect.height / 2;

    // Spawn the pool: position particles AT the FROM silhouette (frame one
    // IS the FROM element) but TARGET them at the INTO silhouette. Spring
    // physics in feels.taut will carry them across during the `particles`
    // phase. For self-dissolve, intoField === fromField → start IS target.
    //
    // We sample BOTH fields with the same N so the per-index pairing is
    // stable: particle i starts at fromTargets[i] and ends at intoTargets[i].
    // The mapping is bitmap-to-bitmap pixel order, which produces a coherent
    // morph rather than a chaotic shuffle.
    world.particles.length = 0;
    world.addParticles(
      spawn({
        n: PARTICLE_COUNT,
        origin: { kind: 'point', x: cx, y: cy },
        color: TRANSPARENT,
        speed: 0,
      }),
    );
    const fromTargets = fromField.sample(world.particles.length);
    const intoTargets = into === from ? fromTargets : intoField.sample(world.particles.length);
    const palette = paletteRef.current;
    for (let i = 0; i < world.particles.length; i++) {
      const p = world.particles[i];
      const [sx, sy] = fromTargets[i] ?? [cx, cy];
      const [tx, ty] = intoTargets[i] ?? [sx, sy];
      p.x = sx; p.y = sy;
      p.tx = tx; p.ty = ty;
      p.vx = 0; p.vy = 0;
      p.color = palette[(Math.random() * palette.length) | 0];
      p.weight = 1;
    }

    // Fire dispersal impulse + hide FROM element. (FROM and INTO may be the
    // same element; that's the self-dissolve case.)
    radialImpulse(world.particles, { origin: { x: cx, y: cy }, kick: DISPERSE_KICK });
    from.style.opacity = '0';
    from.style.pointerEvents = 'none';
    if (into !== from) {
      // INTO will be faded in during reform; ensure it's invisible AND
      // non-interactive until then so clicks don't fire on a ghost.
      into.style.pointerEvents = 'none';
    }

    return new Promise<void>((resolve) => {
      resolveRef.current = resolve;
      phaseRef.current = {
        kind: 'dissolving',
        since: performance.now(),
        from,
        into,
        fromField,
        intoField,
      };
    });
  };

  // ---- Public API -------------------------------------------------------
  const api = useMemo<CanvasCtx>(() => ({
    dissolve: async (el) => {
      if (!el || !ready) return;
      await beginTransition(el, el);
    },
    swap: async (from, into) => {
      if (!from || !into || !ready) return;
      await beginTransition(from, into);
    },
    thwack: (x, y, strength = 600) => {
      const world = worldRef.current;
      if (!world) return;
      for (const p of world.particles) {
        if (p.life <= 0) continue;
        const dx = p.x - x;
        const dy = p.y - y;
        const d = Math.hypot(dx, dy) + 0.001;
        const k = strength / (d + 60);
        p.vx += (dx / d) * k;
        p.vy += (dy / d) * k;
      }
    },
    // beginTransition is intentionally NOT in deps — it closes over refs only,
    // so its reference stability across renders doesn't matter here. The
    // exhaustive-deps lint would flag it; we accept that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [ready]);

  return (
    <Ctx.Provider value={api}>
      <canvas ref={canvasRef} className="moonshot-canvas" aria-hidden="true" />
      {children}
    </Ctx.Provider>
  );
};
