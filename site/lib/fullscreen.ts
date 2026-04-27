// fullscreen.ts — attach a fullscreen toggle to an experiment's canvas wrap.
//
// Uses the standard Fullscreen API (`Element.requestFullscreen` /
// `document.exitFullscreen`). When the wrap goes fullscreen, the canvas
// stretches to fill the viewport; the experiment is responsible for
// resizing its `Stage` so particles re-bind to the new bounds. We expose
// that via the `onResize(w, h)` callback.
//
// Why a helper instead of inlining: every experiment wants the same button
// + the same resize handshake, so it earns a tiny shared file. The button
// styling is inline so the helper is self-contained — no new CSS classes
// to track in the global stylesheet.
//
// Edge cases handled:
//   - User presses Escape (exits fullscreen out-of-band) → fullscreenchange
//     fires, we detect we're no longer fullscreen and resize back.
//   - dispose() while fullscreen → exits fullscreen and detaches listener.
//   - requestFullscreen() returns a Promise that rejects if the user denies
//     or the API is unavailable (Safari iOS). Caught and logged; the button
//     stays clickable.

export type FullscreenOpts = {
  // Element that goes fullscreen — typically the canvas wrap, not the
  // canvas itself, so any overlays (FPS readouts, future HUD) come along.
  wrap: HTMLElement;
  // Called when the fullscreen state changes. The experiment passes a
  // resize handler that calls Stage.resize(w, h) — particles re-bind to
  // the new viewport in screen-space without a respawn.
  onResize: (w: number, h: number) => void;
  // Width/height to restore on fullscreen exit. Captured up-front so the
  // helper doesn't read layout (which is unreliable mid-transition).
  restoreWidth: number;
  restoreHeight: number;
};

export type FullscreenHandle = {
  // Tear down listeners + remove the button. If currently fullscreen,
  // exits first.
  dispose: () => void;
};

const BUTTON_STYLE: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  top: '12px',
  right: '12px',
  zIndex: '10',
  padding: '6px 10px',
  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
  fontSize: '10px',
  letterSpacing: '0.18em',
  textTransform: 'uppercase',
  color: 'rgba(220, 220, 240, 0.8)',
  background: 'rgba(12, 10, 24, 0.55)',
  border: '1px solid rgba(180, 180, 230, 0.18)',
  borderRadius: '4px',
  cursor: 'pointer',
  backdropFilter: 'blur(12px) saturate(1.2)',
  // @ts-expect-error WebkitBackdropFilter is non-standard; Safari needs it.
  WebkitBackdropFilter: 'blur(12px) saturate(1.2)',
  transition: 'background 0.12s ease, color 0.12s ease',
};

export const attachFullscreenButton = (opts: FullscreenOpts): FullscreenHandle => {
  const { wrap, onResize, restoreWidth, restoreHeight } = opts;

  // Need a positioning context for the button; the existing
  // .experiment-canvas-wrap class applies position:relative already, but
  // we don't assume that here in case a future caller passes a different
  // host. Setting it conditionally avoids stomping on tighter layouts.
  if (getComputedStyle(wrap).position === 'static') {
    wrap.style.position = 'relative';
  }

  const btn = document.createElement('button');
  btn.type = 'button';
  btn.textContent = 'Fullscreen';
  btn.setAttribute('aria-label', 'Toggle fullscreen');
  Object.assign(btn.style, BUTTON_STYLE);
  btn.addEventListener('mouseenter', () => {
    btn.style.background = 'rgba(40, 32, 60, 0.75)';
    btn.style.color = 'rgba(240, 240, 255, 0.95)';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.background = BUTTON_STYLE.background as string;
    btn.style.color = BUTTON_STYLE.color as string;
  });
  wrap.appendChild(btn);

  const isFullscreen = (): boolean =>
    document.fullscreenElement === wrap;

  // Sync state on every fullscreenchange — covers both the explicit toggle
  // and the user pressing Escape. The browser updates fullscreenElement
  // BEFORE firing the event, so reading it here is reliable.
  const onChange = (): void => {
    if (isFullscreen()) {
      btn.textContent = 'Exit fullscreen';
      // Save the wrap's prior inline width/height (we set them below) so
      // they don't get clobbered. Fullscreen mode bypasses container CSS
      // and the wrap is sized 100vw x 100vh by the browser.
      onResize(window.innerWidth, window.innerHeight);
    } else {
      btn.textContent = 'Fullscreen';
      onResize(restoreWidth, restoreHeight);
    }
  };
  document.addEventListener('fullscreenchange', onChange);

  // Window resize while fullscreen — phones rotating, external monitor
  // hot-plug, etc. Re-fire the resize. Throttled by rAF so a continuous
  // resize drag (rare but possible if the OS allows it during fullscreen)
  // doesn't fire 60 setScene calls.
  let resizeRaf = 0;
  const onWindowResize = (): void => {
    if (!isFullscreen()) return;
    if (resizeRaf) cancelAnimationFrame(resizeRaf);
    resizeRaf = requestAnimationFrame(() => {
      onResize(window.innerWidth, window.innerHeight);
    });
  };
  window.addEventListener('resize', onWindowResize);

  btn.addEventListener('click', () => {
    if (isFullscreen()) {
      void document.exitFullscreen().catch((e) => {
        console.warn('fullscreen: exit failed', e);
      });
    } else {
      const req = wrap.requestFullscreen?.();
      if (!req) {
        console.warn('fullscreen: API unavailable in this browser');
        return;
      }
      void req.catch((e) => {
        console.warn('fullscreen: enter failed', e);
      });
    }
  });

  return {
    dispose: () => {
      if (isFullscreen()) {
        void document.exitFullscreen().catch(() => {});
      }
      if (resizeRaf) cancelAnimationFrame(resizeRaf);
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('resize', onWindowResize);
      btn.remove();
    },
  };
};
