// createScreenController — the framework-agnostic ScreenProvider.
//
// Owns ONE World, ONE Renderer, ONE (optional) rAF over a consumer-supplied
// overlay canvas, and runs the four-frame machine (machine.ts). This is the
// single dissolve/swap engine the DECISION mandates; React's ScreenProvider
// and every demo state machine collapse onto it.
//
// Lifecycle contract:
//   - `dissolve`/`swap` resolve when the cycle settles back to idle.
//   - Concurrent transition calls CHAIN: a second call awaits the in-flight
//     cycle before rasterizing (rasterizing mid-flight would capture the
//     hidden, opacity:0 element — an empty mask).
//   - Pointer attraction is gated OFF during returning/reforming so the
//     cursor can't pull particles off-target during the snap-back.
//   - `dispose` cancels the owned loop and empties the particle pool;
//     in-flight promises resolve (never leak awaiting callers).

import {
  World,
  bitmapFieldFromElement,
  createRenderer,
  drag,
  feels,
  neighborRepel,
  pointForce,
  pointerSensor,
  radialImpulse,
  spawn,
  spring,
  shimmer,
  TRANSPARENT,
  type BitmapField,
} from '@tesyl/screean';
import {
  DEFAULT_ALPHA_THRESHOLD,
  DEFAULT_DISPERSE_KICK,
  DEFAULT_FEEL,
  DEFAULT_PARTICLE_COUNT,
  DEFAULT_PARTICLE_PHASE_MS,
  DEFAULT_THWACK_STRENGTH,
  FADE_MS,
  MAX_DT_SECONDS,
  RENDERER_FADE_WINDOW,
  RENDERER_PARTICLE_SIZE,
  RENDERER_TRAIL_ALPHA,
} from './constant';
import { applyTransitionFrame, PHYSICS_ACTIVE } from './machine';
import { pickFromPalette, resolveParticlePalette } from './palette';
import type {
  ScreenController,
  ScreenControllerOpts,
  TransitionPhase,
} from './types';

// ScreenProvider's historical floor — guards the viewport-overlay deployment
// against zero-size measurement during boot. Tile canvases pass `minView`.
const DEFAULT_MIN_VIEW = { w: 320, h: 360 } as const;

// Default anchor: the element's viewport rect — correct when the canvas IS
// the viewport overlay. Canvas-local deployments override via `originOf`.
const viewportOrigin = (el: HTMLElement): { x: number; y: number } => {
  const r = el.getBoundingClientRect();
  return { x: r.left, y: r.top };
};

