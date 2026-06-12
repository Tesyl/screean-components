// Shared types + helpers used by every story group under site/stories/.
//
// A "story" is one tile in the components page grid: a small canvas, a
// label/blurb pair, and a code snippet. Each group (fields, composition,
// layout, forces, presets, choreography) ships an array of these tiles
// in `<group>Group(themeId).tiles`.

import { Stage } from '../embed';
import { THEMES, type FeelName, type ThemeId } from '../themes';
import type { FeelPreset } from '@tesyl/screean';

export type TileSetup = {
  // Optional: tiles that render via a Stage return it so the page
  // teardown can dispose it. Tiles built on the transition core
  // (componentReel) own no Stage — they clean up via `dispose` alone.
  stage?: Stage;
  // Optional per-tile interval timer for choreography demos. The teardown
  // path nulls these out so the page leave is GC-clean.
  timer?: ReturnType<typeof setInterval>;
  // Optional generic disposer. Any tile holding non-timer state (a Reel,
  // event listeners, RAF handles) returns one here; the orchestrator
  // calls it before disposing the Stage.
  dispose?: () => void;
};

export type TileDef = {
  // Display name shown above the canvas.
  name: string;
  // One-line description shown below the canvas.
  blurb: string;
  // Code snippet shown in the tile (inline-formatted, monospace).
  code: string;
  // Mounts the demo into the canvas. Returns the live Stage so the page
  // teardown can dispose it.
  mount: (canvas: HTMLCanvasElement, w: number, h: number) => TileSetup;
};

export type TileGroup = {
  title: string;
  blurb: string;
  tiles: TileDef[];
};

// Standard tile dimensions. Wider than tall reads as "card with content
// inside"; the 5:3 ratio leaves room for stack/row demos to breathe.
export const TILE_W = 320;
export const TILE_H = 200;

// Standard Stage construction for tiles. Centralized so every group's tiles
// boot with consistent particle counts, palette wiring, and trail settings —
// the visual coherence comes from this defaulting.
//
// Backend is `'auto'` (WebGL with Canvas2D fallback). The components page's
// sidebar nav mounts only one group at a time (3–7 tiles), well under the
// browser's ~16 WebGL context cap. Disposing a Stage on group switch
// releases its renderer and frees the context for the next group.
//
// Per-tile `feelOverrides` are spread AFTER `TILE_FEEL_DEFAULTS`, so a
// tile that wants high repel (e.g. the `neighborRepel` demo) keeps its
// explicit value rather than getting clobbered.
const TILE_FEEL_DEFAULTS: Partial<FeelPreset> = {
  // Halved from magnetic's 600 — at tile size with ~1200 particles, full
  // repel strength visually disrupted the bound shape. Lower repel keeps
  // the cloud cohesive while still spacing particles inside the field.
  repelStrength: 300,
  // Tightened from magnetic's 6 to 4. Smaller search radius means tighter
  // packing inside the bound field, which reads as denser/sharper shapes
  // at tile size.
  repelRadius: 4,
};

const TILE_PARTICLE_COUNT = 1200;

export const tileStage = (
  canvas: HTMLCanvasElement,
  w: number,
  h: number,
  themeId: ThemeId,
  o: {
    feel?: FeelName;
    feelOverrides?: Partial<FeelPreset>;
    particleCount?: number;
    spawnFrom?: 'edge' | 'center';
    particleSize?: number;
    trailAlpha?: number;
    pointer?: () => { x: number; y: number } | null;
  } = {},
): Stage => {
  const t = THEMES[themeId];
  return new Stage({
    canvas,
    width: w,
    height: h,
    feel: o.feel ?? t.feel,
    // Tile defaults first, then per-tile overrides win on conflict.
    feelOverrides: { ...TILE_FEEL_DEFAULTS, ...o.feelOverrides },
    palette: t.palette,
    particleCount: o.particleCount ?? TILE_PARTICLE_COUNT,
    spawnFrom: o.spawnFrom ?? 'center',
    spawnSpeed: 220,
    portal: false,
    particleSize: o.particleSize ?? 1.0,
    trailAlpha: o.trailAlpha ?? 0.18,
    pointerProvider: o.pointer,
    pointerStrength: 2400,
  });
};

// Drive a periodic effect that's also click-triggerable. The canvas's
// click forces an immediate `effect()` AND resets the interval — so a
// user who wants to see the next gesture without waiting can tap, and
// the auto-loop resumes from that point.
//
// Returns a `dispose()` that clears the timer + removes the listener.
// Intended to be wired into a TileSetup's `dispose` field so the page
// teardown path picks it up.
//
// Why a helper: the choreography + composition + easing groups each
// repeated this pattern with subtly different bookkeeping. Centralizing
// it keeps the per-tile mount fns short and ensures teardown is
// consistent (forgetting to remove the click listener leaks DOM nodes
// across page leaves).
export const runLoop = (
  canvas: HTMLCanvasElement,
  intervalMs: number,
  effect: () => void,
): (() => void) => {
  let timer = setInterval(effect, intervalMs);
  const onClick = (): void => {
    clearInterval(timer);
    effect();
    timer = setInterval(effect, intervalMs);
  };
  canvas.addEventListener('click', onClick);
  // Subtle visual affordance — cursor change tells the reader the tile is
  // interactive without needing a separate hover state. We set it on the
  // canvas itself; the surrounding card layout doesn't need to know.
  canvas.style.cursor = 'pointer';
  return (): void => {
    clearInterval(timer);
    canvas.removeEventListener('click', onClick);
    canvas.style.cursor = '';
  };
};
