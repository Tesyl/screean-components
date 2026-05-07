// NavBar — text nav at the top of every screen. Lives in DOM (not canvas)
// because it's chrome shared across screens; rebuilding it as particles on
// every transition would steal pool slots from the screen's content.
//
// The Link wrapper performs in-app navigation (history.pushState) so the
// React tree + canvas survive across screen changes.

import type { ReactNode } from 'react';
import { Link, useRoute } from '../engine/router';
import type { MoonshotScreenId } from '../constant';

const ITEMS: ReadonlyArray<{ id: MoonshotScreenId; label: string }> = [
  { id: 'horizon', label: 'Horizon' },
  { id: 'atlas',   label: 'Atlas' },
  { id: 'signal',  label: 'Signal' },
  { id: 'test',    label: 'Test' },
];

export const NavBar = (): ReactNode => {
  const { screen } = useRoute();
  return (
    <nav className="moonshot-nav" aria-label="Primary">
      <Link to="horizon" className="moonshot-nav__brand" aria-label="screean home">
        <span className="moonshot-nav__brand-glyph" aria-hidden="true" />
        <span>SCREEAN · MOONSHOT</span>
      </Link>
      <div className="moonshot-nav__links">
        {ITEMS.map((it) => (
          <Link
            key={it.id}
            to={it.id}
            className="moonshot-nav__link"
            // data-active drives the leading dot in CSS
            aria-current={screen === it.id ? 'page' : undefined}
            // pass-through via the underlying anchor element
            // (Link forwards style/className but not data-* — close enough; the
            //  CSS uses :hover and aria-current as the visual cue)
          >
            <span style={screen === it.id ? { color: 'var(--m-starlight)' } : undefined}>
              {it.label}
            </span>
          </Link>
        ))}
      </div>
    </nav>
  );
};
