// Public React surface for the `./react` subpath export.
//
// Two layers:
//   • Component wrappers — <ScreeanButton/> etc. over the Pattern A headless
//     factories, bridged into React by useHeadless (see useHeadless.ts for
//     the three-tier prop model and lifecycle invariants).
//   • <SixInkBackground/> — the six-ink GPU hero as a React component.
//
// The engine's <ScreenProvider>/useScreen are re-exported so a React
// consumer needs only this package's imports; '@tesyl/screean/react' stays
// EXTERNAL in the lib build (bundling it would ship a second provider
// context — the dual-module context bug).

export { SixInkBackground, type SixInkBackgroundProps } from './sixInk';

// ─── Component wrappers ──────────────────────────────────────────────────────
export { ScreeanButton, type ScreeanButtonProps, type ScreeanButtonHandle } from './button';
export { ScreeanLabel, type ScreeanLabelProps, type ScreeanLabelHandle } from './label';
export { ScreeanCard, type ScreeanCardProps, type ScreeanCardHandle } from './card';
export {
  ScreeanCheckbox,
  type ScreeanCheckboxProps,
  type ScreeanCheckboxHandle,
} from './checkbox';
export { ScreeanToggle, type ScreeanToggleProps, type ScreeanToggleHandle } from './toggle';
export {
  ScreeanRadioGroup,
  type ScreeanRadioGroupProps,
  type ScreeanRadioGroupHandle,
} from './radioGroup';
export { ScreeanImage, type ScreeanImageProps, type ScreeanImageHandle } from './image';
export {
  ScreeanTextField,
  type ScreeanTextFieldProps,
  type ScreeanTextFieldHandle,
} from './textField';
export { ScreeanSlider, type ScreeanSliderProps, type ScreeanSliderHandle } from './slider';

// ─── Bridge (build custom wrappers on the same seam) ─────────────────────────
export { useHeadless, useLatest, type HeadlessHandle } from './useHeadless';

// ─── Engine provider re-exports (one-stop imports) ───────────────────────────
export {
  ScreenProvider,
  useScreen,
  useScreenOptional,
  useDissolve,
  useSwap,
  useWorld,
  usePortalField,
  type ScreenAPI,
  type ScreenProviderProps,
  type FeelName,
} from '@tesyl/screean/react';
