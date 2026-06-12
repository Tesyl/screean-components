// Button story — the library's signature interaction.
//
// Pattern A: each button is a REAL <button> (headlessButton). Activation
// contract: business onClick runs FIRST, on the live element, then the
// dissolve round-trip plays. The previous version (git history) returned a
// scene-graph SDF button rebuilt per knob change; here the buttons just sit
// in the page and the browser supplies focus, Enter/Space, and semantics.

import { headlessButton } from '../../../src/components';
import type { LabStory } from '../types';
import { storyCaption, storyColumn, storyReadout, storyRow, teardownOf } from '../kit';

const ACTIONS = ['Save', 'Duplicate', 'Reset'] as const;

export const buttonStory: LabStory = {
  name: 'button',
  title: 'Button',
  blurb:
    'Activation control. Real <button>; onClick runs live, then the element round-trips through particles.',
  mount: (host, screen) => {
    const col = storyColumn();
    const log = storyReadout('— click a button —');

    const buttons = ACTIONS.map((label) =>
      headlessButton({
        screen,
        label,
        onClick: () => log.set(`${label} activated`),
      }),
    );
    // Disabled sibling — proves aria-disabled + pointer-events gating
    // without any mirror plumbing.
    const disabled = headlessButton({
      screen,
      label: 'Submit',
      disabled: true,
      onClick: () => log.set('Submit activated (should never log)'),
    });

    col.append(
      storyCaption(
        'Tab to focus · Enter / Space or click to activate. The handler fires on the live element; the dissolve is the transition artifact, not the click.',
      ),
      storyRow([...buttons.map((b) => b.el), disabled.el]),
      log.el,
    );
    host.appendChild(col);

    return teardownOf(col, ...buttons, disabled);
  },
  code: `const save = headlessButton({
  screen,                       // the shared ScreenController
  label: 'Save',
  onClick: () => commit(),      // runs first, live
  // dissolveOnActivate: true   // default — element → particles → element
});
host.appendChild(save.el);`,
};
