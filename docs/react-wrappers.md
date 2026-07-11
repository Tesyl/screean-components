# React Wrappers — `@tesyl/screean-components/react`

The nine Pattern A headless factories, consumable as React components. The
wrappers own ONLY the React lifecycle; the factories stay the single source
of truth for structure, behavior, ARIA, and transitions
(`ARCHITECTURE-components.md`).

## Quick start

```tsx
'use client'; // Next.js App Router — every entry is browser-only

import { ScreenProvider, ScreeanButton, ScreeanSlider } from '@tesyl/screean-components/react';

export default function App() {
  const [v, setV] = useState(40);
  return (
    <ScreenProvider feel="taut">
      <ScreeanButton label="Save" onClick={save} />
      <ScreeanSlider value={v} onChange={setV} />
    </ScreenProvider>
  );
}
```

`<ScreenProvider>` (re-exported from `@tesyl/screean/react`) owns the overlay
canvas + one `ScreenController`; every wrapper in the tree finds it through
context. Alternative: pass an explicit `screen` prop (a `ScreenController`)
to any wrapper — the interop seam for hosts that own a controller outside
React, and the test seam.

## The bridge: `useHeadless`

Each wrapper renders a `display: contents` host `<span>` and, inside an
effect, creates the factory component, appends `component.el` into the host,
and disposes on cleanup. `display: contents` keeps the host out of layout —
the factory element behaves as a direct child of the wrapper's parent.

Lifecycle invariants (load-bearing):

- **Provider boot ordering** — child effects run before the provider's boot
  effect. The first pass sees no controller and returns early; the provider's
  context-identity flip on boot re-runs the creation effect. Never throw on
  the pre-boot pass.
- **StrictMode** — create in the effect, dispose in its cleanup. Never create
  during render (leaks an element + listeners on the discarded pass).
- **SSR/hydration** — the host renders empty on the server; the element
  appends only in effects. No mismatch; do not "fix" with `useLayoutEffect`.

## The three-tier prop model

| Tier | Props | Mechanism | Recreates element? |
| --- | --- | --- | --- |
| 1 — callbacks | `onClick`, `onChange`, `onInput`, `onCommit`, `onReady` | latest-ref trampoline | never |
| 2 — controlled values | `checked`, `value` | compare-first setter sync effect | never |
| 3 — structural | `label`, `text`, `min/max/step`, `src/alt`, `disabled`, `unstyled`, `className`, `style`, `particleCount`, `dissolveOn*`, radio `options` | effect deps | yes — dispose + recreate |

Notes:

- **Tier-2 onChange echo.** The factories echo `onChange` on programmatic
  writes (`setChecked`/`setValue`/`select`). Compare-first sync prevents
  *redundant* echoes, but a genuine controlled update fires ONE `onChange`
  with the applied value. React's same-value `setState` bail keeps the
  standard `value`+`onChange` controlled pattern from looping.
- **Slider clamping.** The sync compares against the CLAMPED target
  (`clampToStep`), so an out-of-range `value` prop converges instead of
  re-echoing every render.
- **TextField is loosely controlled while editing.** The `value` sync is
  skipped while the input has focus (writing under the caret clobbers
  caret/IME). External values apply once the field blurs.
- **Object-valued tier-3 props** (`style`, radio `options`) are
  JSON-compared, so inline literals don't recreate every render.
- **`style` is `Partial<CSSStyleDeclaration>`** — the factory contract, NOT
  `React.CSSProperties`. Numeric values would land unitless.
- **Don't derive tier-3 props from tier-2 state** (e.g.
  `label={`Agree (${checked})`}`). The activation's setState recreates the
  element before its dissolve rasterizes — the transition is skipped and the
  engine logs a "zero layout size" rasterize warning (tolerated, no crash).
  Keep dynamic text OUTSIDE the component, or accept the skip.

## Imperative handles

Every wrapper exposes the factory handle via `ref` (React 19 ref-as-prop):

```tsx
const btn = useRef<ScreeanButtonHandle>(null);
<ScreeanButton ref={btn} label="Save" onClick={save} />
// btn.current?.dissolve() / swapTo(other.current!) / isTransitioning() / el
```

The handle is `null` until the creation effect runs (and momentarily during
a tier-3 recreation).

## Building custom wrappers

`useHeadless(create, tier3Deps, screenOverride?)` and `useLatest` are
exported — a custom factory following `headless/button.ts` gets a React
wrapper in ~20 lines (see `src/react/button.tsx` as the exemplar).
