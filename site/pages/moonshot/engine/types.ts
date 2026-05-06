// Internal scene-fragment types used by the React ↔ screean bridge.
//
// A `SceneSpec` is the screen's fully-built screean tree (already wrapped in
// a camera node). The screen rebuilds it any time its React state shifts;
// the canvas decides whether the change is a soft refield (intra-screen
// state) or a hard transition (cross-screen route change).

import type { SceneNode } from 'screean';
import type { MoonshotScreenId } from '../constant';

export type SceneSpec = {
  // Stable id for the screen. Crossing between two different ids triggers a
  // hard transition (dismiss → spawn). Same id with different `revision`
  // means soft re-bind (replaceField walk).
  readonly screen: MoonshotScreenId;
  readonly revision: number;
  // Build the scene tree given the live viewport. `w`/`h` are the canvas's
  // CSS pixel size; the camera node wrapping `tree` is created by the canvas
  // so the screen builder doesn't need to know viewport math.
  readonly build: (w: number, h: number) => SceneNode;
};

export type Viewport = { readonly w: number; readonly h: number };

// Pointer-screen-position, as `x`/`y` in canvas-local pixels, or null when
// the pointer has left the canvas / never moved.
export type PointerXY = { readonly x: number; readonly y: number } | null;
