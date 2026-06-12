// Transition core barrel — the ONE dissolve/swap engine.
// See DECISION-component-rendering-pattern.md (Decision point 4).

export {
  createScreenController,
} from './controller';

export {
  applyTransitionFrame,
  PHYSICS_ACTIVE,
  type TransitionFrameResult,
} from './machine';

export {
  parseCssColorToRgba,
  pickFromPalette,
  resolveParticlePalette,
  type CanvasFactory,
  type MinimalCanvas2DContext,
} from './palette';

export type {
  FeelName,
  Palette,
  Prettify,
  ScreenController,
  ScreenControllerOpts,
  TransitionActivePhase,
  TransitionPhase,
  TransitionPhaseKind,
  TransitionTuning,
} from './types';

export {
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
  RETURN_LERP_K,
  RETURN_MS,
} from './constant';
