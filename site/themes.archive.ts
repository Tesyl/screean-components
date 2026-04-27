// Theme archive — design-history record of the four brutalist variants we
// explored before committing to Acid as the canonical site theme.
//
// These objects are NOT wired into the active site. They live here for two
// reasons:
//
//   1. Reference. If a future variant or A/B asks "what did Concrete look
//      like?", this file is the answer rather than `git blame`.
//
//   2. Cheap revival. To bring a variant back into rotation, copy its
//      record into `THEMES` in themes.ts and add the corresponding `data-
//      theme="<lowername>"` rules to style.css.
//
// The shape (`Theme`) is imported from themes.ts; if the active type drifts
// these archive entries will fail to typecheck — exactly the signal we want.

import type { Theme } from './themes';

// Mono-first stack — duplicated here so the archive is self-contained.
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';
const GROTESQUE = '"Helvetica Neue", Helvetica, "Arial Black", system-ui, sans-serif';
const SERIF = 'Georgia, "Times New Roman", "Iowan Old Style", serif';

// 1. Concrete — pure greyscale, mono UI + grotesque display.
const concrete: Theme = {
  id: '2',
  name: 'Concrete',
  blurb: 'Bare structure. The system shown plain.',
  tag: 'STRUCTURE / SHOWN PLAIN',
  heroWord: 'CONCRETE',
  specs: [
    ['INDEX', '01 / 04'],
    ['FEEL', 'CRISP'],
    ['INK', '#0A0A0A'],
    ['PAPER', 'BONE'],
    ['TYPE', 'MONO + GROTESQUE'],
  ],
  feel: 'crisp',
  feelOverrides: { shimmerAmp: 4 },
  palette: { hueCenter: 0, hueRange: 0, sat: 0, lit: 0.18 },
  font: 'display',
  fontWeight: 800,
  tokens: {
    bg: '#f4f2ed', surface: '#ffffff', subtle: '#eae6dd',
    fg: '#0a0a0a', muted: '#5b5752', accent: '#0a0a0a',
    border: '#0a0a0a', shadow: '6px 6px 0 #0a0a0a',
    worldBehind: '', fontBody: MONO, fontHead: GROTESQUE, fontMono: MONO,
    headTransform: 'uppercase', headTracking: '-0.02em', radius: '0', glass: false,
  },
};

// 3. Ink — pitch field, off-white serif display.
const ink: Theme = {
  id: '2',
  name: 'Ink',
  blurb: 'Black field, white print. Make a mark.',
  tag: 'A FIELD / A MARK',
  heroWord: 'Ink',
  specs: [
    ['INDEX', '02 / 04'],
    ['FEEL', 'DREAMY'],
    ['INK', '#F4F1E8'],
    ['PAPER', '#0A0A0A'],
    ['TYPE', 'SERIF + MONO'],
  ],
  feel: 'dreamy',
  palette: { hueCenter: 0, hueRange: 0, sat: 0, lit: 0.92 },
  font: 'serif',
  fontWeight: 700,
  tokens: {
    bg: '#0a0a0a', surface: '#141414', subtle: '#1d1d1d',
    fg: '#f4f1e8', muted: '#8c887c', accent: '#f4f1e8',
    border: '#f4f1e8', shadow: '6px 6px 0 #f4f1e8',
    worldBehind: '', fontBody: MONO, fontHead: SERIF, fontMono: MONO,
    headTransform: 'none', headTracking: '-0.035em', radius: '0', glass: false,
  },
};

// 4. Construction — bone paper, safety-orange accent, hazard-stripe garnish.
const construction: Theme = {
  id: '2',
  name: 'Construction',
  blurb: 'High-vis on raw paper. Site rules apply.',
  tag: 'SITE / RULES APPLY',
  heroWord: 'BUILD',
  specs: [
    ['INDEX', '03 / 04'],
    ['FEEL', 'MAGNETIC'],
    ['INK', '#0A0A0A'],
    ['ACCENT', '#FF5A1F'],
    ['TYPE', 'GROTESQUE + MONO'],
  ],
  feel: 'magnetic',
  feelOverrides: { springK: 70, repelStrength: 1100 },
  palette: { hueCenter: 22, hueRange: 22, sat: 0.95, lit: 0.55 },
  font: 'display',
  fontWeight: 800,
  tokens: {
    bg: '#e8e4dc', surface: '#ffffff', subtle: '#d4cfc4',
    fg: '#0a0a0a', muted: '#4a443a', accent: '#ff5a1f',
    border: '#0a0a0a', shadow: '6px 6px 0 #ff5a1f',
    worldBehind: '', fontBody: MONO, fontHead: GROTESQUE, fontMono: MONO,
    headTransform: 'uppercase', headTracking: '-0.015em', radius: '0', glass: false,
  },
};

// 5. Blueprint — deep navy ground, cyan ink, technical-drawing grid overlay.
const blueprint: Theme = {
  id: '2',
  name: 'Blueprint',
  blurb: 'Drafting table. Lines and tolerances.',
  tag: 'PLATE / TOLERANCES',
  heroWord: 'BLUEPRINT',
  specs: [
    ['INDEX', '04 / 04'],
    ['FEEL', 'CALM'],
    ['PAPER', '#0C2438'],
    ['ACCENT', '#00B8FF'],
    ['TYPE', 'MONO ALL'],
  ],
  feel: 'calm',
  feelOverrides: { shimmerAmp: 6 },
  palette: { hueCenter: 198, hueRange: 22, sat: 0.85, lit: 0.62 },
  font: 'mono',
  fontWeight: 600,
  tokens: {
    bg: '#0c2438', surface: '#10293f', subtle: '#16344f',
    fg: '#e8f2ff', muted: '#7da8c5', accent: '#00b8ff',
    border: '#3a6585', shadow: '6px 6px 0 #00b8ff',
    worldBehind: '', fontBody: MONO, fontHead: MONO, fontMono: MONO,
    headTransform: 'uppercase', headTracking: '0.04em', radius: '0', glass: false,
  },
};

// Keyed by name so callers reach for them by intent (concrete, ink, etc.)
// rather than position. Type is `Theme` so the archive enforces the same
// shape contract as the active themes.
export const ARCHIVED_THEMES: Readonly<Record<'concrete' | 'ink' | 'construction' | 'blueprint', Theme>> = {
  concrete,
  ink,
  construction,
  blueprint,
};
