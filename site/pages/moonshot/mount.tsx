// Adapter — bridges the outer vanilla-TS SPA to the React-mounted moonshot
// subtree.
//
// Returns a teardown function that unmounts React when the SPA navigates
// away. Within /moonshot/* internal navigation is React-driven (history
// pushState routed by RouteProvider), so the React tree + canvas survive
// across screen changes.

import { createRoot, type Root } from 'react-dom/client';
import { App } from './App';
import type { MoonshotScreen } from '../../router';

export const renderMoonshot = (initial: MoonshotScreen): (() => void) => {
  const host = document.getElementById('app');
  if (!host) throw new Error('missing #app mount for moonshot');
  host.innerHTML = '';

  const container = document.createElement('div');
  container.id = 'moonshot-host';
  container.style.position = 'fixed';
  container.style.inset = '0';
  host.appendChild(container);

  const root: Root = createRoot(container);
  root.render(<App initial={initial} />);

  return () => {
    root.unmount();
    container.remove();
  };
};
