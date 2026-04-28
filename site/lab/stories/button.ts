// Button story for the lab. Tunable opts: label text, dimensions, font.
// onClick is wired to the lab's activate callback so every click triggers
// the dissolve choreography.

import { button, type Handler } from '../../../src/components';
import type { LabStory } from '../types';

export const buttonStory: LabStory = {
  name: 'button',
  title: 'Button',
  blurb: 'Activation control. Rounded chrome + label. onClick fires the dissolve cycle on every click.',
  defaultProps: {
    label: 'TAP ME',
    width: 220,
    height: 64,
    radius: 14,
    fontWeight: 700,
    fontSize: 22,
  },
  propDefs: [
    { kind: 'string', key: 'label', label: 'label' },
    { kind: 'number', key: 'width',  label: 'width',  min: 80,  max: 400, step: 4 },
    { kind: 'number', key: 'height', label: 'height', min: 30,  max: 140, step: 2 },
    { kind: 'number', key: 'radius', label: 'radius', min: 0,   max: 40,  step: 1 },
    { kind: 'number', key: 'fontWeight', label: 'font weight', min: 100, max: 900, step: 100 },
    { kind: 'number', key: 'fontSize',   label: 'font size',   min: 10,  max: 48,  step: 1 },
  ],
  build: (props, onActivate: Handler) =>
    button({
      label: String(props.label ?? ''),
      width: Number(props.width),
      height: Number(props.height),
      radius: Number(props.radius),
      font: `${props.fontWeight} ${props.fontSize}px ui-monospace, "SF Mono", Menlo, monospace`,
      onClick: onActivate,
    }),
  codeTemplate: `button({
  label: '{{label}}',
  width: {{width}},
  height: {{height}},
  radius: {{radius}},
  font: '{{fontWeight}} {{fontSize}}px ui-monospace, "SF Mono", Menlo, monospace',
  onClick: (e) => dissolve.trigger(e.component),
})`,
};
