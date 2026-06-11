import { packRGBA, type Color } from '@tesyl/screean';

// CSS custom properties the particle cloud reads for its palette, in priority
// order. The theme sets these on `:root` (see index.css); a component
// overrides the theme by setting the same variable on its own element. Custom
// properties cascade, so reading them off the element with getComputedStyle
// resolves component value → theme value → unset — override comes for free.
export const PARTICLE_COLOR_VARS = [
  '--screean-particle',
  '--screean-particle-2',
  '--screean-particle-3',
] as const;

// Neutral light tone used when neither theme nor component sets a variable.
export const DEFAULT_PARTICLE_PALETTE: readonly Color[] = [
  packRGBA(230, 230, 240, 255),
];
