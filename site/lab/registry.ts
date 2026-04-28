// Lab story registry. Each entry is a self-contained story file that
// implements the LabStory contract. Adding a story = create
// site/lab/stories/<name>.ts + append it here. Order matters: it's the
// order they appear in the sidebar nav.

import type { LabStory } from './types';
import { buttonStory } from './stories/button';
import { labelStory } from './stories/label';
import { cardStory } from './stories/card';
import { toggleStory } from './stories/toggle';
import { sliderStory } from './stories/slider';
import { checkboxStory } from './stories/checkbox';
import { radioStory } from './stories/radio';
import { textFieldStory } from './stories/textField';
import { imageStory } from './stories/image';

// Order: visible-text first, then activation controls, then state controls,
// then the rich types. Loose grouping that matches the order someone
// designing a new component might want to evaluate them.
export const STORIES: ReadonlyArray<LabStory> = [
  labelStory,
  buttonStory,
  cardStory,
  toggleStory,
  sliderStory,
  checkboxStory,
  radioStory,
  textFieldStory,
  imageStory,
];

export const findStory = (name: string): LabStory | undefined =>
  STORIES.find((s) => s.name === name);
