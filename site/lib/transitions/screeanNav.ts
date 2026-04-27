// screeanNav — particle highlight that flies between nav items.
//
// Pairs with a list of real DOM buttons (kept for a11y, keyboard,
// SEO). The buttons themselves render with transparent backgrounds;
// the canvas overlay paints the "active" fill as a chartreuse
// particle cloud bound to the active item's roundedRect field.
//
// On `setActive(newIdx)`, the helper rebuilds the bound field at the
// new item's rect. Because Stage's setScene defaults to soft-swap
// (auto mode + non-empty world), the existing particles' targets
// update to the new field's sample positions and they fly across via
// the spring force. Spring + drag = the canonical "fly to" animation.
//
// What this fixes vs. a CSS-only highlight: state changes feel like
// matter, not like an instant style swap. The chartreuse blob
// physically moves between items; it doesn't blink off here and on
// there.

import { Stage } from '../../embed';
import { THEMES, type ThemeId } from '../../themes';
import { node } from 'screean';
import { roundedRectField } from 'screean';
import { spawn } from 'screean';
import { TRANSPARENT } from 'screean';

export type ScreeanNavOpts = {
  // Container holding the nav. The canvas mounts as an absolutely-
  // positioned sibling of the items, sized to match. Caller is
  // responsible for `position: relative` on the container.
  container: HTMLElement;
  // Selector for the nav items inside container. Order matters:
  // index N corresponds to the Nth match in DOM order.
  itemSelector: string;
  // Initial active index.
  initialActive: number;
  themeId: ThemeId;
  // Particle count for the highlight cloud. Default 600 — sized for
  // a small nav-item rect (~200×40 = 8000 sq px). Higher counts pack
  // particles too densely and the cloud reads as a chunky blob
  // rather than the grainy field the tile reels show.
  particleCount?: number;
  // Per-particle render size in CSS px. Default 0.5 — smaller than
  // the tile reels' 1.0 because the nav rect is also smaller; the
  // proportion of particle-to-container needs to feel similar.
  // Sub-pixel sizes work because the renderer's internal canvas is
  // upscaled by devicePixelRatio.
  particleSize?: number;
  // Corner radius of the highlight in world units. Default 2 to
  // match the surrounding UI's sharp-edge vocabulary. Setting this
  // to rect.h / 2 would produce a pill, which clashes with the
  // brutalist 2px radius the rest of the page uses.
  cornerRadius?: number;
};

export type ScreeanNavHandle = {
  // Switch the active highlight to item at `idx`. Soft-swap: existing
  // particles flow to the new position. No-op if already active or
  // out of range.
  setActive: (idx: number) => void;
  // Force a recompute of all item rects and the active field. Call
  // after a layout change the helper hasn't observed (rare — the
  // ResizeObserver covers the common cases).
  refresh: () => void;
  dispose: () => void;
};

// Compute item position in canvas-local coordinates. The container's
// bounding rect is the canvas's coordinate origin; each item's rect
// gets translated by that offset.
const computeItemRect = (
  item: Element,
  container: Element,
): { x: number; y: number; w: number; h: number } => {
  const ir = item.getBoundingClientRect();
  const cr = container.getBoundingClientRect();
  return {
    x: ir.left - cr.left,
    y: ir.top - cr.top,
    w: ir.width,
    h: ir.height,
  };
};

