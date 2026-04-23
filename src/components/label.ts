// label — a non-interactive component that materializes text. Wraps screean's
// `text()` scene sugar in a component() so layout containers (row, column,
// stack) and future event/a11y code can address it as a single unit.
//
// Non-interactive: no handler bag. If a consumer wants clickable text they
// can use `button({ label: '...' })` or compose their own with `component()`.

import { node, text, type SceneNode } from 'screean';
import { component } from './component';
import type { Component } from './types';

export type LabelOpts = {
  text: string;
  font?: string;
  // Semantic role for eventual a11y mirror. Defaults to 'text' — a generic,
  // not-heading piece of body content. Pass 'heading' for h1-equivalents.
  ariaRole?: 'heading' | 'text';
  id?: string;
  // Per-component z in the scene graph. Useful when a label must draw above
  // or below sibling components.
  z?: number;
};

export const label = (opts: LabelOpts): Component => {
  const leaf = node(text({ text: opts.text, font: opts.font }), { z: opts.z ?? 0 });
  return component(leaf as SceneNode, {
    id: opts.id,
    ariaRole: opts.ariaRole ?? 'text',
    // The visible text IS the accessible label by construction — no way for it
    // to drift, no way for the consumer to forget.
    ariaLabel: opts.text,
  });
};
