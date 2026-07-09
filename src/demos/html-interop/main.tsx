// html-in-canvas interop demo — Phase 3a (stable-path).
//
// The "DOM button ⇄ particles" demo: a real, clickable, screen-reader-
// announced <button> that rasterizes (bitmapFieldFromElement, foreignObject
// path) into a particle cloud and reforms. The cloud is purely visual; it
// inherits the button's palette and is replaced by the button on reform.
//
//   dom → (click) → dissolving → particles → returning → reforming → dom
//
// As of the transition-core consolidation this demo no longer hand-rolls the
// four-frame machine — it drives the engine's `createScreenController`
// (`@tesyl/screean` / src/screen), the same core the React binding and the
// component library use. The button DOM, the centering, and the status HUD
// are all this file owns now; the World/renderer/loop/phase-machine are the
// controller's. (`feel: 'taut'` reproduces the old hand-tuned force stack —
// spring(140,16) drag(0.85) shimmer(3,4) neighborRepel(4,900) — exactly.)
//
// StrictMode is deliberately OFF. StrictMode double-mounts in dev, which
// detaches the first <button> we capture via ref before rasterization runs.

import { createRoot } from 'react-dom/client';
import './index.css';

import { createScreenController, type TransitionPhaseKind } from '@tesyl/screean';

import { App } from './App';

const log = (...args: unknown[]) => console.info('[html-interop]', ...args);

// ------------------------------ DOM setup ----------------------------------
const canvas = document.getElementById('portal') as HTMLCanvasElement | null;
const mount = document.getElementById('mount') as HTMLDivElement | null;
const statusEl = document.getElementById('status') as HTMLDivElement | null;
if (!canvas || !mount || !statusEl) {
  throw new Error('html-interop: missing #portal, #mount, or #status');
}

const setStatus = (text: string) => {
  statusEl.textContent = text;
};

// ------------------------------ Transition core ----------------------------
// One controller owns the World + Renderer + rAF + ResizeObserver over the
// full-viewport overlay canvas. `feel: 'taut'` is the demo's tuning.
const screen = createScreenController({ canvas, feel: 'taut' });

let currentButton: HTMLButtonElement | null = null;

const STATUS_FOR: Record<TransitionPhaseKind, string> = {
  idle: 'ready',
  dissolving: 'dissolving…',
  particles: 'settling',
  reforming: 'reforming',
};

// One cycle at a time. Mid-cycle clicks are gated by the controller (phase
// must be idle); we mirror the live phase to the status HUD beat-by-beat.
const runDissolve = async () => {
  if (!currentButton || screen.phase() !== 'idle') return;
  let polling = true;
  const poll = () => {
    if (!polling) return;
    setStatus(STATUS_FOR[screen.phase()]);
    requestAnimationFrame(poll);
  };
  requestAnimationFrame(poll);
  await screen.dissolve(currentButton);
  polling = false;
  setStatus('ready');
};

// ------------------------------ React mount --------------------------------
const root = createRoot(mount);

const waitForButton = (label: string): Promise<HTMLButtonElement> =>
  new Promise<HTMLButtonElement>((resolve, reject) => {
    let resolved = false;
    const timeout = setTimeout(
      () => reject(new Error('button ref never fired within 3s')),
      3000,
    );
    const capture = (el: HTMLButtonElement | null) => {
      if (!el || !el.isConnected || resolved) return;
      resolved = true;
      clearTimeout(timeout);
      currentButton = el;
      queueMicrotask(() => resolve(el));
    };
    root.render(
      <App
        label={label}
        size="lg"
        buttonRef={capture}
        onButtonClick={() => void runDissolve()}
      />,
    );
  });

const centerMount = (rect: { width: number; height: number } | null) => {
  const w = rect?.width ?? 160;
  const h = rect?.height ?? 44;
  mount.style.left = `${Math.round(window.innerWidth / 2 - w / 2)}px`;
  mount.style.top = `${Math.round(window.innerHeight / 2 - h / 2)}px`;
};

// ------------------------------ Boot ---------------------------------------
centerMount(null);
(async () => {
  const button = await waitForButton('Click me');
  centerMount(button.getBoundingClientRect());
  button.style.opacity = '1';
  button.style.pointerEvents = 'auto';
  setStatus('ready');
  log('renderer ready');
})().catch((err) => {
  console.error('[html-interop] boot failed:', err);
  setStatus(`error: ${err.message}`);
});

// ------------------------------ Resize -------------------------------------
// The controller's ResizeObserver handles the canvas/world/renderer; we only
// re-center the DOM button's mount on viewport change.
window.addEventListener('resize', () => {
  if (currentButton) centerMount(currentButton.getBoundingClientRect());
});
