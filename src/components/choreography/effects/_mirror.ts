// Shared helper for mirror-scope effects. Locates the DOM mirror div for a
// component via `mirrorHost.querySelector('[data-component-id="..."]')`. Lives
// here (not inside an effect) so multiple effects can share the lookup without
// duplicating the selector pattern.

import type { Component } from '../../types';

export const findMirrorDiv = (
  host: HTMLElement,
  componentId: string | undefined,
): HTMLDivElement | null => {
  if (!componentId) return null;
  return host.querySelector<HTMLDivElement>(
    `[data-component-id="${componentId}"]`,
  );
};

// Resolve the target component for a mirror-scope effect: explicit `target`
// wins, else falls back to ctx.component. Returns null when neither is set;
// callers no-op gracefully (with a once-only dev warning if they want).
export const resolveMirrorTarget = (
  explicit: Component | undefined,
  fromCtx: Component | undefined,
): Component | null => explicit ?? fromCtx ?? null;
