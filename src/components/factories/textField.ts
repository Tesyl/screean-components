// textField — text input. The DOM mirror creates a real <input> for this
// component (browser owns cursor, selection, IME, copy/paste); particles
// render the chrome + the typed string as decoration on the canvas.
//
// State pattern: consumer-controlled, like every other factory here.
//   - `value` is captured at construction
//   - `onChange` fires per keystroke with the new string in `e.value`
//   - The consumer updates its state and rebuilds the component
//
// During typing the DOM input has the live cursor; the particle text catches
// up on rebuild. That latency is hidden by the user's focus — they're
// reading the input, not the particles.
//
// ARIA: role=textbox + aria-label. The DOM mirror sets `<input>.value` from
// the captured textValue.

import { node, rect, stack, text, type SceneNode } from 'screean';
import { component } from '../component';
import type {
  Component,
  Handler,
  InteractiveOpts,
  SizedOpts,
} from '../types';

export type TextFieldOpts = InteractiveOpts &
  Pick<SizedOpts, 'width' | 'height' | 'radius' | 'font' | 'z'> & {
    // Current text value. The DOM mirror displays this in its <input>.
    value: string;
    // Per-keystroke handler. `e.value` carries the new string.
    onChange: Handler;
  };

export const textField = (opts: TextFieldOpts): Component => {
  const width = opts.width ?? 240;
  const height = opts.height ?? 44;
  const radius = opts.radius ?? 8;
  const font = opts.font ?? '500 16px system-ui, -apple-system, sans-serif';

  // Chrome — rounded rect that gives the input its silhouette as particles.
  const chrome = node(rect({ w: width, h: height, radius }), { z: 0 });
  const children: SceneNode[] = [chrome];
  // Particle text mirroring the typed value. Empty value → no text leaf
  // so the cloud reads as a quiet "input box" rather than a phantom prompt.
  if (opts.value !== '') {
    const textLeaf = node(text({ text: opts.value, font }), { z: 1 });
    children.push(textLeaf);
  }
  const container = stack(children, { z: opts.z ?? 0 });

  return component(container, {
    id: opts.id,
    ariaRole: opts.ariaRole ?? 'textbox',
    ariaLabel: opts.ariaLabel ?? 'text input',
    disabled: opts.disabled,
    font,
    textValue: opts.value,
    onInput: opts.onChange,
    onPointerEnter: opts.onPointerEnter,
    onPointerLeave: opts.onPointerLeave,
    onPointerDown: opts.onPointerDown,
    onPointerUp: opts.onPointerUp,
  });
};
