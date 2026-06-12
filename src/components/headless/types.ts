// Headless component types — the DOM-first component model (Pattern A).
//
// A headless component authors a REAL DOM element as its single source of
// truth. Structure + behavior live here; visual styling is a swappable layer
// (default inline skin, or `unstyled` + your own classes). The particle
// cloud is a transition artifact produced by rasterizing the element — never
// a parallel UI representation.
//
// Contrast with the legacy scene-graph model (../types.ts `Component`):
// there the component IS a SceneNode with an invisible DOM mirror; here the
// component IS a DOM element with no scene-graph presence at rest.

import type {
  AriaRole,
  RENDER_STRATEGY_BY_ROLE,
} from '../types';
import type { Prettify, ScreenController } from '../transition';

// The DOM-first component handle. `E` preserves the concrete element type;
// `R` couples the role to its compile-time render strategy.
export type ElementComponent<
  E extends HTMLElement = HTMLElement,
  R extends AriaRole = AriaRole,
> = {
  // The real element — append it wherever it should live. It is the
  // accessibility surface, the event surface, and the rasterize source.
  readonly el: E;
  readonly role: R;
  // Compile-time strategy for this role ('rasterize' | 'live-dom').
  readonly strategy: (typeof RENDER_STRATEGY_BY_ROLE)[R];
  // Round-trip this element through the transition core:
  // element → particles → element. Resolves on settle.
  readonly dissolve: () => Promise<void>;
  // Morph this element's silhouette into another component's. The target
  // should start hidden (opacity 0); it fades in during `reforming`.
  readonly swapTo: (into: ElementComponent) => Promise<void>;
  // Remove listeners and detach the element.
  readonly dispose: () => void;
};

// Opts shared by every headless factory.
export type HeadlessBaseOpts = {
  // The shared transition core this component dissolves through.
  screen: ScreenController;
  // Accessible name. Factories with visible text default it from the label.
  ariaLabel?: string;
  disabled?: boolean;
  // Skip the default inline skin entirely — bring your own styling layer.
  // (Rasterization then depends on that layer honoring the rasterizer input
  // contract: self-contained styles, no cross-origin url() references.)
  unstyled?: boolean;
  // Class hook for external styling layers (works with unstyled or on top
  // of the default skin).
  className?: string;
  // Inline style overrides, merged over the default skin.
  style?: Partial<CSSStyleDeclaration>;
};

export type HeadlessButtonOpts = Prettify<
  HeadlessBaseOpts & {
    label: string;
    onClick: (e: MouseEvent) => void;
    // Run the dissolve round-trip as part of activation. Default true —
    // this is the signature interaction of the library. Business `onClick`
    // always runs first, on the live element.
    dissolveOnActivate?: boolean;
  }
>;

export type HeadlessSliderOpts = Prettify<
  HeadlessBaseOpts & {
    // Controlled-with-internal-echo: `value` seeds the position; the slider
    // updates its own visuals live during the gesture (this is the
    // 'live-dom' strategy — never rasterize away live interaction) and
    // reports each change through `onChange`. Use `setValue` to drive it
    // externally.
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    onChange?: (value: number) => void;
  }
>;

export type SliderComponent = Prettify<
  ElementComponent<HTMLDivElement, 'slider'> & {
    readonly value: () => number;
    readonly setValue: (next: number) => void;
  }
>;
