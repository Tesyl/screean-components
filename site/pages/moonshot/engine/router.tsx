// React-side router for the moonshot. The outer SPA tells us the initial
// screen on first mount; afterward we drive history.pushState ourselves so
// intra-moonshot navigation doesn't tear down the React tree (and the
// canvas with it).

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react';
import type { MoonshotScreenId } from '../constant';

const PATH_FOR: Record<MoonshotScreenId, string> = {
  horizon: '/moonshot',
  atlas:   '/moonshot/atlas',
  signal:  '/moonshot/signal',
  test:    '/moonshot/test',
};

const SCREEN_FOR_PATH = (p: string): MoonshotScreenId => {
  const clean = p.replace(/\/+$/, '') || '/';
  if (clean === '/moonshot/atlas') return 'atlas';
  if (clean === '/moonshot/signal') return 'signal';
  if (clean === '/moonshot/test') return 'test';
  return 'horizon';
};

type RouterCtx = {
  readonly screen: MoonshotScreenId;
  readonly navigate: (s: MoonshotScreenId) => void;
};

const Ctx = createContext<RouterCtx | null>(null);

export const useRoute = (): RouterCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useRoute must be inside <RouteProvider>');
  return c;
};

type Props = {
  readonly initial: MoonshotScreenId;
  readonly children: ReactNode;
};

export const RouteProvider = ({ initial, children }: Props): ReactNode => {
  const [screen, setScreen] = useState<MoonshotScreenId>(initial);

  // Reflect browser back/forward into our state. Only listen while mounted —
  // if the user navigates OUT of /moonshot/* the outer SPA tears us down.
  useEffect(() => {
    const onPop = () => {
      const path = window.location.pathname;
      // Only react to paths still inside our subtree; otherwise the outer
      // SPA owns the change and we're about to be unmounted.
      if (!path.startsWith('/moonshot')) return;
      setScreen(SCREEN_FOR_PATH(path));
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const navigate = (next: MoonshotScreenId): void => {
    if (next === screen) return;
    window.history.pushState({}, '', PATH_FOR[next]);
    setScreen(next);
  };

  return <Ctx.Provider value={{ screen, navigate }}>{children}</Ctx.Provider>;
};

// Anchor wrapper that intercepts clicks for in-app navigation. Keeps the
// real <a href> in the DOM (a11y, right-click → open in new tab) but the
// click is upgraded to a pushState — no full reload, no canvas remount.
type LinkProps = {
  readonly to: MoonshotScreenId;
  readonly children: ReactNode;
  readonly className?: string;
  readonly onMouseEnter?: () => void;
  readonly onMouseLeave?: () => void;
  readonly onFocus?: () => void;
  readonly onBlur?: () => void;
  readonly 'aria-label'?: string;
  readonly style?: CSSProperties;
};

export const Link = ({
  to,
  children,
  className,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
  style,
  ...rest
}: LinkProps): ReactNode => {
  const { navigate } = useRoute();
  return (
    <a
      href={PATH_FOR[to]}
      className={className}
      style={style}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        e.preventDefault();
        navigate(to);
      }}
      aria-label={rest['aria-label']}
    >
      {children}
    </a>
  );
};
