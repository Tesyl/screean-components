// Headless component default skin — foreignObject-safe inline styles.
//
// Every value here lands as an INLINE style on the element, so the
// serialized SVG the rasterizer produces is fully self-contained: no
// stylesheet to inline, no sub-resources to fetch, no Tailwind-v4 CDATA /
// url() tainting (see RFC-html-in-canvas-interop.md). The skin visually
// mirrors shadcn's default dark variant — proven by the html-interop demos.
//
// The skin is a DEFAULT, not a dependency: pass `unstyled: true` to any
// factory and bring your own styling layer (the rasterizer reads computed
// styles, so classes work — subject to the rasterizer input contract in
// DECISION-component-rendering-pattern.md §gotchas).

// Typography — system stack, no webfont fetch.
export const DEFAULT_FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const DEFAULT_FONT_SIZE_PX = 14;
export const DEFAULT_FONT_WEIGHT = 500;

// Button chrome.
export const BUTTON_HEIGHT_PX = 40;
export const BUTTON_PADDING_X_PX = 24;
export const BUTTON_RADIUS_PX = 8;
export const BUTTON_BACKGROUND = '#0a0a0a';
export const BUTTON_FOREGROUND = '#fafafa';
export const BUTTON_BORDER = '1px solid rgba(255, 255, 255, 0.08)';
// Slight depth so the particle cloud has visible edge contrast.
export const BUTTON_SHADOW =
  '0 1px 2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)';

// Slider chrome.
export const SLIDER_WIDTH_PX = 200;
export const SLIDER_TRACK_HEIGHT_PX = 6;
export const SLIDER_THUMB_SIZE_PX = 18;
// Root is taller than the track — a generous touch/click target.
export const SLIDER_HIT_HEIGHT_PX = 28;
export const SLIDER_TRACK_BACKGROUND = 'rgba(255, 255, 255, 0.16)';
export const SLIDER_FILL_BACKGROUND = '#fafafa';
export const SLIDER_THUMB_BACKGROUND = '#fafafa';
export const SLIDER_THUMB_SHADOW = '0 1px 3px rgba(0, 0, 0, 0.5)';

// Slider value model defaults.
export const SLIDER_MIN = 0;
export const SLIDER_MAX = 100;
export const SLIDER_STEP = 1;
// PageUp/PageDown move this many steps.
export const SLIDER_PAGE_STEPS = 10;

// Disabled affordance (both factories).
export const DISABLED_OPACITY = '0.5';

// ─── Per-component particle counts ──────────────────────────────────────────
//
// How many particles each component's dissolve spawns, by default. Scaled to
// the component's apparent silhouette area — a tiny toggle reads fine with far
// fewer particles than a full card, and (since transitions are concurrent and
// each adds its own slice to the shared pool) right-sizing these keeps the
// total particle budget sane when several dissolve at once.
//
// Every factory takes a `particleCount` prop that overrides its default. The
// engine's controller default (DEFAULT_PARTICLE_COUNT = 6000) applies only
// when neither is set.
export const BUTTON_PARTICLE_COUNT = 3000;
export const CARD_PARTICLE_COUNT = 6000;
export const LABEL_PARTICLE_COUNT = 2000;
export const HEADING_PARTICLE_COUNT = 3500;
export const CHECKBOX_PARTICLE_COUNT = 1500;
export const TOGGLE_PARTICLE_COUNT = 1200;
export const RADIO_PARTICLE_COUNT = 1500;
export const SLIDER_PARTICLE_COUNT = 2200;
export const TEXT_FIELD_PARTICLE_COUNT = 2600;
export const IMAGE_PARTICLE_COUNT = 6000;
