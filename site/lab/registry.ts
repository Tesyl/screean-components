// Lab story registry. Each entry is a self-contained story file that
// implements the LabStory contract. Adding a story = create
// site/lab/stories/<name>.ts + append it here. Order matters: it's the
// order they appear in the sidebar nav.

import type { LabStory } from './types';
import { buttonStory } from './stories/button';
import { checkboxStory } from './stories/checkbox';

export const STORIES: ReadonlyArray<LabStory> = [
  buttonStory,
  checkboxStory,
];

export const findStory = (name: string): LabStory | undefined =>
  STORIES.find((s) => s.name === name);
