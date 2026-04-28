// Card story — non-interactive container with title + body text.
// Tunable: title, body, dimensions, fonts. Trigger via panel button.

import { card } from '../../../src/components';
import type { LabStory } from '../types';

export const cardStory: LabStory = {
  name: 'card',
  title: 'Card',
  blurb: 'Decorative container — title + body text inside a rounded chrome. Used as a building block for richer surfaces (stat cards, tooltips, etc).',
  defaultProps: {
    title: 'Particles, Bound',
    body: 'state changes feel like matter moving',
    width: 320,
    height: 120,
    radius: 12,
    titleSize: 18,
    bodySize: 13,
  },
  propDefs: [
    { kind: 'string', key: 'title',     label: 'title' },
    { kind: 'string', key: 'body',      label: 'body' },
    { kind: 'number', key: 'width',     label: 'width',      min: 160, max: 480, step: 4 },
    { kind: 'number', key: 'height',    label: 'height',     min: 60,  max: 240, step: 4 },
    { kind: 'number', key: 'radius',    label: 'radius',     min: 0,   max: 32,  step: 1 },
    { kind: 'number', key: 'titleSize', label: 'title size', min: 12,  max: 32,  step: 1 },
    { kind: 'number', key: 'bodySize',  label: 'body size',  min: 10,  max: 22,  step: 1 },
  ],
  build: (props) =>
    card({
      title: String(props.title ?? ''),
      body: String(props.body ?? ''),
      width: Number(props.width),
      height: Number(props.height),
      radius: Number(props.radius),
      titleFont: `700 ${props.titleSize}px system-ui, -apple-system, sans-serif`,
      bodyFont: `400 ${props.bodySize}px system-ui, -apple-system, sans-serif`,
    }),
  codeTemplate: `card({
  title: '{{title}}',
  body: '{{body}}',
  width: {{width}},
  height: {{height}},
  radius: {{radius}},
  titleFont: '700 {{titleSize}}px system-ui, -apple-system, sans-serif',
  bodyFont: '400 {{bodySize}}px system-ui, -apple-system, sans-serif',
})`,
};
