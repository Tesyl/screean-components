// Transition core constants — the ONE place the dissolve/reform timing model
// lives. These were previously scattered as locals across four parallel
// implementations (html-interop ×2, moonshot canvas, screean/react
// ScreenProvider). Audit §4 Step 4 calls for exactly this module.
//
// Tunables are type-coupled: `TransitionTuning` (types.ts) derives its
// defaults from these, so a renamed/removed constant breaks compilation at
// every consumer rather than silently drifting.

import { packRGBA, type Color } from '@tesyl/screean';

// ─── Phase durations (the canonical four-frame cycle) ───────────────────────

// dom → dissolving → particles → returning → reforming → dom

// How long the `dissolving` handoff frame lasts before free physics. One
// frame (~16ms) — it exists so the burst impulse is visible from the
// element's silhouette before the spring takes over.
export const DISSOLVE_HANDOFF_MS = 16;

// Free-physics window: particles fly under the force stack.
export const DEFAULT_PARTICLE_PHASE_MS = 1_400;

// Deterministic lerp-back window. Physics is OFF here — the cursor must not
// be able to pull particles off-target during the snap-back.
export const RETURN_MS = 50;

// DOM fade-back window. Particles stay pinned to targets while the real
// element fades 0 → 1 on top of them.
export const FADE_MS = 100;

// Per-frame lerp factor during `returning`. 0.22 ≈ critical snap at 60fps.
export const RETURN_LERP_K = 0.22;

// ─── Physics / spawn ────────────────────────────────────────────────────────

export const DEFAULT_PARTICLE_COUNT = 6_000;

// Dispersal impulse applied at the element's center on dissolve.
export const DEFAULT_DISPERSE_KICK = 420;

// MANDATORY dt clamp. A single slow frame (>50ms) compounds with the stiff
// spring in feels.taut (K≈140) into NaN coordinates and a tab freeze.
// 0.05 = 20fps floor; below that we accept slowdown over explosion.
export const MAX_DT_SECONDS = 0.05;

// ─── Rasterization ──────────────────────────────────────────────────────────

// Alpha cutoff when sampling the rasterized bitmap into particle targets.
export const DEFAULT_ALPHA_THRESHOLD = 20;

// ─── Renderer (portal overlay) ──────────────────────────────────────────────

export const RENDERER_PARTICLE_SIZE = 0.8;
export const RENDERER_TRAIL_ALPHA = 0.22;
export const RENDERER_FADE_WINDOW = 0.35;

// ─── Interaction ────────────────────────────────────────────────────────────

export const DEFAULT_THWACK_STRENGTH = 600;

// ─── Palette ────────────────────────────────────────────────────────────────

// CSS custom properties the particle cloud reads for its palette, in priority
// order. The theme sets these on `:root`; a component overrides the theme by
// setting the same variable on its own element. Custom properties cascade, so
// reading them off the element with getComputedStyle resolves
// component value → theme value → unset — override comes for free.
export const PARTICLE_COLOR_VARS = [
  '--screean-particle',
  '--screean-particle-2',
  '--screean-particle-3',
] as const;

// Neutral light tone used when neither theme, component, nor the element's
// own computed colors yield a usable palette.
export const DEFAULT_PARTICLE_PALETTE: readonly Color[] = [
  packRGBA(230, 230, 240, 255),
];

// Default force preset for the transition cycle. `taut` is characterized by
// "particles snap to silhouette and pin" — exactly what a UI transition
// needs (vs the breathing crowds of `balanced` / `dreamy`).
export const DEFAULT_FEEL = 'taut';
