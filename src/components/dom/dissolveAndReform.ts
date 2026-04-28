// Dissolve-and-reform — a reusable choreography primitive.
//
// Sibling to `popTo3D`. Turns a component into a radial burst of particles,
// lets them roam through the physics stack, eases them home to their
// scene-bound target positions via a parametric easing curve, then fades
// the DOM mirror back in so the button "emerges from the cloud." Same
// cycle the html-interop demo runs for a single button; this primitive
// handles multiple concurrent cycles (one per clicked component) against
// shared particle + scene state.
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
//     ↓ on phase entry: snapshot per-particle starts into typed arrays
//     ↓ per frame: t = elapsed/returnMs (clamped); x = sx + (tx-sx)*easing(t)
//     ↓ at end: snap exactly to (tx, ty), set mirror opacity 1
//   reforming phase (fadeMs)
//     ↓ particles pinned at targets while mirror fades in via CSS transition
//   end → call onHide, cycle removed from active map

import type { Scene, Particle, Easing } from 'screean';
import { radialImpulse, easing as curves } from 'screean';
import type { Component } from '../types';

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
  // Free-physics phase — how long particles roam before the return ease
  // begins. Tune for visual "play" time.
  particlePhaseMs?: number;
  // Return phase — duration of the eased lerp from each particle's
  // free-physics resting position to its scene-bound target. Short values
  // (50–100ms) feel snappy; longer values (300–500ms) give a more dramatic
  // coalescing motion.
  returnMs?: number;
  // Reform phase — duration the mirror's opacity crossfade runs. Particles
  // remain pinned at targets during this time so the button "emerges."
  fadeMs?: number;
  // Curve applied to `t = elapsed / returnMs` during the return phase.
  // Default `easing.outCubic` matches the perceptual character of the
  // previous exponential-approach implementation. Pass `easing.outBack`
  // for a punchy overshoot, `easing.linear` for constant velocity, etc.
  // Overshoot curves (back, elastic, bounce) intentionally exit [0, 1]
  // mid-curve — that's the feature; the final snap-to-target at phase end
  // covers any residual offset.
  returnEasing?: Easing;
  // --- Burst tuning -----------------------------------------------------
  // Initial radial impulse magnitude at the button's center. Falls off
  // with distance softened by burstSoftness.
  burstKick?: number;
  // 1/d falloff softening. Larger = more evenly distributed kick; smaller
  // = hotter center, edge particles barely move.
  burstSoftness?: number;
};

// Per-trigger overrides. Lets a single dissolve instance vary curve / timing
// per click without rebuilding the primitive.
export type TriggerOpts = {
  // Override `returnEasing` for this cycle only.
  easing?: Easing;
  // Explicit timestamp for the cycle's start. Defaults to `performance.now()`.
  // Pass an explicit value (typically the current RAF timestamp) when you
  // want the cycle's phase timestamps to be monotonic with the loop driving
  // `tick`, or in tests where time is mocked.
  now?: number;
};

export type Dissolve = {
  // Start a dissolve cycle on `component`. If `component` is disabled, the
  // component has no mirror div, or the component has no scene-bound
  // particles, this is a no-op. Re-entrant: if `component` is mid-cycle,
  // the phase resets and the burst re-applies.
  //
  // Backwards-compatible call shape: `trigger(component)`,
  // `trigger(component, now)` (legacy positional), and
  // `trigger(component, { now, easing })` are all accepted.
  trigger: (component: Component, nowOrOpts?: number | TriggerOpts) => void;
  // Call once per frame from the consumer's RAF loop. Must be called with
  // a monotonically-increasing `now` (e.g. `performance.now()`). Advances
  // each active cycle's state machine, applies the easing, fires the
  // mirror fade.
  tick: (now: number) => void;
  // Cancel every in-flight cycle, restore mirror visibility, and call
  // onHide for each active subtree's indices. Safe to call multiple times.
  dispose: () => void;
};

type Phase =
  | { kind: 'particles'; since: number }
  | {
      kind: 'returning';
      since: number;
      // Per-particle start positions captured at phase entry. Indexed
      // parallel to `ActiveDissolve.indices` (NOT by particle index), so
      // lookups are raw memory loads rather than Map hashes.
      startsX: Float32Array;
      startsY: Float32Array;
    }
  | { kind: 'reforming'; since: number };

