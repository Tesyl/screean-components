// Routing demo — Pattern A (DOM-first) rewrite.
//
// Three "pages", each a REAL DOM view (heading, description, headlessButton
// rows) living in #content-host. The browser supplies focus, tab order,
// Enter/Space activation, and screen-reader semantics natively — there is no
// mirror to reconcile and no scene graph at rest.
//
// A route change is `screen.swap(currentViewEl, nextViewEl)` on the shared
// transition core: the outgoing view is rasterized (bitmapFieldFromElement),
// particles spawn AT its silhouette and spring to the incoming view's
// silhouette, then the incoming real DOM fades in over the pinned cloud
// (that crossfade is built into the core's `reforming` phase). ONE
// createScreenController persists across every route — the core empties
// world.particles on settle, so the persistent World never leaks.
//
// Contrast with the previous version of this file (git: Pattern B): a World,
// a hand-tuned force stack, a renderer, a 15k-particle spawn, scene subtrees
// per page, a DOM mirror + choreography runner, and a bespoke five-phase nav
// state machine (~490 lines) — all of that is now the transition core's job.
// Per-route hue lives in CSS (`.route-view[data-route]` palette vars) instead
// of a runtime HSL→RGB recolor pass.

import {
  createScreenController,
  headlessButton,
  type ElementComponent,
} from '../../components';
import {
  NAV_BUTTON_MIN_WIDTH_PX,
  PAGES,
  PARTICLE_COUNT,
  PARTICLE_LIGHTNESS_PCT,
  PARTICLE_SATURATION_PCT,
  ROUTE_HUES,
  type Route,
  type RouteButtonSpec,
} from './constant';

// ------------------------------ Boot ---------------------------------------
const canvas = document.getElementById('portal') as HTMLCanvasElement | null;
const host = document.getElementById('content-host') as HTMLDivElement | null;
if (!canvas || !host) throw new Error('Missing #portal or #content-host');

// ONE controller for the whole app: world + forces + renderer + rAF + the
// four-frame machine. It outlives every route.
const screen = createScreenController({ canvas, particleCount: PARTICLE_COUNT });

// ------------------------------ Palette helpers ----------------------------
// The departing view's CSS supplies the base palette (its own hue); these
// inline overrides mix the DESTINATION hue into slots 2/3 so the cloud reads
// as shifting from the old route's color toward the new one mid-flight.
const hslCss = (hue: number): string =>
  `hsl(${Math.round((hue + 360) % 360)} ${PARTICLE_SATURATION_PCT}% ${PARTICLE_LIGHTNESS_PCT}%)`;

// Circular midpoint — 265° → 32° should cross 360°, not sweep through green.
const midHue = (a: number, b: number): number => {
  const d = ((b - a + 540) % 360) - 180;
  return (a + d / 2 + 360) % 360;
};

// ------------------------------ Views ---------------------------------------
// Each view is a fresh real-DOM container per visit (clean listener/element
// lifecycle — same reasoning as the Pattern B version's fresh subtrees).
// Styling comes from routing-demo.html's `.route-view` rules; the rasterizer
// serializes the document's stylesheets into the foreignObject SVG, so
// class-styled content captures faithfully. The one contract: route-accent
// selectors key off the VIEW (`.route-view[data-route=…]`), never `:root` —
// ancestors outside the serialized subtree don't exist inside the SVG.

type View = {
  readonly route: Route;
  readonly el: HTMLDivElement;
  readonly dispose: () => void;
};

const buildView = (route: Route): View => {
  const page = PAGES[route];
  const el = document.createElement('div');
  el.className = 'route-view';
  el.dataset.route = route;

  const heading = document.createElement('h1');
  heading.textContent = page.title;

  const description = document.createElement('p');
  description.textContent = page.description;

  const components: ElementComponent[] = [];
  const buttonRow = (specs: readonly RouteButtonSpec[]): HTMLDivElement => {
    const row = document.createElement('div');
    row.className = 'route-row';
    for (const { label, to } of specs) {
      const b = headlessButton({
        screen,
        label,
        style: {
          minWidth: `${NAV_BUTTON_MIN_WIDTH_PX}px`,
          // Route accent — resolves against the view's [data-route] vars,
          // both live and inside the serialized SVG.
          background: 'var(--accent-bg)',
          border: '1px solid var(--accent)',
        },
        // Nav buttons swap the WHOLE view — a self-dissolve on top would
        // chain a second cycle. Inert buttons keep the default round-trip.
        dissolveOnActivate: to === undefined,
        onClick:
          to === undefined
            ? () => console.info(`[routing] ${label} activated`)
            : () => void navigate(to),
      });
      components.push(b);
      row.appendChild(b.el);
    }
    return row;
  };

  el.append(heading, description, ...page.rows.map(buttonRow));

  return {
    route,
    el,
    dispose: () => {
      for (const c of components) c.dispose();
      el.remove();
    },
  };
};

// ------------------------------ HUD ----------------------------------------
const hudRoute = document.getElementById('hud-route')!;
const hudCount = document.getElementById('hud-count')!;
let visitCount = 0;

const updateHud = (route: Route): void => {
  visitCount++;
  hudRoute.textContent = route;
  hudCount.textContent = String(visitCount);
  // Chrome OUTSIDE the rasterized subtree (HUD accent, hint) themes off the
  // document root; the views themselves carry their own [data-route].
  document.documentElement.dataset.route = route;
};

// ------------------------------ Navigation ---------------------------------
// One beat per route change, all owned by the shared core:
//
//   click → build next view (real DOM, opacity 0, stacked UNDER the current
//   view in the same grid cell) → screen.swap(current, next):
//     dissolving  burst at the old view's silhouette
//     particles   free physics carries the cloud toward the new silhouette
//     returning   deterministic lerp — particles land pixel-exact
//     reforming   the next view's real DOM fades in over the pinned cloud
//   → settle: old view disposed, next view interactive. Particle pool empty.
//
// `headlessButton` already gates activation on `screen.phase() === 'idle'`,
// so mid-transition clicks never reach `navigate`; the guard below covers
// programmatic callers.

let current = buildView('home');
host.appendChild(current.el);
updateHud(current.route);

const navigate = async (to: Route): Promise<void> => {
  if (to === current.route) return;
  if (screen.phase() !== 'idle') return; // ignore mid-transition navigation

  const next = buildView(to);
  next.el.style.opacity = '0';
  // Insert BEFORE the current view: same grid cell, earlier in paint order,
  // so the core's brief visible-for-capture flip never paints over the
  // outgoing view.
  host.insertBefore(next.el, current.el);

  // Mix the destination hue into the departing palette (slots 2/3) so the
  // cloud shifts old-hue → new-hue as it reshapes.
  const fromHue = ROUTE_HUES[current.route];
  const toHue = ROUTE_HUES[to];
  current.el.style.setProperty('--screean-particle-2', hslCss(toHue));
  current.el.style.setProperty('--screean-particle-3', hslCss(midHue(fromHue, toHue)));

  const prev = current;
  current = next;
  updateHud(to);

  await screen.swap(prev.el, next.el);

  // Settled: the next view is visible and interactive; the old one is
  // opacity:0 + inert — remove it (and its listeners) entirely.
  prev.dispose();
};
