// label — a non-interactive component that materializes text. Wraps screean's
// `text()` scene sugar in a component() so layout containers (row, column,
// stack) and future event/a11y code can address it as a single unit.
//
// Non-interactive: no handler bag. If a consumer wants clickable text they
// can use `button({ label: '...' })` or compose their own with `component()`.

import { node, text, type SceneNode } from 'screean';
import { component } from './component';
import type { BaseComponentOpts, Component } from './types';

export type LabelOpts = Pick<BaseComponentOpts, 'id'> & {
  // Visible text content; also doubles as the accessible label.
  label: string;
  // CSS font shorthand. Defaults differ by ariaRole — see `defaultFontFor`.
  // Screean's underlying text() field defaults to `bold 96px` which is very
  // rarely what a label wants, so label() always resolves a default before
  // handing off.
  font?: string;
  // Semantic role for the a11y mirror. Defaults to 'text' — a generic,
  // not-heading piece of body content. Pass 'heading' for h1-equivalents.
  ariaRole?: 'heading' | 'text';
  // Per-component z in the scene graph. Useful when a label must draw above
  // or below sibling components.
  z?: number;
};

// Per-role default font. Labels are used for both body text and headings,
// and each wants a different base size; picking sensible defaults here
// means consumers don't need to remember to pass a font for every label.
// Consumers that want precise sizing still pass `font` explicitly.
const defaultFontFor = (role: 'heading' | 'text'): string =>
  role === 'heading'
    ? '400 32px system-ui, -apple-system, "Segoe UI", sans-serif'
    : '400 16px system-ui, -apple-system, "Segoe UI", sans-serif';

export const label = (opts: LabelOpts): Component => {
  const role = opts.ariaRole ?? 'text';
  const font = opts.font ?? defaultFontFor(role);
  const leaf = node(text({ text: opts.label, font }), { z: opts.z ?? 0 });
  return component(leaf as SceneNode, {
    id: opts.id,
    ariaRole: role,
    // The visible text IS the accessible label by construction — no way for it
    // to drift, no way for the consumer to forget.
    ariaLabel: opts.label,
    // Captured so the DOM mirror renders at the same size as the particles.
    font,
  });
};
