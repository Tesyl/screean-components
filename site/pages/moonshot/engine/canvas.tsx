// MoonshotCanvas — owns ONE <canvas> and exposes the imperative transition
// primitives the moonshot architecture is built on:
//
//   • dissolve(ref)        — DOM element ⇄ particles ⇄ same DOM element
//   • swap(fromRef, toRef) — DOM element A ⇄ particles ⇄ DOM element B
//   • thwack(x, y, k)      — one-shot impulse on currently-flying particles
//
// This is now a THIN WRAPPER over the engine's `createScreenController`
// (`@tesyl/screean` / src/screen) — the same single four-frame dissolve/swap
// machine the React ScreenProvider and the component library use. The moonshot
// app is the Pattern-A dogfood: the flagship runs on the shared core, not a
// hand-rolled copy. (The previous 435-line inline state machine — lifted from
// html-interop — is gone; its behavior is preserved by the controller, whose
// defaults match the old constants: taut feel, 6000 particles, 1400ms phase.)
//
// One transition runs at a time; concurrent calls chain onto the in-flight
// cycle (controller contract).

import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createScreenController, type ScreenController } from '@tesyl/screean';

// ---- Public context shape ------------------------------------------------
type CanvasCtx = {
  // Round-trip a single element.
  readonly dissolve: (el: HTMLElement | null) => Promise<void>;
  // Particles fly from `from` to `into`. Both must be in the DOM and laid
  // out. `into` should be at opacity:0 BEFORE calling — the canvas fades it
  // in during the reform phase.
  readonly swap: (from: HTMLElement | null, into: HTMLElement | null) => Promise<void>;
  // Kick all live particles outward from (x, y); no-op when idle.
  readonly thwack: (x: number, y: number, strength?: number) => void;
};

const Ctx = createContext<CanvasCtx | null>(null);

export const useCanvas = (): CanvasCtx => {
  const c = useContext(Ctx);
  if (!c) throw new Error('useCanvas must be inside <MoonshotCanvas>');
  return c;
};

// ---- Provider -------------------------------------------------------------
type Props = { readonly children: ReactNode };

export const MoonshotCanvas = ({ children }: Props): ReactNode => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const controllerRef = useRef<ScreenController | null>(null);
  const [ready, setReady] = useState(false);

  // Boot the controller on mount — it owns the World + Renderer + rAF +
  // ResizeObserver. `feel: 'taut'` matches the moonshot's original tuning.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const controller = createScreenController({ canvas, feel: 'taut' });
    controllerRef.current = controller;
    setReady(true);
    return () => {
      controller.dispose();
      controllerRef.current = null;
      setReady(false);
    };
  }, []);

  // Methods read the live controller ref, so they no-op gracefully before
  // boot / after dispose. `ready` flips the memo identity once at boot.
  const api = useMemo<CanvasCtx>(
    () => ({
      dissolve: async (el) => {
        await controllerRef.current?.dissolve(el);
      },
      swap: async (from, into) => {
        await controllerRef.current?.swap(from, into);
      },
      thwack: (x, y, strength) => controllerRef.current?.thwack(x, y, strength),
    }),
    [ready],
  );

  return (
    <Ctx.Provider value={api}>
      <canvas ref={canvasRef} className="moonshot-canvas" aria-hidden="true" />
      {children}
    </Ctx.Provider>
  );
};
