/// <reference types="vite/client" />
// six-showcase · chalk — white particles on black.
//
// The chalk colorway of the showcase. The whole implementation now lives in
// sixShowcaseInk.ts, parameterized by `theme`; this module just binds the
// 'chalk' colorway so the experiment registry's `mount(root)` (no options)
// renders white-on-black. See COLORWAYS in sixShowcaseInk.ts.
import { mount as showcaseMount, type SixInkHandle } from './sixShowcaseInk';

export const mount = (root: HTMLElement): SixInkHandle =>
  showcaseMount(root, { theme: 'chalk' });
