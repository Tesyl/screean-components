// Checkbox story for the lab. Tunable opts: checked state, dimensions,
// corner radius. onChange wired to the lab's activate callback.
//
// Note: the checked state isn't really "tunable" the way label is — it
// flips on each click. The default value is the initial state; clicking
// then alternates it via the onChange / activate path.

import { checkbox, type Handler } from '../../../src/components';
import type { LabStory } from '../types';

export const checkboxStory: LabStory = {
  name: 'checkbox',
  title: 'Checkbox',
  blurb: 'Boolean state. Square chrome with a centered mark when checked. onChange fires the dissolve cycle.',
  defaultProps: {
    checked: false,
    size: 36,
    radius: 4,
  },
  propDefs: [
    { kind: 'boolean', key: 'checked', label: 'checked (initial)' },
    { kind: 'number',  key: 'size',    label: 'size',    min: 16, max: 80, step: 2 },
    { kind: 'number',  key: 'radius',  label: 'radius',  min: 0,  max: 20, step: 1 },
  ],
  build: (props, onActivate: Handler) =>
    checkbox({
      checked: Boolean(props.checked),
      width: Number(props.size),
      height: Number(props.size),
      radius: Number(props.radius),
      onChange: onActivate,
    }),
  codeTemplate: `checkbox({
  checked: {{checked}},
  width: {{size}},
  height: {{size}},
  radius: {{radius}},
  onChange: (e) => dissolve.trigger(e.component),
})`,
};
