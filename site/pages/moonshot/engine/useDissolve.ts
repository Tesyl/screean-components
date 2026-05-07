// useDissolve / useSwap — React hooks that wrap the imperative canvas API.
//
// The imperative API on the canvas is fine, but most consumers want one of
// two patterns and don't want to reach into refs in the click handler:
//
//   const dissolve = useDissolve(buttonRef);
//   <button ref={buttonRef} onClick={() => dissolve()}>Click me</button>
//
//   const swap = useSwap(fromRef, toRef);
//   <button ref={fromRef} onClick={() => swap()}>Send →</button>
//
// Both return a stable function that triggers the transition and resolves
// when it finishes (so callers can `await` and run post-transition logic).

import { useCallback, type RefObject } from 'react';
import { useCanvas } from './canvas';

export const useDissolve = (
  ref: RefObject<HTMLElement | null>,
): (() => Promise<void>) => {
  const { dissolve } = useCanvas();
  return useCallback(() => dissolve(ref.current), [dissolve, ref]);
};

export const useSwap = (
  fromRef: RefObject<HTMLElement | null>,
  toRef: RefObject<HTMLElement | null>,
): (() => Promise<void>) => {
  const { swap } = useCanvas();
  return useCallback(
    () => swap(fromRef.current, toRef.current),
    [swap, fromRef, toRef],
  );
};
