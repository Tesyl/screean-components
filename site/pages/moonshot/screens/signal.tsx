// SIGNAL — placeholder until the DOM-first rewrite. See horizon.tsx for the
// rationale.

import type { ReactNode } from 'react';
import { Link } from '../engine/router';

export const Signal = (): ReactNode => (
  <div className="moonshot-placeholder">
    <p className="moonshot-placeholder__eyebrow">SIGNAL  ·  COMING SOON</p>
    <h1 className="moonshot-placeholder__title">The console is being rebuilt.</h1>
    <p className="moonshot-placeholder__body">
      Signal will be a normal HTML form whose submit dissolves the inputs
      into a transmission, then reforms a confirmation in their place.
      Awaiting the dissolve primitive proven at the test page.
    </p>
    <Link to="test" className="moonshot-placeholder__link">
      → see the test page
    </Link>
  </div>
);
