// componentReel — the "live DOM ↔ particles" tile pattern, packaged as a
// callable. Now a THIN ADAPTER over the ONE transition core
// (`@/components/transition` → `createScreenController`), per
// docs/DECISION-component-rendering-pattern.md (Decision point 4) and
// docs/ui-rendering-pattern-audit.md §4 Step 4 ("don't leave a 4th
// near-duplicate"). The four-frame cycle (dissolving → particles →
// returning → reforming), world, and renderer all live in the core; this
// file only owns what's tile-specific:
//
//   • mounting the caller-built DOM element into the canvas overlay,
//   • the canvas-LOCAL coordinate mapping (`originOf`) — the tile canvas
//     is not a viewport overlay, so rasterize anchors + spawn centers are
//     expressed relative to the canvas rect,
//   • bridging the site theme's HSL palette onto the core's
//     `--screean-particle*` custom-property cascade,
//   • the idle auto-loop timer + click wiring.
//
// The caller's responsibility is unchanged: provide a `buildElement`
// factory that returns a fully inline-styled HTMLElement (no `var(--…)`
// lookups — they don't survive the foreignObject SVG context the
// rasterizer uses).

import type { FeelName, ThemeId } from '../../themes';
import { THEMES, type Palette as ThemePalette, type ThemeTokens } from '../../themes';
import {
  createScreenController,
  PARTICLE_COLOR_VARS,
} from '@/components/transition';
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
  // The dissolve burst still reads as chaotic because the core's
  // disperse impulse (kick: 520) provides the energy, not repel.
  // Dropping repel to 0 does not soften the burst — it sharpens the
  // reform.
  repelRadius: 10,
  repelStrength: 0,
};

// The core's pointer sensor reports VIEWPORT coordinates, but this adapter
// runs the controller in canvas-LOCAL space (`originOf`) — the cursor's
// viewport position is meaningless inside a tile's world, so pointer
// attraction must stay off. (The pre-adapter componentReel never wired a
// pointer force either, so this also preserves behavior.) Callers passing
// `feelOverrides` may re-enable it deliberately; they shouldn't.
const TILE_LOCAL_FEEL_FLOOR: Partial<FeelPreset> = { pointerAttract: 0 };

// Bridge the site theme's HSL palette band onto the core's CSS-variable
// cascade (`resolveParticlePalette` reads `--screean-particle{,-2,-3}` off
// the element). Three samples across the band — low edge, center, high
// edge — approximate the old per-particle band sampling.
const themePaletteVars = (p: ThemePalette): readonly string[] =>
  [p.hueCenter - p.hueRange / 2, p.hueCenter, p.hueCenter + p.hueRange / 2]
    .map((hue) => `hsl(${(hue + 360) % 360} ${p.sat * 100}% ${p.lit * 100}%)`);

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
  // Per-call overrides for cycle timing + physics, mapped onto the core's
  // tuning (driftMs → particlePhaseMs, kick → disperseKick). Sane
  // defaults match the button tile.
  driftMs?: number;
  fadeMs?: number;
  idleMs?: number;
  kick?: number;
  particleCount?: number;
  feel?: FeelName;
  feelOverrides?: Partial<FeelPreset>;
};

export type ComponentReelHandle = {
  // Cleanup. Disposes the controller (loop, particles, observers),
  // removes injected DOM, clears the idle timer.
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

  const theme = THEMES[themeId];

  // Build the DOM element via the caller's factory. The element should
  // already be styled with literal hex values — we don't enforce that,
  // but a `var()`-relying element will rasterize as a transparent
  // skeleton (this is the trap that bit the original button tile).
  const { element } = buildElement(theme.tokens);

  // Theme palette → core palette cascade. Set inline on the element so
  // the core's resolveParticlePalette picks it up ahead of computed
  // colors. Type-coupled to PARTICLE_COLOR_VARS: a renamed var breaks
  // here, not silently at runtime.
  themePaletteVars(theme.palette).forEach((css, i) => {
    const varName = PARTICLE_COLOR_VARS[i];
    if (varName) element.style.setProperty(varName, css);
  });

  // Mount under an overlay div for layout consistency with other story
  // components. The overlay's `--always` modifier means it stays at
  // opacity 1; only the inner element's opacity cycles — and the CORE
  // drives that opacity numerically per frame during `reforming`, so the
  // element must NOT carry a CSS opacity transition (it would lag the
  // machine's per-frame writes).
  const overlay = document.createElement('div');
  overlay.className = 'story-component-overlay story-component-overlay--always';
  overlay.appendChild(element);
  wrap.appendChild(overlay);

  const controller = createScreenController({
    canvas,
    feel,
    // Floor first so the tile-local pointer gate holds unless a caller
    // overrides it on purpose.
    feelOverrides: { ...TILE_LOCAL_FEEL_FLOOR, ...feelOverrides },
    particleCount,
    particlePhaseMs: driftMs,
    disperseKick: kick,
    fadeMs,
    // Tile canvases are smaller than the core's viewport-overlay floor
    // (320×360); clamp to the tile's own dimensions instead so the
    // controller never inflates the canvas CSS.
    minView: { w, h },
    // Canvas-LOCAL deployment: anchor rasterize + spawn coords relative
    // to the tile canvas, not the viewport.
    originOf: (el) => {
      const c = canvas.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - c.left, y: r.top - c.top };
    },
  });

  // Idle auto-loop — the only state this adapter keeps. The core owns the
  // whole dissolve cycle and resolves `dissolve()` when it settles back to
  // idle (including the rasterize-failure path, so the loop self-retries).
  let idleTimer: ReturnType<typeof setTimeout> | null = null;
  let disposed = false;

  const scheduleIdle = (): void => {
    if (disposed) return;
    if (idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(() => { void runCycle(); }, idleMs);
  };

  const runCycle = async (): Promise<void> => {
    // Mirror the pre-adapter behavior: a trigger during an in-flight
    // cycle is ignored rather than queued (the core would chain it).
    if (disposed || controller.phase() !== 'idle') return;
    if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
    await controller.dissolve(element);
    scheduleIdle();
  };

  // Click handler: invoke caller's hook (which may flip state on the
  // element), then trigger dissolve unless the hook returned false.
  element.addEventListener('click', () => {
    const hookResult = onElementClick?.(element);
    if (hookResult === false) return;
    void runCycle();
  });

  // Boot in idle state — schedule the first auto-loop tick.
  scheduleIdle();

  return {
    dispose: () => {
      disposed = true;
      if (idleTimer) { clearTimeout(idleTimer); idleTimer = null; }
      controller.dispose();
      overlay.remove();
      element.remove();
    },
  };
};
