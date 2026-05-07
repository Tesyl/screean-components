// ATLAS — placeholder until the DOM-first rewrite. See horizon.tsx for the
// rationale.

import type { ReactNode } from 'react';
import { Link } from '../engine/router';

export const Atlas = (): ReactNode => (
  <div className="moonshot-placeholder">
    <p className="moonshot-placeholder__eyebrow">ATLAS  ·  COMING SOON</p>
    <h1 className="moonshot-placeholder__title">Three worlds are being rebuilt.</h1>
    <p className="moonshot-placeholder__body">
      Atlas will be the swap-on-click playground — a labeled grid where
      tiles dissolve and reform into detail panels. Awaiting the canvas
      refactor that lives at the test page.
    </p>
    <Link to="test" className="moonshot-placeholder__link">
      → see the test page
    </Link>
  </div>
);
