// Transition core types — the single dissolve/swap engine's public shape.
//
// DECISION-component-rendering-pattern.md §"Decision" point 4: one transition
// core. This module is the framework-agnostic extraction of the state machine
// that screean/react's ScreenProvider proved out (which itself lifted it from
// the moonshot canvas, which lifted it from html-interop). screean/react can
// become a thin wrapper over `createScreenController` once this is upstreamed.

import type { BitmapField, Color, FeelPreset, World, feels } from '@tesyl/screean';

// Flatten intersections for readable hovers/errors (repo convention).
export type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type FeelName = keyof typeof feels;

// ─── Phase machine ──────────────────────────────────────────────────────────
//
// idle        — no transition in flight; particles array is empty.
// dissolving  — one handoff frame: burst impulse visible at the silhouette.
// particles   — free physics; the force stack owns the cloud.
// returning   — deterministic lerp to targets; physics + pointer attract OFF.
// reforming   — particles pinned; the real DOM element fades back in.
//
// `from`/`into` are the same element for a self-dissolve; different for a
// swap (particles fly from one silhouette to the other).
export type TransitionPhase =
  | { kind: 'idle' }
  | TransitionActivePhase;

export type TransitionActivePhase = {
  kind: 'dissolving' | 'particles' | 'returning' | 'reforming';
  since: number;
  from: HTMLElement;
  into: HTMLElement;
};

export type TransitionPhaseKind = TransitionPhase['kind'];

// ─── Tuning ─────────────────────────────────────────────────────────────────

// Everything tunable about a cycle. Defaults come from constant.ts; the
// controller reads these live each frame so consumers can re-tune without
// re-booting the engine.
export type TransitionTuning = {
  particleCount: number;
  particlePhaseMs: number;
  disperseKick: number;
  // DOM fade-back window (the `reforming` tail). Default FADE_MS.
  fadeMs: number;
};

// ─── Controller ─────────────────────────────────────────────────────────────

export type ScreenControllerOpts = Prettify<
  Partial<TransitionTuning> & {
    // The canvas the controller renders into. Two deployments:
    //   • viewport overlay (default coordinate space): full-viewport,
    //     ABOVE page content, `pointer-events: none`.
    //   • local canvas (tile/panel embeds): pass `originOf` so rasterize
    //     anchors + spawn centers land in canvas-local coordinates.
    canvas: HTMLCanvasElement;
    // Force preset for the cycle. Default 'taut'.
    feel?: FeelName;
    // Per-constant overrides merged over the preset — for consumers whose
    // boundary/fidelity tuning has no named preset (e.g. componentReel's
    // repelStrength:0). Prefer a preset when one fits.
    feelOverrides?: Partial<FeelPreset>;
    // Maps an element to its rasterize/spawn anchor in CANVAS coordinates.
    // Default: the element's viewport rect top-left (correct for the
    // viewport-overlay deployment). For a canvas-local deployment return
    // the element's offset relative to the canvas (often {x:0, y:0}).
    originOf?: (el: HTMLElement) => { x: number; y: number };
    // Lower bound applied to the measured canvas size. Defaults preserve
    // the ScreenProvider floor (320×360); pass smaller values for tile
    // canvases so the controller never inflates their CSS size.
    minView?: { w: number; h: number };
    // When false, the controller does NOT start its own rAF — the consumer
    // calls `tick(now)` from their existing loop (the repo's "consumer
    // drives the cadence" pattern, same as choreoRunner + domMirror).
    // Default true (self-driving, like ScreenProvider).
    ownLoop?: boolean;
  }
>;

export type ScreenController = {
  // Round-trip a single element: DOM → particles → same DOM.
  // Resolves when the cycle settles back to idle. Concurrent calls chain.
  dissolve: (el: HTMLElement | null) => Promise<void>;
  // Particles fly from `from`'s silhouette to `into`'s. `into` should start
  // at opacity:0; it fades in during `reforming`.
  swap: (from: HTMLElement | null, into: HTMLElement | null) => Promise<void>;
  // Kick live particles outward from (x,y). No-op when idle.
  thwack: (x: number, y: number, strength?: number) => void;
  // Rasterize an element on demand (the usePortalField equivalent).
  fieldOf: (el: HTMLElement) => Promise<BitmapField>;
  // Advance one frame. Only needed when `ownLoop: false`.
  tick: (now: number) => void;
  // Current phase kind — consumers gate interaction on `'idle'`.
  phase: () => TransitionPhaseKind;
  // Escape hatch: the underlying physics World.
  world: () => World;
  // Stop the loop (if owned), release particles, disconnect observers.
  dispose: () => void;
};

// ─── Palette ────────────────────────────────────────────────────────────────

export type Palette = readonly Color[];
