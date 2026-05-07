// /moonshot/test — proof of the dissolve + swap primitives.
//
// Two real DOM buttons sit side by side. Click "Send →" and the button
// dissolves into particles, the cloud flies across the screen, and
// "Received" reforms in its place. Click "Received" to swap back. The
// buttons are unstyled-by-screean React components — the swap is the
// only thing canvas-driven.
//
// This is Strip B of the success comparison in docs/MOONSHOT-VISION.md.
// Compare frame-for-frame against /html-interop.html (Strip A); they
// should be visibly at parity.

import { useCallback, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { useCanvas } from '../engine/canvas';

// Inline styles only — `bitmapFieldFromElement`'s foreignObject path doesn't
// reliably handle external Tailwind/shadcn CSS yet (RFC-html-in-canvas-interop
// Phase 1 caveats). Once Phase 3b lands, swap these for real shadcn buttons.
//
// The two buttons sit on opposite sides of the viewport so the swap reads
// as a CROSS-screen flight, not a same-position dissolve. This is the
// behavior the html-interop demo can't show — it round-trips a single
// element. The whole point of this test is the cross-element handoff.
const buttonBase: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: 56,
  paddingLeft: 36,
  paddingRight: 36,
  border: '1px solid rgba(255, 255, 255, 0.10)',
  borderRadius: 12,
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 17,
  fontWeight: 500,
  letterSpacing: 0,
  whiteSpace: 'nowrap',
  cursor: 'pointer',
  outline: 'none',
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
  position: 'absolute',
  top: '50%',
  // Side positioning is set per-button below.
};

const sendStyle: CSSProperties = {
  ...buttonBase,
  left: '24%',
  transform: 'translate(-50%, -50%)',
  background: '#0a0a0a',
  color: '#fafafa',
};

const receivedStyle: CSSProperties = {
  ...buttonBase,
  left: '76%',
  transform: 'translate(-50%, -50%)',
  background: '#1a2436',
  color: '#cfe1ff',
  border: '1px solid rgba(122, 156, 255, 0.20)',
};

type Side = 'a' | 'b';

export const Test = (): ReactNode => {
  const { swap } = useCanvas();
  const aRef = useRef<HTMLButtonElement | null>(null);
  const bRef = useRef<HTMLButtonElement | null>(null);
  const [active, setActive] = useState<Side>('a');
  const [busy, setBusy] = useState(false);

  const trigger = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    const fromEl = active === 'a' ? aRef.current : bRef.current;
    const toEl   = active === 'a' ? bRef.current : aRef.current;
    if (!fromEl || !toEl) {
      setBusy(false);
      return;
    }
    // Make TARGET visible-at-zero and same-position before swap so the
    // canvas can rasterize it at the correct rect. The canvas then fades
    // its opacity 0→1 during the reform phase.
    toEl.style.opacity = '0';
    toEl.style.pointerEvents = 'none';
    toEl.style.display = 'inline-flex';
    await swap(fromEl, toEl);
    setActive((s) => (s === 'a' ? 'b' : 'a'));
    setBusy(false);
  }, [active, busy, swap]);

  // Initial hidden side: the "other" button needs to be in the DOM (so we
  // can rasterize its bounds + colors) but invisible until the first swap.
  // We render BOTH buttons from the start; CSS handles initial visibility
  // via inline style based on `active`.
  return (
    <>
      <button
        ref={aRef}
        type="button"
        style={{
          ...sendStyle,
          opacity: active === 'a' ? 1 : 0,
          pointerEvents: active === 'a' ? 'auto' : 'none',
        }}
        onClick={trigger}
      >
        Send  →
      </button>
      <button
        ref={bRef}
        type="button"
        style={{
          ...receivedStyle,
          opacity: active === 'b' ? 1 : 0,
          pointerEvents: active === 'b' ? 'auto' : 'none',
        }}
        onClick={trigger}
      >
        ←  Received
      </button>
      <p className="moonshot-test-hint" aria-hidden="true">
        click the button — it dissolves and reforms as the other one
      </p>
    </>
  );
};
