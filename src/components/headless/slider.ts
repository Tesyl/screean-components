// headless slider — the 'live-dom' strategy exemplar (Decision §5).
//
// A slider's drag is CONTINUOUS interaction: rasterizing it away would kill
// the live gesture. So the element stays real and interactive through its
// steady state — we own the pointer math (capture + clientX → value) and
// the keyboard model (arrows/Home/End/Page) on real DOM — and ONLY the
// transition edges rasterize. Because the track, fill, and thumb are real
// child elements, `dissolve()` rasterizes the component's inners exactly as
// painted, at the current value.
//
// Structure (all real nodes, addressable for styling via data-part):
//   <div role="slider" tabindex="0" aria-valuemin/max/now>
//     <div data-part="track">
//       <div data-part="fill"/>
//     </div>
//     <div data-part="thumb"/>
//   </div>
//
// Value model: controlled-with-internal-echo. The gesture updates visuals
// live and reports through `onChange`; `setValue` drives it externally.
// (The legacy scene-graph factories used rebuild-on-change; a continuous
// control updating 60×/s during a drag is exactly the case that pattern is
// wrong for — Decision §5 carves it out.)

import type { HeadlessSliderOpts, SliderComponent } from './types';
import { applyBaseOpts, applyStyles, toElementComponent } from './element';
import {
  DISABLED_OPACITY,
  SLIDER_FILL_BACKGROUND,
  SLIDER_HIT_HEIGHT_PX,
  SLIDER_MAX,
  SLIDER_MIN,
  SLIDER_PAGE_STEPS,
  SLIDER_STEP,
  SLIDER_THUMB_BACKGROUND,
  SLIDER_THUMB_SHADOW,
  SLIDER_THUMB_SIZE_PX,
  SLIDER_TRACK_BACKGROUND,
  SLIDER_TRACK_HEIGHT_PX,
  SLIDER_WIDTH_PX,
} from './constant';

// Pure value math — exported for tests.
export const clampToStep = (
  raw: number,
  min: number,
  max: number,
  step: number,
): number => {
  const clamped = Math.min(max, Math.max(min, raw));
  const stepped = min + Math.round((clamped - min) / step) * step;
  // Re-clamp: rounding at the top edge can overshoot max by < one step.
  return Math.min(max, Math.max(min, stepped));
};

export const valueFromPointer = (
  clientX: number,
  trackRect: Pick<DOMRect, 'left' | 'width'>,
  min: number,
  max: number,
  step: number,
): number => {
  const t = trackRect.width === 0 ? 0 : (clientX - trackRect.left) / trackRect.width;
  return clampToStep(min + t * (max - min), min, max, step);
};

const ROOT_SKIN: Partial<CSSStyleDeclaration> = {
  position: 'relative',
  display: 'inline-flex',
  alignItems: 'center',
  width: `${SLIDER_WIDTH_PX}px`,
  height: `${SLIDER_HIT_HEIGHT_PX}px`,
  cursor: 'pointer',
  touchAction: 'none', // we own the gesture; don't let scroll hijack it
  outlineOffset: '2px',
};

const TRACK_SKIN: Partial<CSSStyleDeclaration> = {
  position: 'relative',
  width: '100%',
  height: `${SLIDER_TRACK_HEIGHT_PX}px`,
  borderRadius: `${SLIDER_TRACK_HEIGHT_PX / 2}px`,
  background: SLIDER_TRACK_BACKGROUND,
  overflow: 'hidden',
};

const FILL_SKIN: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  left: '0',
  top: '0',
  bottom: '0',
  background: SLIDER_FILL_BACKGROUND,
};

const THUMB_SKIN: Partial<CSSStyleDeclaration> = {
  position: 'absolute',
  width: `${SLIDER_THUMB_SIZE_PX}px`,
  height: `${SLIDER_THUMB_SIZE_PX}px`,
  borderRadius: '50%',
  background: SLIDER_THUMB_BACKGROUND,
  boxShadow: SLIDER_THUMB_SHADOW,
  // Centered on the value position; transform keeps it sub-pixel smooth.
  top: '50%',
  transform: 'translate(-50%, -50%)',
  pointerEvents: 'none', // the ROOT owns the gesture; thumb is visual
};

