// Reusable adapters that wrap screean's engine into:
//
//   1. `Stage` — a self-contained particle simulation tied to one <canvas>.
//      Owns a World, a Renderer, a force stack, a current scene, and a
//      lifecycle (.dispose). Tiles on the components page each get a Stage.
//
//   2. The `ticker` — a single shared requestAnimationFrame loop that
//      drives every active Stage. One RAF + N stages is dramatically
//      cheaper than N RAFs when the components page renders ~20 tiles.
//
//   3. A small `makeColor(palette)` helper used by both pages so theme
//      palettes flow through to particle color sampling.
//
// Why a class for Stage and not a function: Stage owns mutable state we
// surface through methods (`.setScene`, `.dispose`). A factory returning a
// frozen API would be equivalent in spirit but heavier to read here.

import { World } from 'screean';
import { spring, drag, shimmer, neighborRepel, pointForce } from 'screean';
import { spawn } from 'screean';
import { createRenderer } from 'screean';
import type { Renderer } from 'screean';
import type { Force, Vec2 } from 'screean';
import { packRGBA, TRANSPARENT, type Color } from 'screean';
import { hslToRgb } from 'screean';
import { feels, type FeelPreset } from 'screean';
import type { SceneNode } from 'screean';
import { camera, scene } from 'screean';
import type { Palette } from './themes';

// Color sampler. Each call samples once from an HSL band centered on
// `hueCenter` with `hueRange` width; saturation + lightness are fixed per
// theme. Returning a function (rather than a single Color) lets the caller
// re-color particles independently per call — gives the cloud variety.
export const makeColor = (p: Palette): (() => Color) => () => {
  const h = (((p.hueCenter + (Math.random() - 0.5) * p.hueRange) + 360) % 360) / 360;
  const [r, g, b] = hslToRgb(h, p.sat, p.lit);
  return packRGBA((r * 255) | 0, (g * 255) | 0, (b * 255) | 0, 255);
};

// Build N-gon vertex ring at radius r. `rot` lets the polygon point in a
// specific direction (e.g. -π/2 for a star to point up).
export const nGon = (r: number, sides: number, rot = 0): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
};

// Star vertex ring. `inset` < 1 pinches inner vertices toward the center.
export const starVerts = (
  r: number,
  points: number,
  inset: number,
  rot = -Math.PI / 2,
): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inset;
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    out.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  return out;
};

// Pointer state shape that StageOpts.pointerProvider returns. Null = no point.
export type PointerSnapshot = { x: number; y: number } | null;

export type StageOpts = {
  canvas: HTMLCanvasElement;
  // Initial CSS size. Stage internally tracks layout size and resizes
  // renderer/world together via `.resize(w, h)` if the host calls it.
  width: number;
  height: number;
  // Force preset. Stage layers `feelOverrides` on top.
  feel: keyof typeof feels;
  feelOverrides?: Partial<FeelPreset>;
  palette: Palette;
  particleCount: number;
  // Spawn origin shape. 'edge' = particles fly in from canvas edges;
  // 'center' = particles spawn at the canvas center and fly outward to
  // their bound positions (tighter, more controlled look). Tiles use
  // 'center' for compactness; the hero uses 'edge' for drama.
  spawnFrom?: 'edge' | 'center';
  spawnSpeed?: number;
  // Optional pointer source. If given, a pointForce is added that pulls
  // particles toward the returned point. Tiles can omit this for static
  // demos; the hero passes a window-pointer source.
  pointerProvider?: () => PointerSnapshot;
  pointerStrength?: number;
  // Renderer cosmetics.
  particleSize?: number;
  trailAlpha?: number;
  fadeWindow?: number;
  // Blend mode. Omit (or `true`) for the default additive "bloom" look —
  // particles SUM their contributions, glowing on a dark surface. Set
  // `false` for standard source-over alpha blending: pigment composites
  // *over* and *darkens* the surface beneath. This is the switch that makes
  // dark particles legible on a light background — additive can only
  // brighten, so a black particle on white is invisible under bloom.
  bloom?: boolean;
  // Opaque-mode trail/clear color as an "R,G,B" string. Ignored in portal
  // mode (the context is transparent and whatever sits behind shows through).
  // Defaults to the renderer's dark navy; pass '255,255,255' for a white
  // surface in opaque mode.
  background?: string;
  // Run in transparent (portal) mode? Hero = true so backdrop bleeds through.
  // Tiles = false to keep each demo visually contained.
  portal?: boolean;
  // Renderer backend. Defaults to 'auto' (WebGL with Canvas2D fallback).
  //
  // Force 'canvas2d' for pages that mount many small canvases — Chrome and
  // Firefox cap concurrent WebGL contexts at ~16. The components page
  // creates ~26 tile stages, so the earliest contexts get force-lost when
  // later ones spin up. Canvas2D has no such limit and handles the
  // tile-scale particle counts (~900) without breaking a sweat.
  backend?: 'auto' | 'webgl' | 'canvas2d';
};

