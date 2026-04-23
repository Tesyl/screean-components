// Dissolve-and-reform — a reusable choreography primitive.
//
// Sibling to `popTo3D`. Turns a component into a radial burst of particles,
// lets them roam through the physics stack, lerps them home to their
// scene-bound target positions, then fades the DOM mirror back in so the
// button "emerges from the cloud." Same cycle the html-interop demo runs
// for a single button; this primitive handles multiple concurrent cycles
// (one per clicked component) against shared particle + scene state.
//
// Architecture choice: this primitive assumes the component's particles are
// scene-bound — i.e. `scene.bindAll(particles)` has assigned each particle
// a target `tx, ty` inside the component's field. That's true for any
// screean scene using the standard binding. `scene.indicesForSubtree(c)`
// gives us the subset to animate.
//
// Callers are responsible for visibility: `onReveal(indices)` is called at
// trigger-time (typically paint the particles a visible color), `onHide`
// is called after the fade (typically reset color to TRANSPARENT). This
// keeps the primitive color-agnostic — some consumers want palette-jittered
// clouds, others want a single color, others want per-particle gradients.
//
// The primitive writes to the mirror div's `opacity` and `pointer-events`.
// Callers should set `transition: opacity <fadeMs> ease` in CSS so the
// change animates smoothly; otherwise it snaps.
//
// State machine:
//   trigger()
//     ↓ set mirror opacity 0, call onReveal, apply radial impulse
//   particles phase (particlePhaseMs)
//     ↓ free physics; forces from the world's configured stack apply
//   returning phase (returnMs)
//     ↓ per-frame exponential lerp: p.x += (tx-x)*k; velocities zeroed
//     ↓ at end: snap exactly to (tx, ty), set mirror opacity 1
//   reforming phase (fadeMs)
//     ↓ particles pinned at targets while mirror fades in via CSS transition
//   end → call onHide, cycle removed from active map

import type { Scene, Particle } from 'screean';
import type { Component } from './types';

export type DissolveOpts = {
  // Scene that the components live in. Used for `indicesForSubtree` only.
  scene: Scene;
  // The world's particle array (e.g. `world.particles`). Indexed into via
  // scene's returned indices.
  particles: Particle[];
  // DOM element hosting the `#screean-mirror` container. We query inside it
  // for the `[data-component-id]` div of the triggered component.
  mirrorHost: HTMLElement;
  // Called at trigger-time with the indices of the component's particles.
  // Typically paints them a visible color (they may have started transparent).
  onReveal: (indices: readonly number[]) => void;
  // Called after the cycle completes. Typically paints them back to
  // TRANSPARENT so the scene is clean until the next trigger.
  onHide: (indices: readonly number[]) => void;
  // --- Timings ----------------------------------------------------------
  // Free-physics phase — how long particles roam before the return lerp
  // begins. Tune for visual "play" time.
  particlePhaseMs?: number;
  // Return phase — how long the position lerp runs before snapping to
  // exact targets. Short values (e.g. 50–100ms) feel snappy; longer values
  // (300–500ms) give a more dramatic coalescing motion.
  returnMs?: number;
  // Reform phase — duration the mirror's opacity crossfade runs. Particles
  // remain pinned at targets during this time so the button "emerges."
  fadeMs?: number;
  // Per-frame exponential approach rate during the return lerp. Remaining
  // distance after frame n is `(1 - k)^n`. 0.22 converges ~99% in ~18
  // frames (~300ms @ 60Hz). Higher = faster initial convergence.
  returnLerpK?: number;
  // --- Burst tuning -----------------------------------------------------
  // Initial radial impulse magnitude at the button's center. Falls off
  // with distance softened by burstSoftness.
  burstKick?: number;
  // 1/d falloff softening. Larger = more evenly distributed kick; smaller
  // = hotter center, edge particles barely move.
  burstSoftness?: number;
};

export type Dissolve = {
  // Start a dissolve cycle on `component`. If `component` is disabled, the
  // component has no mirror div, or the component has no scene-bound
  // particles, this is a no-op. Re-entrant: if `component` is mid-cycle,
  // the phase resets and the burst re-applies.
  //
  // `now` defaults to `performance.now()`. Pass an explicit value (typically
  // the current RAF timestamp) when you want the cycle's phase timestamps
  // to be monotonic with the loop driving `tick`, or in tests where time
  // is mocked.
  trigger: (component: Component, now?: number) => void;
  // Call once per frame from the consumer's RAF loop. Must be called with
  // a monotonically-increasing `now` (e.g. `performance.now()`). Advances
  // each active cycle's state machine, applies the return lerp, fires the
  // mirror fade.
  tick: (now: number) => void;
  // Cancel every in-flight cycle, restore mirror visibility, and call
  // onHide for each active subtree's indices. Safe to call multiple times.
  dispose: () => void;
};

