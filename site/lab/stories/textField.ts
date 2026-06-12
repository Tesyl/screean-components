// TextField story — the second 'live-dom' exemplar (Decision §5).
//
// A real <input type="text">: typing, IME composition, selection, and the
// caret are the browser's. Only the COMMIT edge dissolves — when the value
// settles (blur or Enter), the field round-trips with the committed text
// painted in. The previous version (git history) pulsed a dissolve on
// every keystroke through the mirror's onInput; per-keystroke rasterize is
// precisely what the live-dom strategy exists to avoid.

import { headlessTextField } from '../../../src/components';
import type { LabStory } from '../types';
import { storyCaption, storyColumn, storyReadout, teardownOf } from '../kit';

export const textFieldStory: LabStory = {
  name: 'text-field',
  title: 'TextField',
  blurb:
    'Real <input> — typing is live; the COMMIT edge (Enter / blur) dissolves the settled value.',
  mount: (host, screen) => {
    const col = storyColumn();
    const log = storyReadout('typing: screean · committed: —');

    let committed = '—';
    const field = headlessTextField({
      screen,
      ariaLabel: 'Demo field',
      value: 'screean',
      placeholder: 'type, then Enter',
      onInput: (value) => log.set(`typing: ${value} · committed: ${committed}`),
      onCommit: (value) => {
        committed = value;
        log.set(`typing: ${value} · committed: ${committed}`);
      },
    });

    col.append(
      storyCaption(
        'Type freely — caret, selection, and IME are native and never rasterized. Press Enter or blur to commit: the field dissolves with the settled value painted in.',
      ),
      field.el,
      log.el,
    );
    host.appendChild(col);

    return teardownOf(col, field);
  },
  code: `const field = headlessTextField({
  screen,
  ariaLabel: 'Project name',       // inputs need a name; placeholder isn't one
  value: 'screean',
  onInput: (v) => preview(v),      // per keystroke, live
  onCommit: (v) => save(v),        // change event — blur or Enter
  // dissolveOnCommit: true        // default — only the commit edge cycles
});
host.appendChild(field.el);`,
};
