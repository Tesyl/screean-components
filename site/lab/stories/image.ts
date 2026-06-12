// Image story — decode-then-dissolve.
//
// Pattern A: a real <img>. The image-specific concern is readiness —
// rasterizing before the bitmap decodes samples an empty silhouette, so
// headlessImage's dissolve() awaits decode() first. The source here is a
// programmatic canvas exported as a data: URL — explicitly the safe input
// class for the rasterizer (no cross-origin tainting; see the DECISION
// doc's url() gotcha). The previous version (git history) fed the canvas
// straight into the SDF image factory's pixel sampler.

import { headlessButton, headlessImage } from '../../../src/components';
import type { LabStory } from '../types';
import { storyCaption, storyColumn, teardownOf } from '../kit';

const SOURCE_SIZE_PX = 96;
const RENDER_SIZE_PX = 160;
const RING_STEP_PX = 6;
const RING_COLOR = 'rgba(199, 255, 81,';
const BACKDROP_COLOR = '#06050d';

// Programmatic rings pattern → data: URL. Pure for a fixed size; built
// once at mount.
const ringsDataUrl = (size: number): string => {
  const c = document.createElement('canvas');
  c.width = size;
  c.height = size;
  const ctx = c.getContext('2d');
  if (!ctx) return '';
  ctx.fillStyle = BACKDROP_COLOR;
  ctx.fillRect(0, 0, size, size);
  for (let r = size / 2; r > 4; r -= RING_STEP_PX) {
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, r, 0, Math.PI * 2);
    ctx.strokeStyle = `${RING_COLOR} ${1 - (r / (size / 2)) * 0.7})`;
    ctx.lineWidth = 2;
    ctx.stroke();
  }
  return c.toDataURL('image/png');
};

export const imageStory: LabStory = {
  name: 'image',
  title: 'Image',
  blurb:
    'Real <img>. dissolve() awaits decode() so the rasterizer never samples an empty bitmap.',
  mount: (host, screen) => {
    const col = storyColumn();

    const img = headlessImage({
      screen,
      src: ringsDataUrl(SOURCE_SIZE_PX),
      alt: 'Concentric rings test pattern',
      width: RENDER_SIZE_PX,
      height: RENDER_SIZE_PX,
    });
    const trigger = headlessButton({
      screen,
      label: 'Dissolve image',
      dissolveOnActivate: false, // the trigger stays put; the image cycles
      onClick: () => void img.dissolve(),
    });

    col.append(
      storyCaption(
        'A data: URL source — the safe input class for the rasterizer (same-origin, no canvas tainting). Dissolve awaits decode() first, then captures the painted bitmap.',
      ),
      img.el,
      trigger.el,
    );
    host.appendChild(col);

    return teardownOf(col, img, trigger);
  },
  code: `const img = headlessImage({
  screen,
  src: '/assets/pattern.png',    // same-origin or data: — never a tainting src
  alt: 'Concentric rings test pattern',
  width: 160,
  height: 160,
});
host.appendChild(img.el);
await img.dissolve();            // awaits decode() before rasterizing`,
};
