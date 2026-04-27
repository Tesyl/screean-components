// SPA bootstrap. Single-theme world (Acid). The router discriminates:
//   • landing             → site/pages/landing
//   • components          → site/pages/components
//   • experiments index   → site/pages/experiments
//   • experiment / <name> → lazy-loaded site/experiments/<name>
//
// Why we keep the theme system: applyTheme(DEFAULT_THEME) writes CSS
// variables to <body>; the stylesheet only consumes vars. Flipping back to
// a multi-theme world is one applyTheme() call away.

import { startRouter, type Route } from './router';
import { applyTheme, DEFAULT_THEME } from './themes';
import { renderLanding } from './pages/landing';
import { renderComponents } from './pages/components';
import { renderExperimentsIndex, renderExperiment } from './pages/experiments';

let teardown: (() => void) | null = null;
// Generation counter — async experiment renders need to know whether
// their result is still relevant when they resolve. If the route changed
// while an `await` was in flight, we discard the late mount.
let routeGeneration = 0;

const render = async (r: Route): Promise<void> => {
  teardown?.();
  teardown = null;
  if (!window.location.hash) {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }
  applyTheme(DEFAULT_THEME);

  const myGen = ++routeGeneration;

  if (r.kind === 'landing') {
    teardown = renderLanding(DEFAULT_THEME);
    return;
  }
  if (r.kind === 'components') {
    teardown = renderComponents(DEFAULT_THEME);
    return;
  }
  if (r.kind === 'experiments') {
    teardown = renderExperimentsIndex();
    return;
  }
  // r.kind === 'experiment' — lazy-load and mount.
  const t = await renderExperiment(r.name);
  // If the user navigated away while the experiment was loading, skip the
  // mount. The previous teardown already fired so leaving t orphaned is the
  // worst case — but t hasn't actually mounted DOM yet either: the awaited
  // function returned the teardown after attaching to #app. To stay safe we
  // run the teardown immediately so any DOM it added is removed.
  if (myGen !== routeGeneration) {
    t();
    return;
  }
  teardown = t;
};

startRouter({ onRoute: (r) => { void render(r); } });
