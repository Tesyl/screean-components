// Checkbox story — the flip-then-dissolve contract.
//
// Pattern A: a real <button role="checkbox" aria-checked>. Activation
// flips state, repaints the real element, fires onChange, THEN dissolves —
// so the rasterizer always captures the settled, post-change visual (the
// mark you just made is the one that bursts). The previous version (git
// history) drew the box + mark from SDF primitives and rebuilt per knob.

import { headlessCheckbox } from '../../../src/components';
import type { LabStory } from '../types';
import { storyCaption, storyColumn, storyReadout, storyRow, teardownOf } from '../kit';

export const checkboxStory: LabStory = {
  name: 'checkbox',
  title: 'Checkbox',
  blurb:
    'Boolean state. Flip → repaint → dissolve: the cycle captures the NEW state’s pixels.',
  mount: (host, screen) => {
    const col = storyColumn();
    const log = storyReadout('particles: off · trails: on');

    const state = { particles: false, trails: true };
    const echo = (): void =>
      log.set(
        `particles: ${state.particles ? 'on' : 'off'} · trails: ${state.trails ? 'on' : 'off'}`,
      );

    const particles = headlessCheckbox({
      screen,
      label: 'Enable particles',
      checked: state.particles,
      onChange: (checked) => {
        state.particles = checked;
        echo();
      },
    });
    const trails = headlessCheckbox({
      screen,
      label: 'Enable trails',
      checked: state.trails,
      onChange: (checked) => {
        state.trails = checked;
        echo();
      },
    });

    col.append(
      storyCaption(
        'Click or Space to flip. Watch the order: the mark appears (state flipped, onChange fired), then that settled visual dissolves and re-forms.',
      ),
      storyRow([particles.el, trails.el]),
      log.el,
    );
    host.appendChild(col);

    return teardownOf(col, particles, trails);
  },
  code: `const cb = headlessCheckbox({
  screen,
  label: 'Enable particles',
  checked: false,
  onChange: (checked) => apply(checked),  // fires before the dissolve
  // dissolveOnChange: true               // default — captures the NEW state
});
host.appendChild(cb.el);
cb.setChecked(true);                      // programmatic sync — never dissolves`,
};
