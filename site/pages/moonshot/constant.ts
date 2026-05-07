// Moonshot constants. Pared down for the DOM-first model — particle pool
// and per-screen tunables now live inside the canvas (one transition at a
// time at a fixed pool size). What stays here is the cosmographic palette
// and type ramp that the DOM components style themselves with.

// ---- Screen ids -----------------------------------------------------------
export type MoonshotScreenId = 'horizon' | 'atlas' | 'signal' | 'test';

// ---- Cosmographic palette -------------------------------------------------
// Deep ink + warm amber accent, with a cool blue counterweight used sparingly.
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

// ---- Type ramp ------------------------------------------------------------
export const FONT = {
  display: '"Didot", "Bodoni 72", "Cormorant Garamond", Georgia, serif',
  body:    '"Inter", system-ui, -apple-system, "Segoe UI", sans-serif',
  mono:    'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace',
} as const;