// A self-contained particle stage. Construct → set a scene → it animates.
// Disposable via `.dispose()`; not safe to use after that.
export class Stage {
  readonly canvas: HTMLCanvasElement;
  readonly world: World;
  readonly renderer: Renderer;
  // World-space size. Mirrors canvas CSS size (renderer handles DPR scaling
  // inside `resize`). We keep our own copies because the World stores raw
  // numbers and we need to re-spawn at the correct size on theme change.
  private w: number;
  private h: number;
  private currentScene: ReturnType<typeof scene> | null = null;
  private palette: Palette;
  private feelKey: keyof typeof feels;
  private feelOverrides: Partial<FeelPreset>;
  private particleCount: number;
  private spawnFrom: 'edge' | 'center';
  private spawnSpeed: number;
  private pointerProvider: (() => PointerSnapshot) | null;
  private pointerStrength: number;
  private disposed = false;

  constructor(opts: StageOpts) {
    this.canvas = opts.canvas;
    this.w = opts.width;
    this.h = opts.height;
    this.palette = opts.palette;
    this.feelKey = opts.feel;
    this.feelOverrides = opts.feelOverrides ?? {};
    this.particleCount = opts.particleCount;
    this.spawnFrom = opts.spawnFrom ?? 'center';
    this.spawnSpeed = opts.spawnSpeed ?? 240;
    this.pointerProvider = opts.pointerProvider ?? null;
    this.pointerStrength = opts.pointerStrength ?? 4500;

    const f = this.resolvedFeel();
    this.world = new World({
      width: this.w,
      height: this.h,
      hashCellSize: Math.max(4, Math.ceil(f.repelRadius)),
    });
    this.renderer = createRenderer({
      canvas: this.canvas,
      backend: opts.backend ?? 'auto',
      particleSize: opts.particleSize ?? 1.0,
      trailAlpha: opts.trailAlpha ?? 0.14,
      portalMode: opts.portal ?? false,
      fadeWindow: opts.fadeWindow ?? 0.35,
      // Forwarded undefined → the renderer's own default (bloom on, dark
      // background). Only set when a caller opts out of the additive look.
      bloom: opts.bloom,
      background: opts.background,
    });
    this.renderer.resize(this.w, this.h);
    this.world.setForces(this.buildForces());
    ticker.add(this);
  }

  private resolvedFeel(): FeelPreset {
    return { ...feels[this.feelKey], ...this.feelOverrides };
  }

  private buildForces(): Force[] {
    const f = this.resolvedFeel();
    const fs: Force[] = [
      spring(f.springK, f.springC),
      drag(f.drag),
      shimmer(f.shimmerAmp, f.shimmerFreq),
      neighborRepel(f.repelRadius, f.repelStrength),
    ];
    if (this.pointerProvider) {
      const p = this.pointerProvider;
      fs.push(pointForce(p, this.pointerStrength, 60));
    }
    return fs;
  }

