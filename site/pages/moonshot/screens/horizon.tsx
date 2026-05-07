// HORIZON — placeholder. The DOM-first rewrite of the hero is queued
// behind the /moonshot/test proof of the dissolve+swap primitives. Until
// that lands, this route shows a "coming soon" panel that links to the
// test page so the moonshot subtree still routes cleanly.

import type { ReactNode } from 'react';
import { Link } from '../engine/router';

export const Horizon = (): ReactNode => (
  <div className="moonshot-placeholder">
    <p className="moonshot-placeholder__eyebrow">HORIZON  ·  COMING SOON</p>
    <h1 className="moonshot-placeholder__title">The hero is being rebuilt.</h1>
    <p className="moonshot-placeholder__body">
      The DOM-first rewrite is in progress. The current proof of the
      dissolve + swap choreography lives at the test page below.
    </p>
    <Link to="test" className="moonshot-placeholder__link">
      → see the test page
    </Link>
  </div>
);
