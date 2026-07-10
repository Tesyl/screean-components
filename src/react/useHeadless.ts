// useHeadless — the bridge between React's tree and the imperative,
// factory-created real DOM that Pattern A components are.
//
// One hook, one job: create the headless component inside an effect, append
// its element into a `display: contents` host span, dispose on cleanup. The
// wrappers in this module build on it with a three-tier prop model:
//
//   Tier 1 — callbacks (onClick/onChange/…): routed through latest-refs.
//            Never in the effect deps; a new inline arrow never recreates
//            the element.
//   Tier 2 — controlled values with factory setters (checked, value):
//            synced by a separate compare-first effect against the handle's
//            getter. NOTE: the factories echo `onChange` on programmatic
//            writes, so a genuine controlled update fires one onChange with
//            the applied value — compare-first only prevents *redundant*
//            echoes.
//   Tier 3 — structural props (label, min/max, unstyled, …): included in
//            `deps`; a change disposes and recreates the element.
//
// Lifecycle invariants (load-bearing — see docs/react-wrappers.md):
//   • Child effects run BEFORE <ScreenProvider>'s boot effect. The first
//     pass sees no controller and must return early (no throw); the
//     provider's context-identity flip on boot re-runs the effect.
//   • StrictMode double-invokes effects: create in the effect, dispose in
//     its cleanup, never create during render.
//   • The element appends only in effects, so the host renders empty on the
//     server — no hydration mismatch, no useLayoutEffect needed.

import { useEffect, useRef, useState, type RefObject } from 'react';
import { useScreenOptional } from '@tesyl/screean/react';
import type { ScreenController } from '../components/transition';
import { NO_SCREEN_WARNING } from './constant';

// The minimal shape useHeadless needs — satisfied by every ElementComponent
// handle and by RadioGroup.
export type HeadlessHandle = {
  readonly el: HTMLElement;
  readonly dispose: () => void;
};

/** A ref that always holds the latest value — the callback trampoline seam. */
export const useLatest = <T,>(value: T): RefObject<T> => {
  const ref = useRef(value);
  ref.current = value;
  return ref;
};

// Object-valued tier-3 props (style, radio options) are content-compared via
// JSON so an inline literal doesn't recreate the element every render.
export const depKeyOf = (value: unknown): string | undefined =>
  value === undefined ? undefined : JSON.stringify(value);

let warnedNoScreen = false;

export const useHeadless = <H extends HeadlessHandle>(
  // Factory closure. Read through a latest-ref, so it is intentionally NOT a
  // dep — when tier-3 `deps` change, the re-run picks up the current props.
  create: (screen: ScreenController) => H,
  // Tier-3 structural props ONLY.
  deps: ReadonlyArray<unknown>,
  // Explicit controller override — beats context. The test seam, and the
  // interop path for hosts that own a controller outside React.
  screenOverride?: ScreenController,
): { hostRef: RefObject<HTMLSpanElement | null>; handle: H | null } => {
  const api = useScreenOptional();
  const hostRef = useRef<HTMLSpanElement | null>(null);
  // State (not a ref) on purpose: portal children (ScreeanCard) need a
  // render-visible `el`, and tier-2 sync effects must re-fire after a
  // tier-3 recreation.
  const [handle, setHandle] = useState<H | null>(null);
  const createRef = useLatest(create);

  useEffect(() => {
    const host = hostRef.current;
    const screen = screenOverride ?? api?.controller() ?? null;
    if (!host || !screen) {
      // Pre-boot first pass: the provider's api identity flips once the
      // controller boots, re-running this effect. Warn only for the
      // genuinely-unwired case.
      if (!screenOverride && api === null && !warnedNoScreen) {
        warnedNoScreen = true;
        console.warn(NO_SCREEN_WARNING);
      }
      return;
    }
    const h = createRef.current(screen);
    host.appendChild(h.el);
    setHandle(h);
    return () => {
      setHandle(null);
      h.dispose(); // dispose() detaches the element (toElementComponent)
    };
    // createRef is a stable latest-ref; deps carry the tier-3 props.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, screenOverride, ...deps]);

  return { hostRef, handle };
};