  // Replace the current scene. `build` is a function so callers can compute
  // it from the live (this.w, this.h) — themes/sizes change over time and
  // the scene must rebuild against the *current* size, not closure-captured.
  //
  // Spawn behavior is controlled by `opts.spawn`:
  //
  //   • 'auto' (default) — fresh-spawn from the configured origin if the
  //     world is currently empty, otherwise SOFT SWAP: keep the existing
  //     particles, rebuild the scene, and rebind. This is what callers
  //     usually want — a shape change should be a transition, not a reset.
  //
  //   • 'always' — always wipe + spawn fresh. Use when you specifically
  //     want the dramatic edges-fly-in look (e.g. after a full dismiss).
  //
  //   • 'never' — never spawn even when the world is empty. The caller is
  //     responsible for populating particles. Used by experiments that
  //     drive their own spawn pattern.
  //
  // The previous behavior (always re-spawn) was a bug; it made every shape
  // swap look like a hard reset.
  setScene(
    build: (w: number, h: number) => SceneNode,
    opts: { spawn?: 'auto' | 'always' | 'never'; autoPan?: boolean } = {},
  ): void {
    if (this.disposed) return;
    const content = build(this.w, this.h);
    const r = content.intrinsic ?? { x: 0, y: 0, w: 0, h: 0 };
    // `autoPan` (default true) centers the content's bounds in the
    // viewport — what tile demos want. Pass `false` when the caller
    // supplied world-space coordinates that should render literally
    // (e.g. the screean nav helper, where field bounds = the active
    // button's canvas-local rect and re-centering would put the
    // highlight in the middle of the sidebar instead of on the
    // active item).
    const autoPan = opts.autoPan ?? true;
    const panX = autoPan ? (this.w - r.w) / 2 - r.x : 0;
    const panY = autoPan ? (this.h - r.h) / 2 - r.y : 0;
    this.currentScene = scene(
      { particleCount: this.particleCount },
      camera({ viewport: { w: this.w, h: this.h }, pan: [panX, panY] }, content),
    );

    const mode = opts.spawn ?? 'auto';
    const shouldSpawn =
      mode === 'always' ||
      (mode === 'auto' && this.world.particles.length === 0);

    if (shouldSpawn) {
      this.world.particles.length = 0;
      const origin =
        this.spawnFrom === 'edge'
          ? ({ kind: 'edge', width: this.w, height: this.h } as const)
          : ({ kind: 'point', x: this.w / 2, y: this.h / 2 } as const);
      this.world.addParticles(
        spawn({
          n: this.particleCount,
          origin,
          color: TRANSPARENT,
          speed: this.spawnSpeed,
          toward: { x: this.w / 2, y: this.h / 2 },
        }),
      );
    }

    this.currentScene.tick(0);
    this.currentScene.bindAll(this.world.particles, { kind: 'bounds-area' });
    this.recolor();
  }

  // Re-sample colors for currently-living particles. Call after a palette
  // change (theme switch) or to refresh the cloud's color distribution.
  recolor(): void {
    const c = makeColor(this.palette);
    for (const p of this.world.particles) {
      if (p.life > 0) p.color = c();
    }
  }

  // Apply a new theme's palette/feel without rebuilding the canvas.
  // Internally re-binds the scene so motion immediately matches the new feel.
  retheme(palette: Palette, feel: keyof typeof feels, feelOverrides?: Partial<FeelPreset>): void {
    if (this.disposed) return;
    this.palette = palette;
    this.feelKey = feel;
    this.feelOverrides = feelOverrides ?? {};
    const f = this.resolvedFeel();
    this.world.setHashCellSize(Math.max(4, Math.ceil(f.repelRadius)));
    this.world.setForces(this.buildForces());
    this.recolor();
  }

