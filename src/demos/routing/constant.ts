// Routing demo constants — route identity, per-route hue, and page content.
//
// Type-coupled on purpose: `Route` derives from `ROUTES`, and every
// per-route record is keyed `Record<Route, …>`, so adding/renaming a route
// fails compilation at every consumer (PAGES, ROUTE_HUES, the CSS contract
// in routing-demo.html is the one seam the compiler can't see — it's called
// out there).

export const ROUTES = ['home', 'gallery', 'settings'] as const;
export type Route = (typeof ROUTES)[number];

// Each route gets its own hue. routing-demo.html derives the route accent
// (--accent / --accent-bg) AND the particle palette (--screean-particle*)
// from the same hue, so cloud and UI match — keep them in sync if edited.
export const ROUTE_HUES: Record<Route, number> = {
  home: 265, // violet
  gallery: 185, // teal
  settings: 32, // amber
};

// Particle color shape shared with the CSS palette vars in routing-demo.html.
export const PARTICLE_SATURATION_PCT = 72;
export const PARTICLE_LIGHTNESS_PCT = 62;

// Full-page silhouettes need more particles than a single button (the
// transition core defaults to 6k, tuned for component-sized swaps).
export const PARTICLE_COUNT = 12_000;

// Page content — pure data; main.ts turns it into real DOM. A button with a
// `to` route navigates (the whole view swaps); one without is inert demo
// chrome (it self-dissolves, the library's signature interaction).
export type RouteButtonSpec = {
  readonly label: string;
  readonly to?: Route;
};

export type RoutePageSpec = {
  readonly title: string;
  readonly description: string;
  readonly rows: readonly (readonly RouteButtonSpec[])[];
};

export const PAGES: Record<Route, RoutePageSpec> = {
  home: {
    title: 'screean',
    description: 'physics-on-ui · routing · the particles are the transition',
    rows: [
      [
        { label: 'Gallery →', to: 'gallery' },
        { label: 'Settings →', to: 'settings' },
      ],
    ],
  },
  gallery: {
    title: 'Gallery',
    description: 'imagine thumbnails here · each click re-routes',
    rows: [
      [{ label: 'Item A' }, { label: 'Item B' }, { label: 'Item C' }],
      [
        { label: '← Home', to: 'home' },
        { label: 'Settings →', to: 'settings' },
      ],
    ],
  },
  settings: {
    title: 'Settings',
    description: 'also hypothetical · Tab navigates, Enter activates',
    rows: [
      [{ label: 'Toggle A' }, { label: 'Toggle B' }],
      [
        { label: '← Home', to: 'home' },
        { label: 'Gallery →', to: 'gallery' },
      ],
    ],
  },
};

// Nav buttons match the legacy demo's 150px footprint.
export const NAV_BUTTON_MIN_WIDTH_PX = 150;
