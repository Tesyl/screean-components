// Label story — decorative text, heading and text variants.
//
// Pattern A: headlessLabel renders a real <h2> (heading) or <span> (text).
// Labels carry no handlers, so the story supplies activation via trigger
// buttons (headlessButton with dissolveOnActivate: false — the trigger
// itself stays put; only the label round-trips). The previous version
// (git history) drew glyphs from SDF text and relied on the controls
// panel's global Trigger button.

import { headlessButton, headlessLabel } from '../../../src/components';
import type { LabStory } from '../types';
import { storyCaption, storyColumn, storyRow, teardownOf } from '../kit';

export const labelStory: LabStory = {
  name: 'label',
  title: 'Label',
  blurb:
    'Decorative text. Real <h2> / <span>; the rasterizer captures the glyphs exactly as painted.',
  mount: (host, screen) => {
    const col = storyColumn();

    const heading = headlessLabel({
      screen,
      text: 'the6ixCollective',
      heading: true,
    });
    const text = headlessLabel({
      screen,
      text: 'state changes feel like matter moving',
    });

    // Triggers don't dissolve themselves — they fire the LABEL's cycle.
    const dissolveHeading = headlessButton({
      screen,
      label: 'Dissolve heading',
      dissolveOnActivate: false,
      onClick: () => void heading.dissolve(),
    });
    const dissolveText = headlessButton({
      screen,
      label: 'Dissolve text',
      dissolveOnActivate: false,
      onClick: () => void text.dissolve(),
    });

    col.append(
      storyCaption(
        'Two variants: heading (real <h2>, role comes free from the tag) and text (<span>). Labels have no handlers — the buttons below fire their dissolve.',
      ),
      heading.el,
      text.el,
      storyRow([dissolveHeading.el, dissolveText.el]),
    );
    host.appendChild(col);

    return teardownOf(col, heading, text, dissolveHeading, dissolveText);
  },
  code: `const heading = headlessLabel({
  screen,
  text: 'the6ixCollective',
  heading: true,               // real <h2>; omit for a <span> (role 'text')
});
host.appendChild(heading.el);
// decorative — no handlers; transition it from a layout:
await heading.dissolve();`,
};
