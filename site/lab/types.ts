// Lab framework — types shared across the per-component stories, the
// mount helper, and the page renderer.
//
// A `LabStory` is the contract a single component implements to appear
// in the lab. It exposes:
//   - `defaultProps`: the initial values for the component's tunable opts
//   - `propDefs`: the metadata the controls panel uses to render knobs
//     for those opts (which slider, range, format)
//   - `build(props)`: builds a Component instance from the current props
//     (called every time props change)
//   - `codeTemplate`: the snippet shown in the Code tab, with `{{prop}}`
//     placeholders that get filled live
//
// A story doesn't manage Stage / scene / mirror — those are owned by
// `mountLabStory` so every story has the same lifecycle and the same
// global force/dissolve plumbing.

import type { Component, Handler } from '../../src/components';

// ─── Per-prop metadata ──────────────────────────────────────────────────────
// What the controls panel needs to render a knob for one of the story's
// component-level props (the things the user passes to the factory).
export type PropDef =
  | {
      kind: 'number';
      key: string;
      label: string;
      min: number;
      max: number;
      step: number;
      format?: (v: number) => string;
    }
  | {
      kind: 'string';
      key: string;
      label: string;
    }
  | {
      kind: 'boolean';
      key: string;
      label: string;
    }
  | {
      kind: 'enum';
      key: string;
      label: string;
      options: ReadonlyArray<string>;
    };

// ─── Story interface ────────────────────────────────────────────────────────
export type LabStory = {
  // Slug for the URL: /lab/<name>. Must match `/^[a-z0-9-]+$/`.
  name: string;
  // Display title shown in the sidebar nav and the doc-head.
  title: string;
  // One-line description shown next to the canvas.
  blurb: string;
  // Initial component-level props. Keyed values match the keys in propDefs.
  // Loose-typed (Record<string, unknown>) so each story doesn't need to
  // pour generics through the framework. The story's own `build()` knows
  // its own shape.
  defaultProps: Record<string, unknown>;
  // Metadata for the per-prop knobs in the controls panel. Order matters —
  // knobs render top-to-bottom in array order.
  propDefs: ReadonlyArray<PropDef>;
  // Build the component from current props. Called every time props change.
  // The framework passes an `onActivate` handler that fires the dissolve
  // choreography — stories wire it as their factory's onClick / onChange
  // so every interactive component triggers the cycle on user input.
  build: (props: Record<string, unknown>, onActivate: Handler) => Component;
  // Code snippet template. `{{key}}` placeholders are substituted with the
  // current prop value (string-formatted). Used by the Code tab.
  // Forces / globals / dissolve config don't go here — those live in
  // separate setup code documented in the Globals / Forces tabs.
  codeTemplate: string;
};

// ─── Force knobs (Globals + Forces tabs) ────────────────────────────────────
// These are consumed by `mountLabStory` to seed the Stage and apply live
// updates via `setFeelOverrides`. State persists across story switches per
// the Pass A spec.
export type ForceState = {
  springK: number;
  springC: number;
  drag: number;
  shimmerAmp: number;
  shimmerFreq: number;
  repelRadius: number;
  repelStrength: number;
};

export const DEFAULT_FORCE_STATE: ForceState = {
  springK: 60,
  springC: 12,
  drag: 0.6,
  shimmerAmp: 4,
  shimmerFreq: 1.6,
  repelRadius: 6,
  repelStrength: 0,
};

// ─── Global / world knobs ───────────────────────────────────────────────────
// Things that affect the Stage as a whole, not the component. Some live-
// tunable (trailAlpha, palette), some require Stage rebuild (particleCount,
// particleSize). The lab framework handles both paths.
export type GlobalState = {
  particleCount: number;
  particleSize: number;
  trailAlpha: number;
  spawnSpeed: number;
  // Palette HSL band — feeds Stage.setPalette which recolors live particles.
  hueCenter: number;
  hueRange: number;
  saturation: number;
  lightness: number;
};

export const DEFAULT_GLOBAL_STATE: GlobalState = {
  particleCount: 4000,
  particleSize: 1.0,
  trailAlpha: 0.2,
  spawnSpeed: 240,
  hueCenter: 70,
  hueRange: 12,
  saturation: 0.95,
  lightness: 0.58,
};

// ─── Choreography (Pass B) ──────────────────────────────────────────────────
// Stub for now; populated when we wire the Choreography tab in Pass B.
export type ChoreoState = {
  particlePhaseMs: number;
  returnMs: number;
  fadeMs: number;
  burstKick: number;
  burstSoftness: number;
  // Easing curve name from screean.easing — UI maps it to the actual fn.
  returnEasing: string;
};

export const DEFAULT_CHOREO_STATE: ChoreoState = {
  particlePhaseMs: 1000,
  returnMs: 480,
  fadeMs: 240,
  burstKick: 420,
  burstSoftness: 0.12,
  returnEasing: 'outCubic',
};
