// componentReel — the "live DOM ↔ particles" tile pattern, packaged as a
// callable. Implements Phase 3a (see docs/RFC-html-in-canvas-interop.md):
// the real DOM element stays in the canvas slot the whole time; on each
// dissolve cycle it rasterizes into a BitmapField, hides via opacity, and
// the particles bound to that field render the visual until they reform.
//
// Why this lives in site/lib/ and not site/stories/: it's a substrate
// every component tile (button, card, toggle, future) calls. Stories
// stay declarative — "build this DOM element, hand it to componentReel."
//
// Phase machine:
//
//   idle      ─▶  rasterize ─▶  particles ─▶  fading ─▶  idle
//                      ▲                                    │
//                      └─── click on element / auto-loop ───┘
//
// The caller's responsibility: provide a `buildElement` factory that
// returns a fully inline-styled HTMLElement (no `var(--…)` lookups —
// they don't survive the foreignObject SVG context the rasterizer
// uses). The helper handles everything else: positioning, mounting,
// click wiring, rasterize, particle spawn-snap-kick, drift timer,
// reform fade, cleanup.

import type { FeelName, ThemeId } from '../../themes';
import { THEMES, type ThemeTokens } from '../../themes';
import { Stage } from '../../embed';
import { tileStage } from '../../stories/types';
import { bitmapFieldFromElement } from '@tesyl/screean';
import { radialImpulse } from '@tesyl/screean';
import { spawn } from '@tesyl/screean';
import { node } from '@tesyl/screean';
import { TRANSPARENT } from '@tesyl/screean';
import type { FeelPreset } from '@tesyl/screean';

// Defaults match the button tile's tuned values. Each component can
// override per-call if it wants a different cadence (e.g. a slower
// dissolve for a card with denser visuals).
const DEFAULT_DRIFT_MS = 2400;
const DEFAULT_FADE_MS = 300;
const DEFAULT_IDLE_MS = 2400;
const DEFAULT_KICK = 520;
const DEFAULT_PARTICLE_COUNT = 1600;
const DEFAULT_FEEL_OVERRIDES: Partial<FeelPreset> = {
  springK: 32,
  springC: 5,
  drag: 0.45,
  shimmerAmp: 16,
  // The boundary fidelity dial: for components, the field's edge IS
  // the visual identity, so the resting cloud must NOT push past it.
  //
  // Strategy:
  //   • repelRadius can stay generous (10) — the radius is the search
  //     neighborhood; with zero strength it's free.
  //   • repelStrength settles to 0 — at rest, particles don't push
  //     each other apart, so the spring places each at its (tx, ty)
  //     exactly with no outward pressure. Boundaries match the
  //     rasterized DOM element pixel-for-pixel.
  //
  // The dissolve burst still reads as chaotic because radialImpulse
  // (kick: 520) provides the energy, not repel. Dropping repel to 0
  // does not soften the burst — it sharpens the reform.
  repelRadius: 10,
  repelStrength: 0,
};

// Result returned from `buildElement`. The element is the DOM node that
// will live in the overlay; `width` / `height` are its CSS pixel size,
// used to size the rasterization rect explicitly (we don't trust
// getBoundingClientRect() to be right at mount-time before layout).
export type BuildResult = {
  element: HTMLElement;
  width: number;
  height: number;
};

export type ComponentReelOpts = {
  canvas: HTMLCanvasElement;
  // Canvas / world dimensions. componentReel doesn't resize.
  w: number;
  h: number;
  themeId: ThemeId;
  // Factory: receives theme tokens (literals — no var() lookups), returns
  // a freshly-built DOM element + its dimensions. Called once per mount;
  // the same element is reused across every dissolve cycle.
  buildElement: (tokens: Readonly<ThemeTokens>) => BuildResult;
  // Click handler for the element. Optional. If provided, fires BEFORE
  // dissolve starts — useful for stateful components (e.g. toggle that
  // flips its visual, then the dissolve plays the new state). Returning
  // false skips the dissolve for this click (e.g. user dragged but
  // didn't toggle).
  onElementClick?: (element: HTMLElement) => boolean | void;
  // Per-call overrides for cycle timing + physics. Sane defaults match
  // the button tile.
  driftMs?: number;
  fadeMs?: number;
  idleMs?: number;
  kick?: number;
  particleCount?: number;
  feel?: FeelName;
  feelOverrides?: Partial<FeelPreset>;
};

export type ComponentReelHandle = {
  // The Stage driving the canvas. Returned for the TileSetup contract.
  stage: Stage;
  // Cleanup. Removes injected DOM, clears timers, marks the helper
  // disposed so any in-flight rasterize bails on resolve.
  dispose: () => void;
};

