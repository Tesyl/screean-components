// Radio story — group exclusivity, not just the visual primitive.
//
// Pattern A: createRadioGroup owns only-one-selected. Activating a radio
// checks it, programmatically un-checks its siblings (no sibling dissolve —
// setChecked is state sync, not activation), and ONLY the activated radio
// round-trips. The previous version (git history) showed a single SDF
// radio and punted exclusivity to "the consumer".

import { createRadioGroup } from '../../../src/components';
import type { LabStory } from '../types';
import { storyCaption, storyColumn, storyReadout, teardownOf } from '../kit';

// The options are the transition core's force presets — selecting one in a
// real app would re-tune the feel; here it demonstrates the group contract.
const FEEL_OPTIONS = ['taut', 'balanced', 'dreamy'] as const;

export const radioStory: LabStory = {
  name: 'radio',
  title: 'Radio',
  blurb:
    'Radio group. Exclusivity lives in the group; only the activated radio dissolves.',
  mount: (host, screen) => {
    const col = storyColumn();
    const log = storyReadout('selected: taut');

    const group = createRadioGroup({
      screen,
      options: FEEL_OPTIONS.map((value) => ({
        label: `feel: ${value}`,
        value,
        checked: value === 'taut',
      })),
      onChange: (value) => log.set(`selected: ${value}`),
    });

    col.append(
      storyCaption(
        'Pick one. The group un-checks siblings programmatically (no dissolve — that is state sync, not activation); the radio you clicked dissolves with its dot lit.',
      ),
      group.el,
      log.el,
    );
    host.appendChild(col);

    return teardownOf(col, group);
  },
  code: `const group = createRadioGroup({
  screen,
  options: [
    { label: 'feel: taut',     value: 'taut', checked: true },
    { label: 'feel: balanced', value: 'balanced' },
    { label: 'feel: dreamy',   value: 'dreamy' },
  ],
  onChange: (value) => setFeel(value),
  // dissolveOnSelect: true    // default — only the ACTIVATED radio cycles
});
host.appendChild(group.el);
group.select('dreamy');        // programmatic — syncs state, no dissolve`,
};