type ActiveDissolve = {
  div: HTMLDivElement;
  indices: readonly number[];
  phase: Phase;
  // Per-trigger easing override. Falls back to instance default.
  easing: Easing;
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
    returnEasing = curves.outCubic,
    burstKick = 420,
    burstSoftness = 0.12,
  } = opts;

  const active = new Map<string, ActiveDissolve>();
  let disposed = false;

  const findMirrorDiv = (c: Component): HTMLDivElement | null =>
    mirrorHost.querySelector<HTMLDivElement>(
      `[data-component-id="${c._component.id}"]`,
    );

  const trigger = (
    component: Component,
    nowOrOpts?: number | TriggerOpts,
  ): void => {
    if (disposed) return;
    if (component._component.disabled) return;
    const div = findMirrorDiv(component);
    if (!div) return;
    const indices = scene.indicesForSubtree(component);
    if (indices.length === 0) return;

    const triggerOpts: TriggerOpts =
      typeof nowOrOpts === 'number'
        ? { now: nowOrOpts }
        : nowOrOpts ?? {};
    const t = triggerOpts.now ?? performance.now();
    const cycleEasing = triggerOpts.easing ?? returnEasing;

    // Hide the mirror (CSS transition animates the opacity change).
    div.style.opacity = '0';
    div.style.pointerEvents = 'none';

    // Reveal particles (caller sets colors).
    onReveal(indices);

    // Radial burst from the mirror's screen-space center. Using the mirror
    // rect means the burst origin is whatever the user actually sees, not
    // whatever the scene thinks the field bounds are. `radialImpulse` is
    // the engine primitive that owns this math.
    const rect = div.getBoundingClientRect();
    radialImpulse(particles, {
      origin: { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 },
      kick: burstKick,
      softness: burstSoftness,
      indices,
    });

    // Register (overwrites any in-flight cycle on this component — the
    // re-entrancy strategy is "reset phase, re-kick" rather than "stack").
    active.set(component._component.id, {
      div,
      indices,
      easing: cycleEasing,
      phase: { kind: 'particles', since: t },
    });
  };

  const tick = (now: number): void => {
    if (disposed || active.size === 0) return;
    for (const [id, entry] of active) {
      const elapsed = now - entry.phase.since;

      if (entry.phase.kind === 'particles') {
        if (elapsed > particlePhaseMs) {
          // Snapshot per-particle starts as the return phase begins. Allocate
          // typed arrays once per cycle (not per frame). Capture happens here
          // — not at trigger() — so the eased lerp originates from wherever
          // free physics actually left the particle.
          const startsX = new Float32Array(entry.indices.length);
          const startsY = new Float32Array(entry.indices.length);
          for (let k = 0; k < entry.indices.length; k++) {
            const p = particles[entry.indices[k]];
            if (!p || p.life <= 0) continue;
            startsX[k] = p.x;
            startsY[k] = p.y;
          }
          entry.phase = { kind: 'returning', since: now, startsX, startsY };
        }
        continue;
      }

      if (entry.phase.kind === 'returning') {
        // Parametric eased lerp from captured start → target.
        // Clamp t so jittery / paused frames can't push overshoot curves
        // beyond their intended range.
        const t = elapsed >= returnMs ? 1 : elapsed / returnMs;
        // Hoist easing call out of the inner loop — same value applies to
        // every particle this frame. This is the perf-critical line: any
        // per-particle Math.* calls would dominate the loop.
        const k = entry.easing(t);
        const { startsX, startsY } = entry.phase;
        for (let idx = 0; idx < entry.indices.length; idx++) {
          const p = particles[entry.indices[idx]];
          if (!p || p.life <= 0) continue;
          p.x = startsX[idx] + (p.tx - startsX[idx]) * k;
          p.y = startsY[idx] + (p.ty - startsY[idx]) * k;
          p.vx = 0;
          p.vy = 0;
        }
        if (elapsed >= returnMs) {
          // Final snap to pixel-exact targets so the button silhouette is
          // correct when the mirror fades in over it. Also covers any
          // residual offset from overshoot curves.
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
