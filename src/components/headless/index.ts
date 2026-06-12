// Headless (DOM-first / Pattern A) component barrel.
//
// These factories author REAL DOM elements as the single source of truth and
// transition through the shared core in ../transition. They are the
// library's standard going forward (DECISION-component-rendering-pattern.md);
// the scene-graph factories in ../factories are the legacy Pattern B surface.

export { headlessButton } from './button';
export {
  headlessSlider,
  clampToStep,
  valueFromPointer,
} from './slider';
export { headlessLabel, type HeadlessLabelOpts } from './label';
export { headlessCard, type HeadlessCardOpts } from './card';
export {
  headlessCheckbox,
  type CheckboxComponent,
  type HeadlessCheckboxOpts,
} from './checkbox';
export {
  headlessToggle,
  type HeadlessToggleOpts,
  type ToggleComponent,
} from './toggle';
export {
  createRadioGroup,
  headlessRadio,
  type HeadlessRadioOpts,
  type RadioComponent,
  type RadioGroup,
  type RadioGroupOpts,
} from './radio';
export { headlessImage, type HeadlessImageOpts } from './image';
export {
  headlessTextField,
  type HeadlessTextFieldOpts,
  type TextFieldComponent,
} from './textField';
export { applyStyles, applyBaseOpts, toElementComponent } from './element';

export type {
  ElementComponent,
  HeadlessBaseOpts,
  HeadlessButtonOpts,
  HeadlessSliderOpts,
  SliderComponent,
} from './types';