export const mountScreeanNav = (opts: ScreeanNavOpts): ScreeanNavHandle => {
  const {
    container,
    itemSelector,
    initialActive,
    themeId,
    particleCount = 600,
    particleSize = 0.5,
    cornerRadius = 2,
  } = opts;

  const theme = THEMES[themeId];

  // Create the canvas overlay. `pointer-events: none` so clicks pass
  // through to the DOM buttons. Inset:0 fills the container.
  const canvas = document.createElement('canvas');
  canvas.className = 'screean-nav-canvas';
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    // Below the DOM buttons (which are z-index 1 in the sidebar), but
    // above the container background.
    zIndex: '0',
  } satisfies Partial<CSSStyleDeclaration>);
  // Insert as the FIRST child so the DOM nav items render above (in
  // both DOM order and z-index 0 stacking when no z-index is set).
  container.insertBefore(canvas, container.firstChild);

  const measure = (): { w: number; h: number } => {
    const rect = container.getBoundingClientRect();
    return {
      w: Math.max(60, Math.round(rect.width)),
      h: Math.max(60, Math.round(rect.height)),
    };
  };

  const initial = measure();

  const stage = new Stage({
    canvas,
    width: initial.w,
    height: initial.h,
    feel: theme.feel,
    feelOverrides: {
      // Tighter than tile defaults — the highlight should arrive at
      // its target promptly without overshoot. Strong spring + heavy
      // damping = decisive flight.
      springK: 60,
      springC: 14,
      drag: 0.6,
      shimmerAmp: 4,
      // Repel force is zero so the highlight's silhouette matches
      // the active item's rect pixel-for-pixel. Spring places each
      // particle at its sampled (tx, ty) on the field; with no
      // outward pressure between neighbors, the cloud doesn't leak
      // past the button's edge. Radius is generous because, at
      // strength 0, the search neighborhood is academic.
      repelRadius: 10,
      repelStrength: 0,
    },
    palette: theme.palette,
    particleCount,
    spawnFrom: 'center',
    // Opaque mode — the canvas paints a dark navy backdrop across
    // the whole sidebar nav, so the area has its own visual identity
    // (not cream like the rest of the page). Particles draw chartreuse
    // on top in the active item's rect. Inactive items show the dark
    // backdrop directly behind their (cream) text. This is the dark
    // sidebar block — items in cream, active highlight in chartreuse
    // particles. The CSS rules in style.css make every nav text
    // cream-toned to match.
    portal: false,
    particleSize,
    trailAlpha: 0.22,
    backend: 'canvas2d',
  });

  let activeIdx = initialActive;

  // Cache the most recent item rects. Recomputed on refresh + on
  // ResizeObserver fires; not on every setActive (we'd rather rebind
  // to a slightly-stale rect for one frame than synchronously query
  // the DOM on every click).
  let itemRects: ReadonlyArray<{ x: number; y: number; w: number; h: number }> = [];

  // Build the field for item idx. Returns the field wrapped in node()
  // with intrinsic bounds set to the rect — Stage's setScene with
  // autoPan:false renders it at literal world coords.
  const buildActiveScene = (idx: number) => {
    const rect = itemRects[idx];
    if (!rect) return null;
    // Clamp radius so a tiny rect doesn't over-curve. With the new
    // 2px default this is academic; left in place because callers
    // can pass arbitrary cornerRadius and we don't want a pill on a
    // small button by accident.
    const r = Math.min(cornerRadius, rect.h / 2, rect.w / 2);
    // roundedRectField's `_bounds` is the field's bounding box. The
    // field renders at (rect.x, rect.y) with size (rect.w, rect.h).
    return () => node(roundedRectField({
      x: rect.x,
      y: rect.y,
      w: rect.w,
      h: rect.h,
      radius: r,
    }));
  };

  const refresh = (): void => {
    const items = Array.from(container.querySelectorAll(itemSelector));
    itemRects = items.map((it) => computeItemRect(it, container));
    // Rebind to whatever's currently active. Soft-swap if particles
    // exist; fresh-spawn if not (initial mount path).
    const sceneBuild = buildActiveScene(activeIdx);
    if (sceneBuild) {
      const isFirstScene = stage.world.particles.length === 0;
      stage.setScene(sceneBuild, { autoPan: false });
      if (isFirstScene) {
        // Snap each particle to its bound target so frame 0 IS the
        // active highlight (no fly-in from edges). Same trick the
        // componentReel helper uses for visual continuity.
        for (const p of stage.world.particles) {
          p.x = p.tx;
          p.y = p.ty;
          p.vx = 0;
          p.vy = 0;
        }
        stage.recolor();
      }
    }
  };

  // Initial mount: spawn empty particles, then refresh will set the
  // scene and snap to targets. We need to override Stage's default
  // 'auto' spawn-from-center behavior because we want all particles
  // pre-placed at the active rect, not flying in from canvas center.
  // The cleanest way is to manually populate world.particles before
  // setScene runs, then setScene's auto-spawn detects a non-empty
  // world and skips the fresh-spawn path.
  stage.world.addParticles(
    spawn({
      n: particleCount,
      origin: { kind: 'point', x: initial.w / 2, y: initial.h / 2 },
      color: TRANSPARENT,
      speed: 0,
      toward: { x: initial.w / 2, y: initial.h / 2 },
    }),
  );
  refresh();

  // Keep up with sidebar reflow (mobile breakpoint, theme switches
  // that change padding, etc.). Coalesce via rAF so a continuous
  // resize drag doesn't fire 60 setScene calls.
  let resizeRaf = 0;
  const ro = new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      const { w, h } = measure();
      stage.resize(w, h);
      refresh();
    });
  });
  ro.observe(container);

  return {
    setActive: (idx: number) => {
      if (idx === activeIdx) return;
      if (idx < 0 || idx >= itemRects.length) return;
      activeIdx = idx;
      const sceneBuild = buildActiveScene(idx);
      if (sceneBuild) {
        // Soft-swap: existing particles' targets update; spring pulls
        // them to the new rect. No respawn.
        stage.setScene(sceneBuild, { autoPan: false });
      }
    },
    refresh,
    dispose: () => {
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      ro.disconnect();
      stage.dispose();
      canvas.remove();
    },
  };
};
