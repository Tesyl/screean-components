// Label story — non-interactive text. Tunable: visible text, font, role.
// No onChange wiring; activation comes from the panel's Trigger button.

import { label } from '../../../src/components';
import type { LabStory } from '../types';

export const labelStory: LabStory = {
  name: 'label',
  title: 'Label',
  blurb: 'Non-interactive text. Particles render the glyphs at the chosen size + role. Use the Trigger button to fire the dissolve.',
  defaultProps: {
    label: 'the6ixCollective',
    fontWeight: 400,
    fontSize: 32,
    ariaRole: 'heading',
  },
  propDefs: [
    { kind: 'string', key: 'label',      label: 'text' },
    { kind: 'number', key: 'fontWeight', label: 'font weight', min: 100, max: 900, step: 100 },
    { kind: 'number', key: 'fontSize',   label: 'font size',   min: 12,  max: 96,  step: 2 },
    { kind: 'enum',   key: 'ariaRole',   label: 'aria role',   options: ['heading', 'text'] },
  ],
  build: (props) =>
    label({
      label: String(props.label ?? ''),
      font: `${props.fontWeight} ${props.fontSize}px system-ui, -apple-system, sans-serif`,
      ariaRole: props.ariaRole as 'heading' | 'text',
    }),
  codeTemplate: `label({
  label: '{{label}}',
  font: '{{fontWeight}} {{fontSize}}px system-ui, -apple-system, sans-serif',
  ariaRole: '{{ariaRole}}',
})`,
};
