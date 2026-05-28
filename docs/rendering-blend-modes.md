# Rendering blend modes — and how to render dark particles on a light surface

## TL;DR

Particles default to **additive ("bloom") blending**, which can only *brighten*
the surface beneath them. A black particle is `(0,0,0)` and adds nothing, so it
is **invisible on any background**. To render dark particles on a light surface
you must switch off bloom (use source-over alpha) **and** give the cloud a light
surface to composite onto.

`Stage` now forwards two opts that make this possible:

```ts
new Stage({
  // …
  bloom: false,            // source-over alpha instead of additive
  portal: true,            // transparent canvas; CSS surface shows through
  // background: '255,255,255', // alt: opaque-mode white (see below)
  palette: INK_PALETTE,    // near-black charcoal (lit ≈ 0.06)
});
```

See `site/experiments/sixLogoInk.ts` for a complete worked example (the
dark-on-light twin of `sixLogo.ts`).

## Why additive hides dark particles

Both backends pick their blend from the `bloom` flag:

| `bloom` | Canvas2D (`Canvas2DRenderer.ts`) | WebGL (`WebGLRenderer.ts`) | Result |
| --- | --- | --- | --- |
| `true` (default) | `globalCompositeOperation = 'lighter'` | `blendFunc(ONE, ONE)` | additive: `dst = dst + src` — glow; can only brighten |
| `false` | `globalCompositeOperation = 'source-over'` | `blendFunc(ONE, ONE_MINUS_SRC_ALPHA)` | standard alpha: pigment composites *over* and darkens |

Under additive, `src = (0,0,0)` contributes `dst + 0 = dst`. The particle leaves
no mark. This is true on a dark *or* light background — it's the blend, not the
palette. Cranking saturation, alpha, or lightness will not help; the only fix is
turning bloom off.

### The WebGPU backend has no bloom

`WebGPURenderer` is the exception: its particle pipeline blend is hardcoded to
source-over alpha (`one` / `one-minus-src-alpha`) — there is **no additive
mode** and no `bloom` opt. So WebGPU-only experiments (e.g. `six-showcase`)
already composite dark-on-light correctly; they only need a white surface +
dark palette. Pass `background: '255,255,255'` to `createRendererAsync` — in
opaque mode the WebGPU renderer clears *and* trail-paints to that color each
frame. See `site/experiments/sixShowcaseInk.ts` for a worked example.

## Getting a white surface

Two routes, both work:

1. **Portal + CSS (recommended).** `portal: true` makes the canvas transparent;
   paint the element behind it white (`wrap.style.background = '#ffffff'`). The
   white is present on frame 0, so there is **no dark flash** while the cloud
   assembles. Portal-mode trail fade erases toward transparent, revealing white.

2. **Opaque + `background`.** `portal: false` with `background: '255,255,255'`.
   The renderer paints the trail/clear overlay white. Simpler wiring, but the
   opaque framebuffer starts dark and **converges** to white over the first few
   trail-overlay frames — a brief flash unless `trailAlpha` is high.

## Palette and depth on a light surface

- A near-black charcoal (`lit ≈ 0.06`, `sat: 0`) reads as rich ink; pure `#000`
  (`lit: 0`) can look harsh against soft sprite edges.
- If your effect uses **depth-cued alpha** (mapping camera-space z to an alpha
  ramp), raise the *floor*. A far particle at alpha 46 glows acceptably on dark
  but is ~18% gray — washed out — on white. `sixLogoInk.ts` lifts the floor to
  `110` so the whole silhouette stays confidently dark while preserving depth
  order.
- `trailAlpha` near `0.9` clears almost fully each frame → crisp dots, no wake.
  Lower values (≈`0.18`) leave inky, fading trails.

## Backward compatibility

`Stage` forwards `bloom`/`background` as `undefined` when omitted, so the
renderer's own defaults (bloom on, dark background) stand. Existing experiments
are unaffected — only callers that explicitly opt out change behavior.
