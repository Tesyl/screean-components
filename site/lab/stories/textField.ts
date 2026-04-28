// TextField story — chromed input. Real <input> via DOM mirror; particles
// render the chrome + the typed text. onInput fires per keystroke; we
// wire it to onActivate so each keystroke pulses the dissolve. (For a
// production form you'd debounce or skip dissolve on input — this is a
// design tool, the rapid pulse is a useful tactile preview.)

import { textField, type Handler } from '../../../src/components';
import type { LabStory } from '../types';

export const textFieldStory: LabStory = {
  name: 'text-field',
  title: 'TextField',
  blurb: 'Chromed input — DOM mirror creates a real <input>. Type into the live element to see particles re-form on the new value.',
  defaultProps: {
    value: 'screean',
    width: 280,
    height: 40,
    radius: 8,
    fontSize: 16,
  },
  propDefs: [
    { kind: 'string', key: 'value',    label: 'initial value' },
    { kind: 'number', key: 'width',    label: 'width',     min: 120, max: 480, step: 4 },
    { kind: 'number', key: 'height',   label: 'height',    min: 28,  max: 80,  step: 2 },
    { kind: 'number', key: 'radius',   label: 'radius',    min: 0,   max: 24,  step: 1 },
    { kind: 'number', key: 'fontSize', label: 'font size', min: 11,  max: 28,  step: 1 },
  ],
  build: (props, onActivate: Handler) =>
    textField({
      value: String(props.value ?? ''),
      width: Number(props.width),
      height: Number(props.height),
      radius: Number(props.radius),
      font: `500 ${props.fontSize}px ui-monospace, "SF Mono", Menlo, monospace`,
      onChange: onActivate,
    }),
  codeTemplate: `textField({
  value: '{{value}}',
  width: {{width}},
  height: {{height}},
  radius: {{radius}},
  font: '500 {{fontSize}}px ui-monospace, "SF Mono", Menlo, monospace',
  onChange: (e) => { /* read e.value, rebuild with new value */ },
})`,
};
