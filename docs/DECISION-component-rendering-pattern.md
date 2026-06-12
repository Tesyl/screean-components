# DECISION — Component rendering pattern & styling-layer seam

**Status:** Accepted · **EXECUTED 2026-06-11** (see [`headless-components-guide.md`](./headless-components-guide.md) for the canonical post-migration guide)
**Author:** Kolbe
**Date:** 2026-06-03
**Scope:** `screean-components/src/components/` (the component library) and the dissolve/reform transition core shared with `screean/react`.
**Supersedes / unifies:** the three parallel dissolve implementations (see Consequences).
**Companion:** [`ui-rendering-pattern-audit.md`](./ui-rendering-pattern-audit.md) — the inventory and migration plan this decision acts on.

---

## TL;DR

We are building a **from-scratch, headless component library** (a shadcn-equivalent — our own primitives, not a wrapper over an existing DOM library). Components author a **real DOM element as the single source of truth** and render through the **DOM-rasterize dissolve/reform pattern** ("Pattern A"): `real DOM → bitmapFieldFromElement → particles → reform`.

The rasterizer will be **style-system-agnostic** (it reads *computed* styles, or uses the native paint path), so a styling layer **like Tailwind can be added later with no coupling**. The headless split *is* the compatibility guarantee.

We are collapsing the **three** existing dissolve implementations into **one** shared transition core. That consolidation is the prioritized next step.

---

## Context

The audit found two architecturally different mechanisms that both "dissolve and reform," sharing vocabulary but not code:

- **Pattern A (premier):** real DOM is the source of truth, rasterized via `bitmapFieldFromElement` and reformed. Fidelity = whatever the browser paints. Lives in ~5 demo/binding sites (`html-interop`, `html-interop-2`, `moonshot/engine/canvas.tsx`, `screean/react` `ScreenProvider`, `site/lib/effects/componentReel.ts`).
- **Pattern B (today's component default):** UI drawn from SDF primitives (`rect`+`text`+`circle`), with an *invisible* DOM mirror for a11y only, "dissolve" via a choreography recipe bursting the bound particle pool. Never rasterizes real CSS. This is the entire `src/components/` library, all lab stories, and the controls/button-grid/routing/visual-fallaway demos.

Three implementations of the same conceptual primitive now coexist: `choreography/effects/dissolve.ts`, `dom/dissolveAndReform.ts` (`createDissolve`), and the hand-rolled state machines in html-interop/moonshot/react. This duplication is the primary maintenance pain motivating this decision.

## Decision

1. **Pattern A is the standard** way discrete components render. The DOM element is the single source of truth; the particle cloud is a transition artifact, not a parallel UI representation.
2. **The library is headless and built from scratch.** No dependency on shadcn/Radix/etc. Structure + behavior live in our components; visual styling is a swappable layer on top.
3. **The rasterizer is style-system-agnostic.** It captures *computed* styles (or uses the native `drawElementImage` path where available) — never class names or a specific stylesheet. Consequently a styling layer like Tailwind, vanilla CSS, or our own tokens can be adopted later without touching the particle pipeline.
4. **One transition core.** `screean/react`'s state machine (or a framework-agnostic extraction of it) becomes the single dissolve/swap engine; the other two implementations are deleted.
5. **Pattern B stays only where genuinely needed** — the live interactive steady state of *continuous* controls (slider drag, text input/IME). Even there, the transition edges rasterize.

## Styling-layer compatibility (the "can we add Tailwind later?" question)

**Yes, with no fundamental problem** — provided #3 holds. The earlier Tailwind pain was an un-hardened serializer meeting Tailwind v4's emitted stylesheet, not Tailwind itself. The clean seam:

```
component (headless: structure + behavior)
  → styling layer (Tailwind / CSS / tokens)   ← swappable, rasterizer-invisible
  → computed-style snapshot                    ← the only thing the rasterizer reads
  → bitmapFieldFromElement                     ← style-system-agnostic
```

Two rasterize sub-paths, different exposure to this:

- **`drawElementImage` (native, Chromium, dormant):** rasterizes the actually-painted element. Tailwind-later is a complete non-issue. Not portable yet.
- **`foreignObject` (portable, today):** the serialized SVG must be self-contained — this is where styling matters. Safe **iff** we inline *computed* styles rather than embedding a stylesheet.

**Gotchas to bake into the rasterizer's input contract** (true for any styling layer):

1. **`url()` tainting** — `background-image:url()`, `mask`, SVG icons from another origin taint the canvas → `getImageData` throws. Strip/replace or inline as same-origin `data:` URLs. (Tailwind `bg-[url(...)]`, icon masks hit this.)
2. **Web fonts** — must be embedded as `data:` URLs for foreignObject; `await document.fonts.ready` before rasterizing.
3. **Pseudo-elements & states** — `::before/::after`, `:hover`, rings, dividers need explicit `getComputedStyle(el, '::before')` capture or they vanish. (Tailwind leans on these.)
4. **`backdrop-filter` / `filter:url()`** — spotty in foreignObject; fine on the native path.
5. **Caching** — cache the `BitmapField` per (component, visual-state); only re-rasterize when rendered appearance changes.

## Consequences

- **Positive:** one source of truth per component; full visual fidelity (gradients, shadows, real fonts); styling system becomes a free variable; three dissolve impls collapse to one.
- **Cost:** building a robust style-system-agnostic serializer (the foreignObject inlining + font embedding + url sanitizing), or gating on the native path. One-time pipeline investment, not per-component.
- **Risk:** continuous controls need careful discrete/continuous boundary handling (audit Step 0) so we don't rasterize away live interaction.

## Alternatives considered

- **Keep Pattern B (SDF primitives) as the library default** — rejected: fidelity ceiling (no real CSS), two sources of truth to hand-sync, and it's why html-interop exists.
- **Wrap shadcn/Radix** — rejected: the user wants a from-scratch headless library; no need to couple to an external library.

## Next step

Execute the migration plan in [`ui-rendering-pattern-audit.md` §4](./ui-rendering-pattern-audit.md#4-migration-plan), **re-prioritized so consolidation comes first** (the duplicate implementations are the active pain):

1. **Step 1 first — collapse to one transition core.** Extract `ScreenProvider`'s state machine into a framework-agnostic controller; delete `dom/dissolveAndReform.ts` and reconcile `choreography/effects/dissolve.ts`. Rewrite the legacy tick-boundary tests against behavior, not tick numbers.
2. Step 0 — classify discrete vs continuous components (sets the rasterize boundary).
3. Step 2 — add the style-system-agnostic real-DOM rasterize path to one factory (`button`), validated against the html-interop visual.
4. Steps 3–4 — migrate the showcases onto it, then delete dead paths and document.

Smallest valuable slice: **Step 1 (one core) + a single rasterize-mode `button`.**
