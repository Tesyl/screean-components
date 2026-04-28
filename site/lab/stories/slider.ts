// Slider story — continuous-value range. Track + filled portion + thumb.
// Click activation fires dissolve via onActivate.

import { slider, type Handler } from '../../../src/components';
import type { LabStory } from '../types';

export const sliderStory: LabStory = {
  name: 'slider',
  title: 'Slider',
  blurb: 'Continuous range. Track + value-proportional fill + thumb. Reads aria-valuenow / valuemin / valuemax to AT.',
  defaultProps: {
    value: 0.5,
    min: 0,
    max: 1,
    width: 240,
    height: 16,
  },
  propDefs: [
    { kind: 'number', key: 'value',  label: 'value',  min: 0,   max: 1,    step: 0.01, format: (v) => v.toFixed(2) },
    { kind: 'number', key: 'min',    label: 'min',    min: -10, max: 0,    step: 0.5 },
    { kind: 'number', key: 'max',    label: 'max',    min: 0,   max: 100,  step: 1 },
    { kind: 'number', key: 'width',  label: 'width',  min: 120, max: 400,  step: 4 },
    { kind: 'number', key: 'height', label: 'height', min: 8,   max: 48,   step: 1 },
  ],
  build: (props, onActivate: Handler) =>
    slider({
      value: Number(props.value),
      min: Number(props.min),
      max: Number(props.max),
      width: Number(props.width),
      height: Number(props.height),
      onChange: onActivate,
    }),
  codeTemplate: `slider({
  value: {{value}},
  min: {{min}},
  max: {{max}},
  width: {{width}},
  height: {{height}},
  onChange: (e) => dissolve.trigger(e.component),
})`,
};
