// Slider story — the 'live-dom' strategy (Decision §5).
//
// A drag is CONTINUOUS interaction: rasterizing it away would kill the
// gesture. So the slider stays real and interactive through its steady
// state — drag, arrows, Home/End all work on real DOM at 60fps — and only
// the transition EDGE rasterizes: double-click captures track + fill +
// thumb at the CURRENT value and round-trips them. The previous version
// (git history) rebuilt the whole SDF scene on every value change, which
// is exactly the case Pattern B was wrong for.

import { headlessSlider } from '../../../src/components';
import type { LabStory } from '../types';
import { storyCaption, storyColumn, storyReadout, teardownOf } from '../kit';

export const sliderStory: LabStory = {
  name: 'slider',
  title: 'Slider',
  blurb:
    'Continuous range — live drag on real DOM; double-click rasterizes the current value.',
  mount: (host, screen) => {
    const col = storyColumn();
    const log = storyReadout('value: 40');

    const slider = headlessSlider({
      screen,
      value: 40,
      ariaLabel: 'Demo value',
      onChange: (v) => log.set(`value: ${v}`),
    });
    // The dissolve EDGE for a continuous control is a deliberate gesture,
    // not part of the drag — same wiring as the button-grid exemplar.
    const onDblClick = (): void => void slider.dissolve();
    slider.el.addEventListener('dblclick', onDblClick);

    col.append(
      storyCaption(
        'Drag, or focus and use arrows / Home / End — all live, never rasterized. Double-click to dissolve: the fill and thumb burst at the value you left them at.',
      ),
      slider.el,
      log.el,
    );
    host.appendChild(col);

    const teardown = teardownOf(col, slider);
    return () => {
      slider.el.removeEventListener('dblclick', onDblClick);
      teardown();
    };
  },
  code: `const slider = headlessSlider({
  screen,
  value: 40,                       // min 0 · max 100 · step 1 defaults
  ariaLabel: 'Demo value',
  onChange: (v) => apply(v),       // live echo — fires during the drag
});
host.appendChild(slider.el);
// the transition edge is a deliberate gesture, not the drag:
slider.el.addEventListener('dblclick', () => void slider.dissolve());`,
};
