// Toggle (switch) story — same flip-then-dissolve contract as checkbox.
//
// Pattern A: a real <button role="switch" aria-checked> with track + knob
// as real inner nodes. The knob slides via a CSS transition on the live
// element; the dissolve then captures the settled on/off visual. The
// previous version (git history) drew the pill + thumb from SDF circles
// and rebuilt the scene per knob change.

import { headlessToggle } from '../../../src/components';
import type { LabStory } from '../types';
import { storyCaption, storyColumn, storyReadout, teardownOf } from '../kit';

export const toggleStory: LabStory = {
  name: 'toggle',
  title: 'Toggle',
  blurb:
    'Binary switch. role=switch + aria-checked on a real element; flip → repaint → dissolve.',
  mount: (host, screen) => {
    const col = storyColumn();
    const log = storyReadout('switch: off');

    const sw = headlessToggle({
      screen,
      ariaLabel: 'Demo switch', // no visible text — the name is mandatory
      checked: false,
      onChange: (checked) => log.set(`switch: ${checked ? 'on' : 'off'}`),
    });

    col.append(
      storyCaption(
        'Click or Space to flip. The knob slides on the live element first (state flipped, onChange fired), then the settled visual round-trips through particles.',
      ),
      sw.el,
      log.el,
    );
    host.appendChild(col);

    return teardownOf(col, sw);
  },
  code: `const sw = headlessToggle({
  screen,
  ariaLabel: 'Enable sync',      // switches have no visible text — name it
  checked: false,
  onChange: (checked) => apply(checked),
  // dissolveOnChange: true      // default — flip, repaint, then dissolve
});
host.appendChild(sw.el);`,
};