type Phase =
  | { kind: 'particles'; since: number }
  | { kind: 'returning'; since: number }
  | { kind: 'reforming'; since: number };

type ActiveDissolve = {
  div: HTMLDivElement;
  indices: readonly number[];
  phase: Phase;
};

export const createDissolve = (opts: DissolveOpts): Dissolve => {
  const {
    scene,
    particles,
    mirrorHost,
    onReveal,
    onHide,
    particlePhaseMs = 1500,
    returnMs = 500,
    fadeMs = 220,
    returnLerpK = 0.22,
    burstKick = 420,
    burstSoftness = 0.12,
  } = opts;

  const active = new Map<string, ActiveDissolve>();
  let disposed = false;

  const findMirrorDiv = (c: Component): HTMLDivElement | null =>
    mirrorHost.querySelector<HTMLDivElement>(
      `[data-component-id="${c._component.id}"]`,
    );

  const trigger = (component: Component, now?: number): void => {
    if (disposed) return;
    if (component._component.disabled) return;
    const div = findMirrorDiv(component);
    if (!div) return;
    const indices = scene.indicesForSubtree(component);
    if (indices.length === 0) return;
    const t = now ?? performance.now();

    // Hide the mirror (CSS transition animates the opacity change).
    div.style.opacity = '0';
    div.style.pointerEvents = 'none';

    // Reveal particles (caller sets colors).
    onReveal(indices);

    // Radial burst from the mirror's screen-space center. Using the mirror
    // rect means the burst origin is whatever the user actually sees, not
    // whatever the scene thinks the field bounds are.
    const rect = div.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    for (const i of indices) {
      const p = particles[i];
      if (!p || p.life <= 0) continue;
      const dx = p.x - cx;
      const dy = p.y - cy;
      const d = Math.hypot(dx, dy) || 1;
      const mag = burstKick / Math.max(1, d * burstSoftness);
      p.vx += (dx / d) * mag;
      p.vy += (dy / d) * mag;
    }

    // Register (overwrites any in-flight cycle on this component — the
    // re-entrancy strategy is "reset phase, re-kick" rather than "stack").
    active.set(component._component.id, {
      div,
      indices,
      phase: { kind: 'particles', since: t },
    });
  };

  const tick = (now: number): void => {
    if (disposed || active.size === 0) return;
    for (const [id, entry] of active) {
      const elapsed = now - entry.phase.since;

      if (entry.phase.kind === 'particles') {
        if (elapsed > particlePhaseMs) {
          entry.phase = { kind: 'returning', since: now };
        }
        continue;
      }

      if (entry.phase.kind === 'returning') {
        // Exponential approach to each particle's target (p.tx, p.ty).
        // Overrides physics by writing positions directly and zeroing
        // velocities each frame — the world's spring / drag / repel
        // forces still run in the main loop but are effectively cancelled.
        for (const i of entry.indices) {
          const p = particles[i];
          if (!p || p.life <= 0) continue;
          p.x += (p.tx - p.x) * returnLerpK;
          p.y += (p.ty - p.y) * returnLerpK;
          p.vx = 0;
          p.vy = 0;
        }
        if (elapsed >= returnMs) {
          // Final snap to pixel-exact targets so the button silhouette is
          // correct when the mirror fades in over it.
          for (const i of entry.indices) {
            const p = particles[i];
            if (!p || p.life <= 0) continue;
            p.x = p.tx;
            p.y = p.ty;
          }
          entry.div.style.opacity = '1';
          entry.div.style.pointerEvents = 'auto';
          entry.phase = { kind: 'reforming', since: now };
        }
        continue;
      }

      // reforming: hold particles pinned at targets while CSS fades mirror in.
      for (const i of entry.indices) {
        const p = particles[i];
        if (!p || p.life <= 0) continue;
        p.x = p.tx;
        p.y = p.ty;
      }
      if (elapsed >= fadeMs) {
        onHide(entry.indices);
        active.delete(id);
      }
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    // Restore in-flight mirrors + fire onHide for their subtrees so
    // consumers can reset colors. Callers can safely dispose mid-cycle.
    for (const entry of active.values()) {
      entry.div.style.opacity = '1';
      entry.div.style.pointerEvents = 'auto';
      onHide(entry.indices);
    }
    active.clear();
  };

  return { trigger, tick, dispose };
};
