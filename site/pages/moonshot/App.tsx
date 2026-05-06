// App — the moonshot React tree. Owns:
//
//   • RouteProvider (hash-free; uses window.history)
//   • MoonshotCanvas (single canvas, single World, single particle pool)
//   • One mounted Screen at a time, swapped by the route
//
// The Canvas survives across screen changes — only the screen subtree
// remounts, and the canvas runs an atomic dismiss → bind transition under
// the hood.

import type { ReactNode } from 'react';
import './theme.css';
import { MoonshotCanvas } from './engine/canvas';
import { RouteProvider, useRoute } from './engine/router';
import { NavBar } from './components/nav';
import { Horizon } from './screens/horizon';
import { Atlas } from './screens/atlas';
import { Signal } from './screens/signal';
import type { MoonshotScreenId } from './constant';

const Screen = (): ReactNode => {
  const { screen } = useRoute();
  if (screen === 'horizon') return <Horizon />;
  if (screen === 'atlas')   return <Atlas />;
  return <Signal />;
};

const Coords = (): ReactNode => {
  const { screen } = useRoute();
  // Bottom-left flight-instrument readout. Each screen reads a different
  // line — tag, slash, status — to make the chrome feel like an active
  // console rather than static decoration.
  const lines: Record<typeof screen, [string, string, string]> = {
    horizon: ['HORIZON',  '47°N · DRIFT',         'POOL READY'],
    atlas:   ['ATLAS',    '3 WORLDS · ONE POOL',  'HOVER TO INSPECT'],
    signal:  ['SIGNAL',   'CHANNEL OPEN',         'AWAITING COMPOSE'],
  };
  const [tag, line, status] = lines[screen];
  return (
    <div className="moonshot-coords" aria-hidden="true">
      <span style={{ color: 'var(--m-amber)' }}>● </span>
      {tag}  /  {line}  /  {status}
    </div>
  );
};

const Hint = (): ReactNode => {
  const { screen } = useRoute();
  const label = screen === 'horizon'
    ? <>move · the cloud follows · <kbd>tab</kbd> for buttons</>
    : screen === 'atlas'
      ? <>hover a world · click anywhere to return</>
      : <>type — particles will rasterize · <kbd>↩</kbd> to transmit</>;
  return <div className="moonshot-hint" aria-hidden="true">{label}</div>;
};

type AppProps = { readonly initial: MoonshotScreenId };

export const App = ({ initial }: AppProps): ReactNode => (
  <RouteProvider initial={initial}>
    <div data-moonshot className="moonshot-root">
      <MoonshotCanvas>
        <div className="moonshot-mirror">
          <NavBar />
          <Screen />
          <Coords />
          <Hint />
        </div>
      </MoonshotCanvas>
    </div>
  </RouteProvider>
);