export const headlessSlider = (opts: HeadlessSliderOpts): SliderComponent => {
  const { screen } = opts;
  const min = opts.min ?? SLIDER_MIN;
  const max = opts.max ?? SLIDER_MAX;
  const step = opts.step ?? SLIDER_STEP;
  let value = clampToStep(opts.value ?? min, min, max, step);

  // ── Structure ────────────────────────────────────────────────────────────
  const el = document.createElement('div');
  el.setAttribute('role', 'slider');
  el.tabIndex = opts.disabled ? -1 : 0;
  el.setAttribute('aria-valuemin', String(min));
  el.setAttribute('aria-valuemax', String(max));

  const track = document.createElement('div');
  track.dataset.part = 'track';
  const fill = document.createElement('div');
  fill.dataset.part = 'fill';
  const thumb = document.createElement('div');
  thumb.dataset.part = 'thumb';
  track.appendChild(fill);
  el.append(track, thumb);

  if (!opts.unstyled) {
    applyStyles(el, ROOT_SKIN);
    applyStyles(track, TRACK_SKIN);
    applyStyles(fill, FILL_SKIN);
    applyStyles(thumb, THUMB_SKIN);
  }
  applyBaseOpts(el, opts);

  // ── Render (value → visuals + ARIA) ─────────────────────────────────────
  const render = (): void => {
    const t = max === min ? 0 : (value - min) / (max - min);
    const pct = `${(t * 100).toFixed(3)}%`;
    fill.style.width = pct;
    thumb.style.left = pct;
    el.setAttribute('aria-valuenow', String(value));
  };
  render();

  const commit = (next: number): void => {
    if (next === value) return;
    value = next;
    render();
    opts.onChange?.(value);
  };

  // ── Pointer model (we own the gesture) ──────────────────────────────────
  let dragging = false;
  const onPointerDown = (e: PointerEvent): void => {
    if (opts.disabled || screen.phase() !== 'idle') return;
    dragging = true;
    el.setPointerCapture(e.pointerId);
    commit(valueFromPointer(e.clientX, track.getBoundingClientRect(), min, max, step));
  };
  const onPointerMove = (e: PointerEvent): void => {
    if (!dragging) return;
    commit(valueFromPointer(e.clientX, track.getBoundingClientRect(), min, max, step));
  };
  const endDrag = (e: PointerEvent): void => {
    if (!dragging) return;
    dragging = false;
    if (el.hasPointerCapture(e.pointerId)) el.releasePointerCapture(e.pointerId);
  };
  el.addEventListener('pointerdown', onPointerDown);
  el.addEventListener('pointermove', onPointerMove);
  el.addEventListener('pointerup', endDrag);
  el.addEventListener('pointercancel', endDrag);

  // ── Keyboard model (standard slider a11y contract) ──────────────────────
  const onKeyDown = (e: KeyboardEvent): void => {
    if (opts.disabled) return;
    const deltas: Record<string, number> = {
      ArrowRight: step,
      ArrowUp: step,
      ArrowLeft: -step,
      ArrowDown: -step,
      PageUp: step * SLIDER_PAGE_STEPS,
      PageDown: -step * SLIDER_PAGE_STEPS,
    };
    let next: number | null = null;
    if (e.key in deltas) next = clampToStep(value + deltas[e.key], min, max, step);
    else if (e.key === 'Home') next = min;
    else if (e.key === 'End') next = max;
    if (next === null) return;
    e.preventDefault();
    commit(next);
  };
  el.addEventListener('keydown', onKeyDown);

  // ── Handle ───────────────────────────────────────────────────────────────
  const base = toElementComponent({
    el,
    role: 'slider',
    screen,
    onDispose: () => {
      el.removeEventListener('pointerdown', onPointerDown);
      el.removeEventListener('pointermove', onPointerMove);
      el.removeEventListener('pointerup', endDrag);
      el.removeEventListener('pointercancel', endDrag);
      el.removeEventListener('keydown', onKeyDown);
    },
  });

  return {
    ...base,
    value: () => value,
    setValue: (next) => commit(clampToStep(next, min, max, step)),
  };
};

// Re-exported so the disabled affordance is testable without reading the
// skin constants directly.
export { DISABLED_OPACITY };
