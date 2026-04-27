// card — non-interactive container component. A title + body text stacked
// inside a rounded-rect chrome. The simplest non-trivial composition (chrome
// + multiple text leaves) and a useful building block for richer surfaces
// (stat card, media card, etc.).
//
// Like the other component factories here, card is a screean SceneNode subtree
// (rect chrome at z=0, text leaves at z=1) tagged via `component()`.
//
// Font caveat: the DOM mirror only carries one `font` per component, so we
// capture `titleFont` on `_component.font`. The body line will mirror at the
// title's size unless consumer CSS overrides. This is a conscious v1 limit;
// resolves naturally if/when ComponentInternals grows multi-font support.

import { node, rect, stack, text, type SceneNode } from 'screean';
import { component } from './component';
import type { BaseComponentOpts, Component, SizedOpts } from './types';

export type CardOpts = BaseComponentOpts &
  Pick<SizedOpts, 'width' | 'height' | 'radius' | 'z'> & {
    title: string;
    body: string;
    titleFont?: string;
    bodyFont?: string;
  };

export const card = (opts: CardOpts): Component => {
  const width = opts.width ?? 240;
  const height = opts.height ?? 140;
  const radius = opts.radius ?? 12;
  const titleFont =
    opts.titleFont ?? '700 16px system-ui, -apple-system, sans-serif';
  const bodyFont =
    opts.bodyFont ?? '400 13px system-ui, -apple-system, sans-serif';

  const chrome = node(rect({ w: width, h: height, radius }), { z: 0 });
  // Two text children stacked vertically inside the chrome. A nested stack
  // for the text column auto-centers them as a pair; the outer stack centers
  // that column on the chrome.
  const titleLeaf = node(text({ text: opts.title, font: titleFont }), { z: 1 });
  const bodyLeaf = node(text({ text: opts.body, font: bodyFont }), { z: 1 });
  const textColumn: SceneNode = stack([titleLeaf, bodyLeaf], { z: 1 });

  const container = stack([chrome, textColumn], { z: opts.z ?? 0 });

  return component(container, {
    id: opts.id,
    ariaRole: opts.ariaRole ?? 'none',
    ariaLabel: opts.ariaLabel ?? opts.title,
    // titleFont wins for the mirror — it's the visually dominant line. Body
    // text in the mirror inherits the title's font shorthand. Acceptable
    // tradeoff for v1.
    font: titleFont,
  });
};
