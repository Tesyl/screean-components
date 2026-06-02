// Site theme — single canonical theme (Acid). The four brutalist variants
// we explored before committing to Acid live in `themes.archive.ts` for
// design-history reference; reviving one is a copy + add-to-THEMES away.
//
// Three layers per theme:
//
//   1. CSS tokens — applied as variables on <body> via `applyTheme(id)`. The
//      stylesheet (site/style.css) consumes only `var(--token)`; nothing
//      hardcodes a hex value, so a future theme switch re-skins end-to-end
//      via this single function.
//
//   2. Demo behavior — `feel` (which `feels` preset to drive forces with) +
//      `palette` (HSL params for `makeColor`) + `font` (which family the
//      hero word renders in). The screean canvas reads these so each theme
//      *moves* and *colors* differently, not just changes wallpaper.
//
//   3. A short marketing label so the layout chrome can show the theme's
//      name + tag without re-deriving from elsewhere.

import { feels, type FeelPreset } from '@tesyl/screean';

export type FeelName = keyof typeof feels;

// Theme id is a single literal today; kept as a string-literal type rather
// than a wide `string` so router/page consumers stay typo-safe and so a
// future second theme adds a discriminated union member.
export type ThemeId = '2';

export type FontFamilyKey = 'sans' | 'serif' | 'mono' | 'display' | 'rounded';

// Mono-first stack. Pulls SF Mono / Menlo / Consolas before any web mono so
// the page renders without network. The brutalist look depends on tabular
// numerals + slab terminals; system mono fonts hit both for free.
const MONO = 'ui-monospace, "SF Mono", "JetBrains Mono", Menlo, Consolas, monospace';

export const FONT_FAMILIES: Record<FontFamilyKey, string> = {
  sans:    'system-ui, -apple-system, "Segoe UI", sans-serif',
  serif:   'Georgia, "Times New Roman", "Iowan Old Style", serif',
  mono:    MONO,
  display: '"Helvetica Neue", Helvetica, "Arial Black", system-ui, sans-serif',
  rounded: '"SF Pro Rounded", "Avenir Next", Avenir, system-ui, sans-serif',
};

// Palette params consumed by `makeColor()` in embed.ts. Centered hue with a
// hue-range jitter so each particle pulls from a band rather than a single
// color — gives the cloud a sense of internal variation without rainbows.
export type Palette = {
  hueCenter: number;
  hueRange: number;
  sat: number;
  lit: number;
};

export type ThemeTokens = {
  bg: string;
  surface: string;
  subtle: string;
  fg: string;
  muted: string;
  accent: string;
  border: string;
  shadow: string;
  // CSS background value layered behind every page. Empty for Acid;
  // brutalist garnishes (grid, stripes) are CSS pseudo-elements gated by
  // [data-theme] in style.css.
  worldBehind: string;
  fontBody: string;
  fontHead: string;
  fontMono: string;
  headTransform: 'none' | 'uppercase';
  headTracking: string;
  radius: string;
  // Legacy flag — `false` for the brutalist family. Kept on the type so
  // future themes can opt back into glass without a schema change.
  glass: boolean;
};

export type Theme = {
  id: ThemeId;
  name: string;
  blurb: string;
  // Tagline shown below the hero word. Short, declarative, ALL CAPS.
  tag: string;
  // Hero word rendered in particles.
  heroWord: string;
  // Specsheet rows — meta-design surface. Each row is a [label, value] pair
  // rendered in mono caps with hairline rules.
  specs: ReadonlyArray<readonly [string, string]>;
  feel: FeelName;
  palette: Palette;
  font: FontFamilyKey;
  fontWeight: number;
  tokens: ThemeTokens;
  feelOverrides?: Partial<FeelPreset>;
};

// Acid — bone paper, electric chartreuse accent, mono throughout. Refined:
// paper warmer, ink less gunmetal, accent pushed brighter so it reads as
// electric rather than olive. Ink-on-paper contrast is 16:1 (clean);
// chartreuse accents are decorative-only.
const acid: Theme = {
  id: '2',
  name: 'Acid',
  blurb: 'Cream and chartreuse. A contradiction held still.',
  tag: 'CONTRADICTION / HELD STILL',
  heroWord: 'ACID',
  specs: [
    ['INDEX',  '01 / 01'],
    ['FEEL',   'MAGNETIC'],
    ['INK',    '#0B0B0B'],
    ['ACCENT', '#D4FF3A'],
    ['TYPE',   'MONO ALL'],
  ],
  feel: 'magnetic',
  // Tight hue jitter so the cloud reads as one electric chartreuse rather
  // than a yellow-to-lime smear.
  palette: { hueCenter: 70, hueRange: 12, sat: 0.95, lit: 0.58 },
  font: 'mono',
  fontWeight: 700,
  tokens: {
    bg: '#f4eeda',          // warm bone
    surface: '#fdf9e6',     // paper, lifted off bg ~6%
    subtle: '#e9e2c1',      // input/code rows
    fg: '#0b0b0b',          // true ink
    muted: '#5a5040',
    accent: '#d4ff3a',      // electric chartreuse
    border: '#0b0b0b',
    shadow: '6px 6px 0 #d4ff3a',
    worldBehind: '',
    fontBody: MONO,
    fontHead: MONO,
    fontMono: MONO,
    headTransform: 'uppercase',
    headTracking: '0.005em',
    radius: '2px',
    glass: false,
  },
};

export const THEMES: Readonly<Record<ThemeId, Theme>> = {
  '2': acid,
};

export const DEFAULT_THEME: ThemeId = '2';

// Apply the theme's CSS tokens to <body>. Idempotent. The dataset attribute
// drives theme-specific selectors in style.css — `[data-theme="acid"]` etc.
export const applyTheme = (id: ThemeId): Theme => {
  const t = THEMES[id];
  const b = document.body;
  b.dataset.theme = t.name.toLowerCase();
  b.dataset.themeId = id;
  const s = b.style;
  s.setProperty('--bg', t.tokens.bg);
  s.setProperty('--surface', t.tokens.surface);
  s.setProperty('--subtle', t.tokens.subtle);
  s.setProperty('--fg', t.tokens.fg);
  s.setProperty('--muted', t.tokens.muted);
  s.setProperty('--accent', t.tokens.accent);
  s.setProperty('--border', t.tokens.border);
  s.setProperty('--shadow', t.tokens.shadow);
  s.setProperty('--world-behind', t.tokens.worldBehind || 'none');
  s.setProperty('--font-body', t.tokens.fontBody);
  s.setProperty('--font-head', t.tokens.fontHead);
  s.setProperty('--font-mono', t.tokens.fontMono);
  s.setProperty('--head-transform', t.tokens.headTransform);
  s.setProperty('--head-tracking', t.tokens.headTracking);
  s.setProperty('--radius', t.tokens.radius);
  s.setProperty('--glass', t.tokens.glass ? '1' : '0');
  return t;
};
