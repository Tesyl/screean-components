// Toggle story — binary switch. Pill chrome + thumb position. Click flips
// state via onChange wired to onActivate.

import { toggle, type Handler } from '../../../src/components';
import type { LabStory } from '../types';

export const toggleStory: LabStory = {
  name: 'toggle',
  title: 'Toggle',
  blurb: 'Binary switch. Pill chrome with a thumb that sits on the off / on edge. role=switch + aria-checked.',
  defaultProps: {
    on: false,
    width: 88,
    height: 40,
  },
  propDefs: [
    { kind: 'boolean', key: 'on',     label: 'on (initial)' },
    { kind: 'number',  key: 'width',  label: 'width',  min: 50, max: 200, step: 4 },
    { kind: 'number',  key: 'height', label: 'height', min: 24, max: 80,  step: 2 },
  ],
  build: (props, onActivate: Handler) =>
    toggle({
      on: Boolean(props.on),
      width: Number(props.width),
      height: Number(props.height),
      onChange: onActivate,
    }),
  codeTemplate: `toggle({
  on: {{on}},
  width: {{width}},
  height: {{height}},
  onChange: (e) => dissolve.trigger(e.component),
})`,
};
