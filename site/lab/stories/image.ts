// Image story — bitmap → particle field. Decorative; uses the panel's
// Trigger button for activation (no onClick on image components).
//
// Source: a programmatic canvas drawn at mount with a customizable
// pattern (rings, grid, gradient). Real image files would land at
// site/assets/ and be loaded via `?url` import.

import { image } from '../../../src/components';
import type { LabStory } from '../types';

// Lazy-init programmatic source so the story object can be defined
// statically. Built once per story-mount; rebuilds on prop change reuse it.
let cachedSource: HTMLCanvasElement | null = null;
let cachedPattern: string | null = null;
let cachedSize = 0;

const buildSource = (size: number, pattern: string): HTMLCanvasElement => {
  if (cachedSource && cachedSize === size && cachedPattern === pattern) {
    return cachedSource;
  }
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#06050d';
  ctx.fillRect(0, 0, size, size);
  if (pattern === 'rings') {
    for (let r = size / 2; r > 4; r -= 6) {
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(199, 255, 81, ${1 - r / (size / 2) * 0.7})`;
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  } else if (pattern === 'grid') {
    ctx.strokeStyle = 'rgba(199, 255, 81, 0.55)';
    ctx.lineWidth = 1;
    const step = Math.max(6, size / 12);
    for (let i = step; i < size; i += step) {
      ctx.beginPath();
      ctx.moveTo(i, 0); ctx.lineTo(i, size);
      ctx.moveTo(0, i); ctx.lineTo(size, i);
      ctx.stroke();
    }
  } else { // 'glow'
    const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(199, 255, 81, 0.95)');
    grad.addColorStop(1, 'rgba(199, 255, 81, 0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
  }
  cachedSource = c;
  cachedSize = size;
  cachedPattern = pattern;
  return c;
};

export const imageStory: LabStory = {
  name: 'image',
  title: 'Image',
  blurb: 'Bitmap → particle field. Pre-loaded HTMLImageElement / Canvas / OffscreenCanvas; particles bind to opaque pixels weighted by alpha. role=img.',
  defaultProps: {
    pattern: 'rings',
    sourceSize: 96,
    renderSize: 160,
  },
  propDefs: [
    { kind: 'enum',   key: 'pattern',    label: 'pattern',    options: ['rings', 'grid', 'glow'] },
    { kind: 'number', key: 'sourceSize', label: 'source px',  min: 32,  max: 256, step: 8 },
    { kind: 'number', key: 'renderSize', label: 'render px',  min: 64,  max: 320, step: 8 },
  ],
  build: (props) =>
    image({
      source: buildSource(Number(props.sourceSize), String(props.pattern)),
      width: Number(props.renderSize),
      height: Number(props.renderSize),
      ariaLabel: `image · ${props.pattern}`,
    }),
  codeTemplate: `image({
  source: /* HTMLImageElement | ImageBitmap | Canvas */,
  width: {{renderSize}},
  height: {{renderSize}},
  ariaLabel: 'image · {{pattern}}',
})`,
};
