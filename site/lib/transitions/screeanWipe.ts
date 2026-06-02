// screeanWipe — one-shot particle pass across a container, used to
// bridge a content swap so the cut isn't an instant DOM jump.
//
// Phase 2 of the components-page transformation: when the sidebar nav
// changes the active group, the right pane's old tile grid is torn
// down and the new group's grid is mounted. Without a transition,
// users see "highlight flies → snap to new content." With this wipe,
// the snap happens at the wipe's midpoint, hidden behind a chartreuse
// particle pass that sweeps left → right.
//
// API:
//
//   const wipeHandle = mountScreeanWipe(container, themeId);
//   ...
//   await wipeHandle.run();   // ~600ms; resolves when wipe completes
//   ...
//   wipeHandle.dispose();
//
// The container is owned by the caller and only needs `position:
// relative` so the wipe canvas can absolute-position over it. The
// canvas is `pointer-events: none` so it doesn't intercept anything.
//
// Lifecycle: the wipe Stage is created once at `mount`, reused across
// every `run()` call. Disposing tears down the canvas + Stage. This
// matters because the components page calls `wipeHandle.run()` on
// every group switch — creating + tearing down a fresh Stage per
// switch would burn WebGL contexts and feel sluggish.

import { Stage } from '../../embed';
import { THEMES, type ThemeId } from '../../themes';
import { node } from '@tesyl/screean';
import { roundedRectField } from '@tesyl/screean';
import { spawn } from '@tesyl/screean';
import { dismiss } from '@tesyl/screean';
import { TRANSPARENT } from '@tesyl/screean';

export type ScreeanWipeOpts = {
  container: HTMLElement;
  themeId: ThemeId;
  // Wipe duration in ms. Default 600. The DOM swap should land at
  // ~half this duration (the midpoint of the pass) so the new
  // content "appears" out of the wipe rather than being uncovered
  // when the wipe leaves.
  durationMs?: number;
  // Particle count. Default 800 — enough for a visible chartreuse
  // bar at typical pane width without taxing the renderer.
  particleCount?: number;
};

export type ScreeanWipeHandle = {
  // Run a single wipe pass. Returns a Promise that resolves when the
  // wipe completes (so callers can `await wipeHandle.run()` and then
  // do the DOM swap timed to the midpoint with their own setTimeout,
  // or do swap synchronously and rely on the wipe to mask it).
  run: () => Promise<void>;
  // Helpful when the caller wants to know "is a wipe currently
  // playing" without managing its own promise chain.
  isRunning: () => boolean;
  dispose: () => void;
};

