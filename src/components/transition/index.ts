// Transition core — re-export of the engine's screen module.
//
// This module USED to contain the four-frame dissolve/swap state machine.
// It was upstreamed into `@tesyl/screean` (`src/screen`) so there is ONE
// implementation shared by the engine's React binding (ScreenProvider) and
// this library — see docs/ARCHITECTURE-components.md and the engine's
// RFC-html-in-canvas-interop. This file remains as a stable re-export so
// `headless/*` and the components barrel import path are unchanged.

export {
  createScreenController,
  applyTransitionFrame,
  PHYSICS_ACTIVE,
  resolveParticlePalette,
  pickFromPalette,
  parseCssColorToRgba,
  // constants
  DEFAULT_ALPHA_THRESHOLD,
  DEFAULT_DISPERSE_KICK,
  DEFAULT_FEEL,
  DEFAULT_PARTICLE_COUNT,
  DEFAULT_PARTICLE_PALETTE,
  DEFAULT_PARTICLE_PHASE_MS,
  DEFAULT_THWACK_STRENGTH,
  DISSOLVE_HANDOFF_MS,
  FADE_MS,
  MAX_DT_SECONDS,
  PARTICLE_COLOR_VARS,
} from '@tesyl/screean';

export type {
  ScreenController,
  ScreenControllerOpts,
  TransitionPhase,
  TransitionActivePhase,
  TransitionPhaseKind,
  TransitionTuning,
  TransitionFrameResult,
  FeelName,
  Palette,
  CanvasFactory,
  MinimalCanvas2DContext,
} from '@tesyl/screean';

// `Prettify` stays library-local — a generic flatten util we don't push onto
// the engine's public surface. `headless/*` imports it from here.
export type Prettify<T> = { [K in keyof T]: T[K] } & {};