export const componentReel = (opts: ComponentReelOpts): ComponentReelHandle => {
  const {
    canvas, w, h, themeId,
    buildElement, onElementClick,
    driftMs = DEFAULT_DRIFT_MS,
    fadeMs = DEFAULT_FADE_MS,
    idleMs = DEFAULT_IDLE_MS,
    kick = DEFAULT_KICK,
    particleCount = DEFAULT_PARTICLE_COUNT,
    feel = 'magnetic',
    feelOverrides = DEFAULT_FEEL_OVERRIDES,
  } = opts;

  const wrap = canvas.parentElement;
  if (!wrap) throw new Error('canvas has no parent — story-canvas-wrap missing?');

  const tokens = THEMES[themeId].tokens;

  // Build the DOM element via the caller's factory. The element should
  // already be styled with literal hex values — we don't enforce that,
  // but a `var()`-relying element will rasterize as a transparent
  // skeleton (this is the trap that bit the original button tile).
  // The factory returns explicit width/height for forward-compat with a
  // future scaled-rasterize path; current code reads the live size from
  // the element directly via getBoundingClientRect inside the
  // rasterizer, so we don't need them here.
  const { element } = buildElement(tokens);

  // Mount under an overlay div for layout consistency with other story
  // components. The overlay's `--always` modifier means it stays at
  // opacity 1; only the inner element's opacity cycles.
  const overlay = document.createElement('div');
  overlay.className = 'story-component-overlay story-component-overlay--always';
  // Set the element's opacity transition here so the timing is owned by
  // this helper (the caller doesn't have to know the FADE_MS constant).
  // If the caller already set a transition, it gets overridden — fine
  // because the helper's transition is what drives the reform fade-in.
  element.style.transition = `opacity ${fadeMs}ms ease-out`;
  overlay.appendChild(element);
  wrap.appendChild(overlay);

  const stage = tileStage(canvas, w, h, themeId, {
    particleCount,
    feel,
    feelOverrides,
  });

  // Phase machine. See module-doc diagram.
  let phase: 'idle' | 'rasterizing' | 'particles' | 'fading' = 'idle';
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let driftTimer: ReturnType<typeof setTimeout> | null = null;
  let fadeTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const clearAllTimers = (): void => {
    if (idleTimer)  { clearTimeout(idleTimer);  idleTimer = null; }
    if (driftTimer) { clearTimeout(driftTimer); driftTimer = null; }
    if (fadeTimer)  { clearTimeout(fadeTimer);  fadeTimer = null; }
  };

  const goIdle = (): void => {
    if (disposed) return;
    phase = 'idle';
    element.style.opacity = '1';
    element.style.pointerEvents = 'auto';
    stage.world.particles.length = 0;
    idleTimer = setTimeout(() => { void dissolve(); }, idleMs);
  };

  const dissolve = async (): Promise<void> => {
    if (disposed || phase !== 'idle') return;
    phase = 'rasterizing';
    clearAllTimers();
    let result;
    try {
      result = await bitmapFieldFromElement({
        element,
        strategy: 'foreignObject',
        origin: { x: 0, y: 0 },
      });
    } catch (err) {
      // Rasterize failed (CORS, zero-size element, missing styles).
      // Stay idle so the auto-loop retries; logged once for dev visibility.
      console.warn('[componentReel] rasterize failed:', err);
      goIdle();
      return;
    }
    if (disposed) return;

    phase = 'particles';

    // Hide the DOM element — particles take over the visual in the same
    // frame because they're spawned AT the field targets (silhouette
    // identical pre/post-swap).
    element.style.opacity = '0';
    element.style.pointerEvents = 'none';

    // Spawn N particles at canvas center (cheap origin) — we'll snap
    // them to bound targets immediately. setScene with `spawn: 'never'`
    // because we pre-populated.
    stage.world.particles.length = 0;
    stage.world.addParticles(
      spawn({
        n: particleCount,
        origin: { kind: 'point', x: w / 2, y: h / 2 },
        color: TRANSPARENT,
        speed: 0,
        toward: { x: w / 2, y: h / 2 },
      }),
    );
    stage.setScene(() => node(result.field), { spawn: 'never' });

    // Snap each particle to its bound target — frame 0 = the rasterized
    // element. Without this the first ~100ms reads as "spawn from
    // center" rather than "dissolve from element."
    for (const p of stage.world.particles) {
      p.x = p.tx;
      p.y = p.ty;
      p.vx = 0;
      p.vy = 0;
    }
    stage.recolor();

    // Radial impulse outward from canvas center — the dissolve burst.
    radialImpulse(stage.world.particles, {
      origin: { x: w / 2, y: h / 2 },
      kick,
      softness: 0.18,
    });

    // Hold for `driftMs`, then start the reform fade.
    driftTimer = setTimeout(() => {
      if (disposed) return;
      phase = 'fading';
      element.style.opacity = '1';
      fadeTimer = setTimeout(() => {
        if (disposed) return;
        element.style.pointerEvents = 'auto';
        goIdle();
      }, fadeMs);
    }, driftMs);
  };

  // Click handler: invoke caller's hook (which may flip state on the
  // element), then trigger dissolve unless the hook returned false.
  element.addEventListener('click', () => {
    const hookResult = onElementClick?.(element);
    if (hookResult === false) return;
    void dissolve();
  });

  // Boot in idle state — schedule the first auto-loop tick.
  goIdle();

  return {
    stage,
    dispose: () => {
      disposed = true;
      clearAllTimers();
      overlay.remove();
      element.remove();
    },
  };
};