  // Live-tune individual force constants without changing the underlying
  // preset name. Merges into the override layer; subsequent calls compose.
  // The Force Playground uses this to wire sliders directly to physics.
  //
  // Why not setForces? Two reasons:
  //   1. Callers want partial updates. They'd have to know every other
  //      knob's current value to rebuild the full force list.
  //   2. The override layer is already the right abstraction — it's how
  //      themes carry tweaks on top of presets.
  setFeelOverrides(o: Partial<FeelPreset>): void {
    if (this.disposed) return;
    this.feelOverrides = { ...this.feelOverrides, ...o };
    const f = this.resolvedFeel();
    this.world.setHashCellSize(Math.max(4, Math.ceil(f.repelRadius)));
    this.world.setForces(this.buildForces());
  }

  // Read the resolved feel — preset + accumulated overrides. Used by the
  // playground to seed slider initial values from authoritative state
  // rather than mirroring DEFAULTS in two places.
  getResolvedFeel(): Readonly<FeelPreset> {
    return this.resolvedFeel();
  }

  // The current Scene. Returns null if `setScene` has not been called yet.
  // Experiments that route pointer events (via routePointerEvent or
  // pointerTracker) need direct access to the scene's camera + hitTest.
  // Stage's setScene/recolor flow is the supported way to mutate scene
  // structure; this accessor is read-only for callers.
  getScene(): ReturnType<typeof scene> | null {
    return this.currentScene;
  }

  // Update the palette used for re-color sampling, without re-running the
  // force stack. Used by interactive components that want hover/press visual
  // feedback expressed as a recolor of the bound particles.
  setPalette(palette: Palette): void {
    if (this.disposed) return;
    this.palette = palette;
  }

  resize(w: number, h: number): void {
    if (this.disposed) return;
    this.w = w;
    this.h = h;
    this.world.resize(w, h);
    this.renderer.resize(w, h);
  }

  // Hook for the shared ticker. Internal — consumers don't call this.
  step(dt: number): void {
    if (this.disposed) return;
    this.currentScene?.tick(dt);
    this.world.tick(dt);
    this.renderer.draw(this.world.particles, this.world.width, this.world.height);
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    ticker.remove(this);
    this.world.particles.length = 0;
  }
}

// Shared RAF ticker. Owns a single requestAnimationFrame loop; each Stage
// registered receives a step(dt). Pauses itself when no stages are active to
// avoid burning CPU on tabs that have torn down.
class Ticker {
  private stages = new Set<Stage>();
  private last = 0;
  private rafHandle = 0;
  private running = false;

  add(s: Stage): void {
    this.stages.add(s);
    if (!this.running) this.start();
  }
  remove(s: Stage): void {
    this.stages.delete(s);
    if (this.stages.size === 0) this.stop();
  }

  private start(): void {
    this.running = true;
    this.last = performance.now();
    const loop = (now: number) => {
      if (!this.running) return;
      const dt = Math.min(0.05, (now - this.last) / 1000);
      this.last = now;
      // Snapshot to an array — Set iteration over a live mutating set during
      // step() (a stage that disposes mid-step) would otherwise be unsafe.
      const snapshot = Array.from(this.stages);
      for (const s of snapshot) s.step(dt);
      this.rafHandle = requestAnimationFrame(loop);
    };
    this.rafHandle = requestAnimationFrame(loop);
  }

  private stop(): void {
    this.running = false;
    if (this.rafHandle) cancelAnimationFrame(this.rafHandle);
    this.rafHandle = 0;
  }
}

export const ticker = new Ticker();

// Window-level pointer source. Returns the latest known pointer position in
// client coordinates, or null if the pointer hasn't moved yet. Used by the
// hero canvas which spans the viewport.
//
// Listener attachment is deferred to first call so this module is safe to
// import in Node-based test environments (vitest), where `window` is not
// defined. The first call in a real browser session attaches the listeners
// and subsequent calls simply read the cached snapshot.
let pointerListenersAttached = false;
let pointerSnapshot: PointerSnapshot = null;
export const windowPointer = (): PointerSnapshot => {
  if (!pointerListenersAttached && typeof window !== 'undefined') {
    pointerListenersAttached = true;
    window.addEventListener('pointermove', (e) => {
      pointerSnapshot = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener('pointerleave', () => {
      pointerSnapshot = null;
    });
  }
  return pointerSnapshot;
};
