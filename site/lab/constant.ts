// Lab chrome constants — the story area's shared visual vocabulary.
//
// These style the lab's OWN chrome (captions, readouts, layout rhythm), not
// the components under test — those carry their headless default skin (or a
// consumer styling layer) and are exactly what the rasterizer captures.
// Inline-styled like the headless skins so the story area needs no per-page
// CSS beyond the layout shell in site/style.css.

export const STORY_COLUMN_GAP_PX = 22;
export const STORY_ROW_GAP_PX = 14;

export const STORY_FONT_FAMILY =
  'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
export const STORY_MONO_FAMILY =
  'ui-monospace, SFMono-Regular, Menlo, monospace';

export const CAPTION_FONT_SIZE_PX = 13;
export const CAPTION_COLOR = 'rgba(200, 205, 220, 0.7)';
export const CAPTION_MAX_WIDTH_PX = 460;

export const READOUT_FONT_SIZE_PX = 12;
export const READOUT_COLOR = 'rgba(199, 255, 81, 0.85)';
export const READOUT_MIN_HEIGHT_PX = 18;
