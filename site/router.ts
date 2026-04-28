// Tiny path-based router. Three route shapes:
//
//   /                      → landing
//   /components            → component browser (storybook)
//   /experiments           → experiments index
//   /experiments/<name>    → individual experiment
//
// Anything else → fallback to landing. Legacy `/1`–`/5` paths still resolve
// to the canonical landing (the SPA fallback in vite.config.ts kept them
// reachable). Theme data lives on as design history; see themes.ts.
//
// Why HTML5 History (not hash routing): the user wanted clean `/...` URLs.
// Vite's dev server is configured to serve `/index.html` for the SPA paths
// listed in `vite.config.ts`, so all routes work in dev and production
// preview alike.

import { DEFAULT_THEME, type ThemeId } from './themes';

export type Route =
  | { kind: 'landing'; theme: ThemeId }
  | { kind: 'components' }
  | { kind: 'experiments' }
  | { kind: 'experiment'; name: string }
  | { kind: 'lab' }
  | { kind: 'lab-story'; name: string };

export const resolveRoute = (pathname: string): Route => {
  const clean = pathname.replace(/\/+$/, '') || '/';
  if (clean === '/components') return { kind: 'components' };
  if (clean === '/experiments') return { kind: 'experiments' };
  if (clean === '/lab') return { kind: 'lab' };
  // /experiments/<name> — the name segment is whatever follows the slash.
  // We accept any non-empty path safe character; the experiment registry is
  // the authority on which names actually mount.
  const expMatch = clean.match(/^\/experiments\/([a-z0-9-]+)$/i);
  if (expMatch) return { kind: 'experiment', name: expMatch[1] };
  // /lab/<storyName> — same shape as experiments. The lab registry decides
  // which names are valid; unknown names land on a 404-ish page inside the
  // lab shell rather than a hard router miss.
  const labMatch = clean.match(/^\/lab\/([a-z0-9-]+)$/i);
  if (labMatch) return { kind: 'lab-story', name: labMatch[1] };
  // Legacy / canonical landing.
  return { kind: 'landing', theme: DEFAULT_THEME };
};

export type RouterOpts = {
  onRoute: (r: Route) => void;
};

export const startRouter = (opts: RouterOpts): { navigate: (to: string) => void } => {
  const fire = () => opts.onRoute(resolveRoute(window.location.pathname));

  document.addEventListener('click', (e) => {
    if (e.defaultPrevented) return;
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    if (e.button !== 0) return;
    const t = e.target as HTMLElement | null;
    if (!t) return;
    const a = t.closest('a') as HTMLAnchorElement | null;
    if (!a) return;
    if (a.target && a.target !== '_self') return;
    if (a.hasAttribute('download')) return;
    const href = a.getAttribute('href');
    if (!href) return;
    if (href.startsWith('http://') || href.startsWith('https://')) return;
    if (href.startsWith('#') || href.startsWith('mailto:')) return;
    if (a.hasAttribute('data-external')) return;
    e.preventDefault();
    if (window.location.pathname !== href) {
      window.history.pushState({}, '', href);
      fire();
    }
  });

  window.addEventListener('popstate', fire);
  fire();

  return {
    navigate: (to: string) => {
      window.history.pushState({}, '', to);
      fire();
    },
  };
};