export const mountScreeanWipe = (opts: ScreeanWipeOpts): ScreeanWipeHandle => {
  const {
    container,
    themeId,
    durationMs = 600,
    particleCount = 800,
  } = opts;

  const theme = THEMES[themeId];

  const canvas = document.createElement('canvas');
  canvas.className = 'screean-wipe-canvas';
  Object.assign(canvas.style, {
    position: 'absolute',
    inset: '0',
    width: '100%',
    height: '100%',
    pointerEvents: 'none',
    // Above the content but the canvas is transparent except where
    // the wipe particles are drawing — so it doesn't block visibility
    // when idle. z-index high enough to sit above any tile content.
    zIndex: '5',
  } satisfies Partial<CSSStyleDeclaration>);

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
      // Stiff spring, heavy damping — the wipe wants particles to
      // arrive at their bound positions promptly. No oscillation;
      // the bar is supposed to look like a swept line, not a
      // wandering cloud.
      springK: 100,
      springC: 18,
      drag: 0.7,
      shimmerAmp: 4,
      // Same boundary-fidelity dial used elsewhere — repel = 0 so
      // the bar's silhouette matches its bound rect exactly, no
      // outward leak.
      repelRadius: 10,
      repelStrength: 0,
    },
    palette: theme.palette,
    particleCount,
    spawnFrom: 'edge',
    spawnSpeed: 280,
    portal: true,
    particleSize: 0.7,
    trailAlpha: 0.18,
    backend: 'canvas2d',
  });

  // Append AFTER stage construction (Stage.resize sets canvas
  // dimensions; appending doesn't trigger ResizeObserver here because
  // the container's own size is unchanged).
  container.style.position = container.style.position || 'relative';
  container.appendChild(canvas);

  // Track running state for re-entrant guards. If a second run() is
  // called while a wipe is in flight, we ignore it — the in-flight
  // wipe's promise resolves on time, the dropped one is a no-op.
  let running = false;

  // ResizeObserver to keep the canvas matched to the container.
  // Group switches don't typically resize the pane, but window
  // resizes do.
  let resizeRaf = 0;
  const ro = new ResizeObserver(() => {
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      const { w, h } = measure();
      stage.resize(w, h);
    });
  });
  ro.observe(container);

  // The wipe sequence: spawn particles AT the left-edge bar, sweep
  // them across to the right, then dismiss them off the right edge.
  // Implemented as two scene swaps + a dismiss to keep the timing
  // explicit.
  //
  // Phase A (0 → durationMs/2):  particles bind to a vertical bar at
  //   the canvas's left third. They've spawned from the left edge,
  //   so the visual is "flowing in from the left."
  //
  // Phase B (durationMs/2 → durationMs * 0.85): the bar's bound rect
  //   moves to the right third. Soft swap → particles flow rightward.
  //
  // Phase C (last 15%): dismiss outward to the right edge with life
  //   decay so particles fade as they exit.
  const run = (): Promise<void> => {
    if (running) return Promise.resolve();
    running = true;

    return new Promise<void>((resolve) => {
      const { w, h } = measure();
      stage.resize(w, h);

      // Vertical bar geometry. Width is small (~12% of pane) so the
      // wipe reads as a sweep rather than a wash. Height fills the
      // pane. Bar is solid corners — sharp edges match the brutalist
      // UI vocabulary.
      const barW = Math.round(w * 0.12);
      const barH = h;
      const buildBarAt = (x: number) => () =>
        node(roundedRectField({
          x,
          y: 0,
          w: barW,
          h: barH,
          radius: 2,
        }));

      // Phase A: spawn from left edge, bind to left-third bar.
      stage.world.particles.length = 0;
      stage.world.addParticles(
        spawn({
          n: particleCount,
          origin: { kind: 'edge', width: w, height: h },
          color: TRANSPARENT,
          speed: 360,
          // Toward the future bar position so spawn velocities point
          // generally rightward, biasing the visual flow direction.
          toward: { x: w * 0.25, y: h / 2 },
        }),
      );
      stage.setScene(buildBarAt(w * 0.2 - barW / 2), {
        spawn: 'never',
        autoPan: false,
      });
      stage.recolor();

      // Phase B: at midpoint, swap bar position to right third.
      const midpoint = setTimeout(() => {
        stage.setScene(buildBarAt(w * 0.8 - barW / 2), { autoPan: false });
      }, durationMs * 0.5);

      // Phase C: at 85%, dismiss particles off the right edge.
      const exit = setTimeout(() => {
        dismiss(stage.world.particles, {
          // Origin off-canvas to the right — particles fly outward
          // and to the right, exiting the pane.
          center: { x: w * 1.2, y: h / 2 },
          impulse: 320,
          life: 0.5,
          lifeJitter: 0.3,
        });
      }, durationMs * 0.85);

      // Resolution: clear lingering particles and mark not-running.
      const finish = setTimeout(() => {
        stage.world.particles.length = 0;
        running = false;
        resolve();
      }, durationMs);

      // Capture timer handles in case dispose runs mid-wipe.
      pendingTimers = [midpoint, exit, finish];
    });
  };

  // Tracked so dispose can clear them — without this, a dispose
  // mid-wipe would leave timers firing into a torn-down stage.
  let pendingTimers: ReturnType<typeof setTimeout>[] = [];

  return {
    run,
    isRunning: () => running,
    dispose: () => {
      for (const t of pendingTimers) clearTimeout(t);
      pendingTimers = [];
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      ro.disconnect();
      stage.dispose();
      canvas.remove();
    },
  };
};
