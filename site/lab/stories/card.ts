// Card story — DOM-first composition.
//
// Pattern A's whole point in one component: the card's children are real
// nodes, so when the card dissolves the rasterizer captures EVERYTHING
// painted inside it — heading, body, borders, shadow — with no per-child
// geometry to hand-sync. The previous version (git history) composed
// SDF rects + text runs and rebuilt on every knob change.

import { headlessCard, headlessLabel } from '../../../src/components';
import type { LabStory } from '../types';
import { storyCaption, storyColumn, storyReadout, teardownOf } from '../kit';
import { CAPTION_COLOR, STORY_FONT_FAMILY } from '../constant';

export const cardStory: LabStory = {
  name: 'card',
  title: 'Card',
  blurb:
    'Container that composes real children. Dissolving it captures the whole painted subtree.',
  mount: (host, screen) => {
    const col = storyColumn();
    const log = storyReadout('— click the card —');

    const title = headlessLabel({
      screen,
      text: 'Particles, Bound',
      heading: true,
    });
    const body = document.createElement('p');
    body.textContent =
      'state changes feel like matter moving — the card, its title, and this paragraph all rasterize as one silhouette.';
    body.style.margin = '0';
    body.style.maxWidth = '300px';
    body.style.fontFamily = STORY_FONT_FAMILY;
    body.style.fontSize = '13px';
    body.style.lineHeight = '1.5';
    body.style.color = CAPTION_COLOR;

    const card = headlessCard({
      screen,
      ariaLabel: 'Demo card',
      children: [title.el, body],
      onClick: () => log.set('card activated'),
    });

    col.append(
      storyCaption(
        'The children are real nodes (a headlessLabel heading + a plain <p>). Click the card: onClick runs live, then the composed visual dissolves as one.',
      ),
      card.el,
      log.el,
    );
    host.appendChild(col);

    // The title's handle is disposed too — its element lives inside the
    // card, but its dispose() only detaches/cleans, which is safe twice.
    return teardownOf(col, card, title);
  },
  code: `const title = headlessLabel({ screen, text: 'Particles, Bound', heading: true });
const body = document.createElement('p');
body.textContent = 'real children, one silhouette';

const card = headlessCard({
  screen,
  children: [title.el, body],   // real nodes — composition is just DOM
  onClick: () => select(),      // optional activation; dissolves like a button
});
host.appendChild(card.el);`,
};
