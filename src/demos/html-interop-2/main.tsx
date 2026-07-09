// html-in-canvas interop — v2.
//
// Same DOM-button ⇄ particles round-trip as the original demo. v1 → v2 was
// originally a port onto the named `feels.taut` preset (proving the preset
// faithfully reproduces the hand-tuned force stack). Post transition-core
// consolidation, BOTH demos now drive the engine's `createScreenController`
// (`@tesyl/screean` / src/screen) — the single four-frame machine shared with
// the React binding and the component library. `feel: 'taut'` is the preset;
// there is no longer any inline state machine to diff. The remaining
// difference between v1 and v2 is purely the label.
//
// StrictMode is deliberately OFF (same reasoning as v1).

import { createRoot } from 'react-dom/client';
import './index.css';

import { createScreenController, type TransitionPhaseKind } from '@tesyl/screean';

import { App } from './App';

const log = (...args: unknown[]) => console.info('[html-interop-2]', ...args);

// ------------------------------ DOM setup ----------------------------------
const canvas = document.getElementById('portal') as HTMLCanvasElement | null;
const mount = document.getElementById('mount') as HTMLDivElement | null;
const statusEl = document.getElementById('status') as HTMLDivElement | null;
if (!canvas || !mount || !statusEl) {
  throw new Error('html-interop-2: missing #portal, #mount, or #status');
}

const setStatus = (text: string) => {
  statusEl.textContent = text;
};

// ------------------------------ Transition core ----------------------------
const screen = createScreenController({ canvas, feel: 'taut' });

let currentButton: HTMLButtonElement | null = null;

const STATUS_FOR: Record<TransitionPhaseKind, string> = {
  idle: 'ready · taut',
  dissolving: 'dissolving…',
  particles: 'settling',
  reforming: 'reforming',
};

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
  setStatus('ready · taut');
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
  const button = await waitForButton('Click me · v2 (feels.taut)');
  centerMount(button.getBoundingClientRect());
  button.style.opacity = '1';
  button.style.pointerEvents = 'auto';
  setStatus('ready · taut');
  log('renderer ready · feel: taut');
})().catch((err) => {
  console.error('[html-interop-2] boot failed:', err);
  setStatus(`error: ${err.message}`);
});

// ------------------------------ Resize -------------------------------------
window.addEventListener('resize', () => {
  if (currentButton) centerMount(currentButton.getBoundingClientRect());
});
