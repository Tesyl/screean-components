// Constants for the React wrapper layer.

import type { CSSProperties } from 'react';

// The wrapper host must not participate in layout — `display: contents`
// makes the factory-created element a direct layout child of the wrapper's
// parent (flex/grid/inline flows all behave as if the host span weren't
// there). Safe for rasterization: the transition core reads geometry off
// `component.el`, never the host.
export const HOST_STYLE: CSSProperties = { display: 'contents' };

export const NO_SCREEN_WARNING =
  '[screean-components] A Screean* component mounted without a transition ' +
  'controller. Wrap the tree in <ScreenProvider> from @tesyl/screean/react ' +
  '(re-exported by @tesyl/screean-components/react), or pass an explicit ' +
  '`screen` prop.';
