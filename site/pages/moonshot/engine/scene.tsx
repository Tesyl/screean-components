// useScene — the single React hook every screen calls. Submits a SceneSpec
// to the canvas; revisioning re-binds without dispersal; screen change
// triggers an atomic transition.
//
// Usage pattern:
//
//   const Horizon = () => {
//     const [hovered, setHovered] = useState<CtaId | null>(null);
//     useScene('horizon', (w, h) => buildHorizon(w, h, { hovered }), [hovered]);
//     return <HorizonMirror onCtaHover={setHovered} />;
//   };
//
// The dependency array is what bumps the revision. Use it like
// `useEffect`'s deps — list every state that mutates the scene tree.

import { useEffect, useRef } from 'react';
import type { SceneNode } from 'screean';
import { useCanvas } from './canvas';
import type { MoonshotScreenId } from '../constant';

export type SceneBuilder = (w: number, h: number) => SceneNode;

export const useScene = (
  screen: MoonshotScreenId,
  build: SceneBuilder,
  deps: ReadonlyArray<unknown>,
): void => {
  const { setSceneSpec } = useCanvas();
  const revisionRef = useRef(0);
  // Each call bumps revision so the canvas knows something in the tree
  // changed. The screen id is the discriminator that triggers a hard
  // transition (vs. a soft rebind for revision-only changes).
  useEffect(() => {
    revisionRef.current += 1;
    setSceneSpec({
      screen,
      revision: revisionRef.current,
      build,
    });
    // We intentionally consume `deps` as the trigger; `build` and `setSceneSpec`
    // are stable enough across renders that revisioning is the right axis.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [screen, ...deps]);
};
