// App — the moonshot React tree. Owns:
//
//   • RouteProvider (hash-free; uses window.history)
//   • MoonshotCanvas (single canvas, single World, single particle pool)
//   • One mounted Screen at a time, swapped by the route
//
// The Canvas survives across screen changes — only the screen subtree
// remounts. Cross-screen choreography (horizon → atlas, etc.) is queued
// behind the /moonshot/test proof; until that lands, screens are real
// React pages with no inter-screen particle handoff.

import type { ReactNode } from 'react';
import './theme.css';
import { MoonshotCanvas } from './engine/canvas';
import { RouteProvider, useRoute } from './engine/router';
import { NavBar } from './components/nav';
import { Horizon } from './screens/horizon';
import { Atlas } from './screens/atlas';
import { Signal } from './screens/signal';
import { Test } from './screens/test';
import type { MoonshotScreenId } from './constant';

const Screen = (): ReactNode => {
  const { screen } = useRoute();
  if (screen === 'horizon') return <Horizon />;
  if (screen === 'atlas')   return <Atlas />;
  if (screen === 'signal')  return <Signal />;
  return <Test />;
};

const Coords = (): ReactNode => {
  const { screen } = useRoute();
  // Bottom-left flight-instrument readout. Each screen reads a different
  // line — tag, slash, status — to make the chrome feel like an active
  // console rather than static decoration.
  const lines: Record<typeof screen, [string, string, string]> = {
    horizon: ['HORIZON',  '47°N · DRIFT',         'AWAITING REWRITE'],
    atlas:   ['ATLAS',    '3 WORLDS · ONE POOL',  'AWAITING REWRITE'],
    signal:  ['SIGNAL',   'CHANNEL OPEN',         'AWAITING REWRITE'],
    test:    ['TEST',     'DOM ⇄ PARTICLES',      'feels.taut · LIVE'],
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
  const label = screen === 'test'
    ? <>click the button — it dissolves and reforms as the other</>
    : <>this screen is being rebuilt — try <kbd>/moonshot/test</kbd></>;
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
