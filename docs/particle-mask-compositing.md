# Particles as a punch-through mask (frosted-glass reveal)

## TL;DR

You can use a live particle field as a **mask** that reveals a sharp,
colorful backdrop through a frosted (blurred) layer — the canvas equivalent of
CSS `backdrop-filter: blur()` + `mask-composite: exclude` — **without paying a
per-frame blur cost.** The trick is to blur the backdrop *once* into a bitmap
and composite each frame with two `drawImage` calls:

```
frostCtx.drawImage(frostBitmap)                          // pre-blurred glass
frostCtx.globalCompositeOperation = 'destination-out'
frostCtx.drawImage(particleMaskCanvas)                   // particles erase glass
```

A static **sharp** copy of the same backdrop sits in a canvas behind the frost,
so every erased hole reveals crisp color. See
[`site/experiments/particleMask.ts`](../site/experiments/particleMask.ts) for the
worked example (route: `/experiments/particle-mask`).

## Why not CSS `backdrop-filter` + a canvas mask?

The naive port of the CSS prototype — keep `backdrop-filter: blur()` on a DOM
layer and swap the static SVG mask for the particle canvas — does **not**
translate, for two reasons:

1. **CSS can't reference a live `<canvas>` as `mask-image`.** The only portable
   way to feed canvas pixels into a CSS mask is `canvas.toDataURL()` every
   frame, which encodes a PNG per frame — catastrophic.
2. **`backdrop-filter` re-runs the blur every frame** the masked region moves.
   Blur + a moving mask + a live particle field is the exact trio that drops
   frames on mobile.

The canvas-composite version sidesteps both: the mask is just another canvas
passed to `drawImage`, and the blur is precomputed.

## The layer stack

Three surfaces, two of them static:

| Layer | Role | Cost |
| --- | --- | --- |
| `sharpCanvas` (bottom, visible) | crisp backdrop; shows through holes | painted **once** per resize |
| `frostCanvas` (top, visible) | frost + per-frame punch | 2 `drawImage`/frame |
| `maskCanvas` (**detached**) | the particle Stage renders here | particle sim + render |

The mask canvas is **never added to the DOM** — a `Stage` renders into it (the
engine renders to a canvas regardless of attachment), and the composite loop
reads its backing store via `drawImage`.

## Configuring the Stage as a mask source

Only **alpha coverage** matters for `destination-out`/`destination-in` — color is
irrelevant. Render solid, opaque particles:

```ts
new Stage({
  canvas: detachedMaskCanvas,
  portal: true,        // transparent canvas: only particle pixels are opaque
  bloom: false,        // source-over alpha → solid coverage (additive can dilute)
  particleSize: 2.4,   // bigger sprite → bigger reveal hole
  trailAlpha: 0.45,    // high = crisp holes; low = comet-trail reveals
  // palette is moot for a mask; set white opaque per-particle after spawn
});
```

`portal: true` keeps everything but the particles transparent, so the mask is a
clean alpha stencil. `bloom: false` matters: additive blending sums toward white
but can leave soft, sub-1.0 alpha at sprite edges — fine for glow, lossy for a
stencil.

## Normal vs inverted punch

One composite-op swap flips the whole effect:

| Op on the particle draw | Result |
| --- | --- |
| `destination-out` | particles **erase** frost → holes reveal sharp backdrop (particles = clear windows) |
| `destination-in` | keep frost **only** where particles are → particles become the frosted spots over a sharp backdrop |

## Performance notes

- **Pre-blur is the whole win.** `ctx.filter = 'blur(Npx)'` is expensive; run it
  once into `frostBitmap` and only rebuild when the blur radius or backdrop
  changes. The per-frame path is two `drawImage`s — GPU-cheap and resolution-
  bound, not blur-bound.
- The experiment ships a **`live blur` toggle** that re-blurs every frame via
  `ctx.filter` to simulate `backdrop-filter` cost. Flip it next to the FPS
  readout to quantify what the pre-blur path buys on your target hardware.
- **Blur in device pixels:** scale the CSS blur radius by `devicePixelRatio`
  (`blur(radius * dpr)`) so the frost looks the same across DPRs.
- **Two RAFs is fine here.** The shared `ticker` drives the Stage's particle
  render into the mask canvas; a second RAF runs the flow step + composite,
  reading the freshest mask each frame. A one-frame lag between them is
  invisible.
- **Reveal contrast** is highest over hard-edged backdrop detail (rings, grids,
  type). Over smooth color blobs, sharp-vs-blurred reads subtly — give the
  backdrop crisp features so the punch-through is legible.

## Related

- [`rendering-blend-modes.md`](./rendering-blend-modes.md) — why `bloom` (additive)
  vs source-over changes what a particle contributes; the basis for using
  `bloom: false` to get a clean stencil.
