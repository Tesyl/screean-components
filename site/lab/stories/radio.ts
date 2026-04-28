// Radio story — single radio button. Ring + inner dot when selected.
// Group semantics (only-one-selected) live in the consumer; the lab
// shows just the visual primitive.

import { radio, type Handler } from '../../../src/components';
import type { LabStory } from '../types';

export const radioStory: LabStory = {
  name: 'radio',
  title: 'Radio',
  blurb: 'Single radio button. Outer ring + filled inner dot when selected. role=radio + aria-checked.',
  defaultProps: {
    checked: false,
    size: 32,
  },
  propDefs: [
    { kind: 'boolean', key: 'checked', label: 'selected (initial)' },
    { kind: 'number',  key: 'size',    label: 'size', min: 16, max: 80, step: 2 },
  ],
  build: (props, onActivate: Handler) =>
    radio({
      checked: Boolean(props.checked),
      width: Number(props.size),
      height: Number(props.size),
      onChange: onActivate,
    }),
  codeTemplate: `radio({
  checked: {{checked}},
  width: {{size}},
  height: {{size}},
  onChange: (e) => dissolve.trigger(e.component),
})`,
};