export const createScreenController = (
  opts: ScreenControllerOpts,
): ScreenController => {
  const { canvas } = opts;
  const feel = { ...feels[opts.feel ?? DEFAULT_FEEL], ...opts.feelOverrides };
  const ownLoop = opts.ownLoop ?? true;
  const originOf = opts.originOf ?? viewportOrigin;
  const minView = opts.minView ?? DEFAULT_MIN_VIEW;

  // Live tunables — re-read each cycle so consumers can adjust without
  // re-booting the engine.
  const tuning = {
    particleCount: opts.particleCount ?? DEFAULT_PARTICLE_COUNT,
    particlePhaseMs: opts.particlePhaseMs ?? DEFAULT_PARTICLE_PHASE_MS,
    disperseKick: opts.disperseKick ?? DEFAULT_DISPERSE_KICK,
    fadeMs: opts.fadeMs ?? FADE_MS,
  };

  const measure = () => {
    const r = canvas.getBoundingClientRect();
    return {
      w: Math.max(minView.w, Math.floor(r.width)),
      h: Math.max(minView.h, Math.floor(r.height)),
    };
  };
  const v0 = measure();

  // Pointer attraction is gated by phase (see header).
  let pointerEnabled = true;
  const pointer = pointerSensor(window);

  const world = new World({
    width: v0.w,
    height: v0.h,
    hashCellSize: feel.hashCellSize,
  });
  world.setForces([
    spring(feel.springK, feel.springC),
    drag(feel.drag),
    shimmer(feel.shimmerAmp, feel.shimmerFreq),
    neighborRepel(feel.repelRadius, feel.repelStrength),
    pointForce(
      () => (pointerEnabled ? pointer.getPoint() : null),
      feel.pointerAttract,
      80,
    ),
  ]);

  const renderer = createRenderer({
    canvas,
    backend: 'auto',
    portalMode: true,
    particleSize: RENDERER_PARTICLE_SIZE,
    trailAlpha: RENDERER_TRAIL_ALPHA,
    fadeWindow: RENDERER_FADE_WINDOW,
    onFallback: (err) =>
      console.warn('[screean transition] WebGL2 unavailable:', err.message),
  });
  renderer.resize(v0.w, v0.h);

  const ro = new ResizeObserver(() => {
    const v = measure();
    world.resize(v.w, v.h);
    renderer.resize(v.w, v.h);
  });
  ro.observe(canvas);

  let phase: TransitionPhase = { kind: 'idle' };
  let resolveSettled: (() => void) | null = null;
  let disposed = false;

  // ── Per-frame ────────────────────────────────────────────────────────────
  let last = performance.now();
  const tick = (now: number): void => {
    if (disposed) return;
    const dt = Math.min(MAX_DT_SECONDS, (now - last) / 1000);
    last = now;

    if (PHYSICS_ACTIVE[phase.kind]) world.tick(dt);

    const wasReturningOrLater = phase.kind === 'returning' || phase.kind === 'reforming';
    const result = applyTransitionFrame(phase, world, now, tuning);
    phase = result.phase;

    // Gate pointer attract off the moment we enter the deterministic phases,
    // back on at settle.
    const isReturningOrLater = phase.kind === 'returning' || phase.kind === 'reforming';
    if (isReturningOrLater && !wasReturningOrLater) pointerEnabled = false;

    if (result.settled) {
      pointerEnabled = true;
      const resolve = resolveSettled;
      resolveSettled = null;
      resolve?.();
    }

    renderer.draw(world.particles, world.width, world.height);
  };

  let raf = 0;
  if (ownLoop) {
    const loop = (now: number) => {
      raf = requestAnimationFrame(loop);
      tick(now);
    };
    raf = requestAnimationFrame(loop);
  }

  // ── Rasterize on demand ─────────────────────────────────────────────────
  const fieldOf = async (el: HTMLElement): Promise<BitmapField> => {
    if (document.fonts && 'ready' in document.fonts) await document.fonts.ready;
    const { field } = await bitmapFieldFromElement({
      element: el,
      strategy: 'foreignObject',
      alphaThreshold: DEFAULT_ALPHA_THRESHOLD,
      // Anchor sample coords in the controller's canvas space.
      origin: originOf(el),
    });
    return field;
  };

  // Rasterize `into` even when it's pre-hidden for a swap: flip it visible
  // just for capture, then restore. It's pointer-events:none during the
  // cycle so the user can't click the ghost.
  const fieldOfHidden = async (el: HTMLElement): Promise<BitmapField> => {
    const prevOpacity = el.style.opacity;
    const prevVisibility = el.style.visibility;
    el.style.opacity = '1';
    el.style.visibility = 'visible';
    try {
      return await fieldOf(el);
    } finally {
      el.style.opacity = prevOpacity;
      el.style.visibility = prevVisibility;
    }
  };

  // ── The dissolve+swap machine entry (from === into for self-dissolve) ───
  const beginTransition = async (
    from: HTMLElement,
    into: HTMLElement,
  ): Promise<void> => {
    if (disposed) return;

    if (phase.kind !== 'idle') {
      // Chain onto the in-flight transition's resolver.
      await new Promise<void>((resolve) => {
        const prev = resolveSettled;
        resolveSettled = () => {
          prev?.();
          resolve();
        };
      });
      if (disposed) return;
    }

    let fromField: BitmapField;
    let intoField: BitmapField;
    try {
      fromField = await fieldOf(from);
      intoField = into === from ? fromField : await fieldOfHidden(into);
    } catch (err) {
      console.error('[screean transition] rasterize failed:', err);
      return;
    }

    const palette = resolveParticlePalette(from);

    // Center in CANVAS coordinates — same space as the rasterized targets.
    const fromRect = from.getBoundingClientRect();
    const fromOrigin = originOf(from);
    const cx = fromOrigin.x + fromRect.width / 2;
    const cy = fromOrigin.y + fromRect.height / 2;

    // Spawn AT the FROM silhouette, TARGET the INTO silhouette. Spring
    // physics carries them across during `particles`. Same N for both so the
    // per-index pairing (bitmap pixel order) yields a coherent morph.
    world.particles.length = 0;
    world.addParticles(
      spawn({
        n: tuning.particleCount,
        origin: { kind: 'point', x: cx, y: cy },
        color: TRANSPARENT,
        speed: 0,
      }),
    );
    const fromTargets = fromField.sample(world.particles.length);
    const intoTargets =
      into === from ? fromTargets : intoField.sample(world.particles.length);
    for (let i = 0; i < world.particles.length; i++) {
      const p = world.particles[i];
      const [sx, sy] = fromTargets[i] ?? [cx, cy];
      const [tx, ty] = intoTargets[i] ?? [sx, sy];
      p.x = sx;
      p.y = sy;
      p.tx = tx;
      p.ty = ty;
      p.vx = 0;
      p.vy = 0;
      p.color = pickFromPalette(palette);
      p.weight = 1;
    }

    radialImpulse(world.particles, {
      origin: { x: cx, y: cy },
      kick: tuning.disperseKick,
    });
    from.style.opacity = '0';
    from.style.pointerEvents = 'none';
    if (into !== from) into.style.pointerEvents = 'none';

    return new Promise<void>((resolve) => {
      resolveSettled = resolve;
      phase = { kind: 'dissolving', since: performance.now(), from, into };
    });
  };

  return {
    dissolve: async (el) => {
      if (!el) return;
      await beginTransition(el, el);
    },
    swap: async (from, into) => {
      if (!from || !into) return;
      await beginTransition(from, into);
    },
    thwack: (x, y, strength = DEFAULT_THWACK_STRENGTH) => {
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
    fieldOf,
    tick,
    phase: () => phase.kind,
    world: () => world,
    dispose: () => {
      disposed = true;
      if (ownLoop) cancelAnimationFrame(raf);
      ro.disconnect();
      world.particles.length = 0;
      const resolve = resolveSettled;
      resolveSettled = null;
      resolve?.();
    },
  };
};
