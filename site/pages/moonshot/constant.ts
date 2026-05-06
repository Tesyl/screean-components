// Moonshot constants. Type-coupled so a single source-of-truth edit
// propagates through every screen, component, and motion preset.

import type { Palette } from '../../themes';

// ---- Particle pool sizing per screen --------------------------------------
// Per RFC §3.2.2 / Decision 5: declare per-screen and the canvas pool is
// max() of these. Unused slots stay dormant.
//
// Sized so equal-budget per leaf still gives readable text density. With
// `equal` policy the wordmark gets the same budget as a 14-char chrome
// line, so we need enough total to keep small text crisp.
export const PARTICLE_COUNT = {
  horizon: 22000,
  atlas:    18000,
  signal:   16000,
} as const;

export type MoonshotScreenId = keyof typeof PARTICLE_COUNT;

export const POOL_SIZE = Math.max(...Object.values(PARTICLE_COUNT));

// ---- Cosmographic palette -------------------------------------------------
// Deep ink + warm amber accent, with a cool blue counterweight used sparingly.
// Particles draw from the AMBER band by default; PRIMARY screens (signal
// success, atlas-tile-active) flip to BLUE.
export const COLOR = {
  ink:        '#06070d',
  panel:      '#0e0f18',
  border:     '#1c1f2c',
  hairline:   '#2a2e3e',
  starlight:  '#e8eaf2',
  muted:      '#8a90a6',
  amber:      '#ffb066',
  amberDim:   '#a06d3c',
  blue:       '#7a9cff',
  blueDim:    '#4f63a6',
  red:        '#ff6680',
} as const;

// ---- Particle palettes ----------------------------------------------------
export const PALETTES = {
  amber:  { hueCenter: 32,  hueRange: 35, sat: 0.78, lit: 0.62 },
  blue:   { hueCenter: 220, hueRange: 25, sat: 0.65, lit: 0.66 },
  signal: { hueCenter: 8,   hueRange: 50, sat: 0.85, lit: 0.62 },
} as const satisfies Record<string, Palette>;

// ---- Type ramp ------------------------------------------------------------
export const FONT = {
  display: '"Didot", "Bodoni 72", "Cormorant Garamond", Georgia, serif',
  body:    '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono:    'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
} as const;

// ---- Motion ---------------------------------------------------------------
// Cross-screen swap timing. The dismiss is a radial impulse; the bind
// happens on the same tick; a small visual "breath" between is the stagger.
export const TRANSITION_MS = {
  dismiss: 360,
  stagger: 80,
} as const;

// Idle wordmark cycle on the hero. Three forms: word → hexagon → star → word.
export const HERO_CYCLE_MS = 5400;
