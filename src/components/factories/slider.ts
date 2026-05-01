// slider — a continuous-value range component. Pill-shaped track, filled
// portion proportional to value, circular thumb at the value's position.
//
// Like toggle, slider is consumer-controlled: pass `value` + `onChange`,
// rebuild on activation. Continuous drag is a v2 concern — for v1, onClick
// stepping is enough for tile demos and keyboard-driven values.
//
// ARIA: `role=slider` + `aria-valuenow|valuemin|valuemax` written by the
// DOM mirror from `value`/`min`/`max` on ComponentInternals.

import {
  node,
  rect,
  circleField,
  roundedRectField,
  type SceneNode,
} from 'screean';
import { component } from '../component';
import { setPart } from '../choreography/parts';
import type {
  Component,
  Handler,
  InteractiveOpts,
  SizedOpts,
} from '../types';

export type SliderOpts = InteractiveOpts &
  Pick<SizedOpts, 'width' | 'height' | 'z'> & {
    value: number;
    min?: number;
    max?: number;
    // Activation handler. v1 gives the consumer the click point; mapping
    // click x → new value is the consumer's job (there's no canonical
    // mapping when the consumer might want stepped, snapped, or continuous).
    onChange: Handler;
    // Optional thumb radius override. Default sized just past the track
    // height so the thumb visually punches through.
    thumbRadius?: number;
  };

const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const slider = (opts: SliderOpts): Component => {
  const min = opts.min ?? 0;
  const max = opts.max ?? 1;
  const value = clamp(opts.value, min, max);
  const width = opts.width ?? 220;
  const height = opts.height ?? 16;
  const thumbR = opts.thumbRadius ?? Math.max(8, height / 2 + 4);

  // Normalized 0..1 along the track. Slider works in any [min, max] range
  // but the visual is always the track-relative ratio.
  const t = max > min ? (value - min) / (max - min) : 0;

  const track = setPart(node(rect({ w: width, h: height, radius: height / 2 }), { z: 0 }), 'track');

  // Filled portion: rounded rect from the track's left edge to the thumb's
  // x. Width can't go below `height` or the rounded ends would self-overlap
  // weirdly; clamp at height for visual integrity at value=0.
  const fillW = Math.max(height, t * width);
  const fill = setPart(
    node(
      roundedRectField({
        x: 0,
        y: 0,
        w: fillW,
        h: height,
        radius: height / 2,
      }),
      { z: 1 },
    ),
    'fill',
  );

  // Thumb: circle at the value's x along the track's centerline.
  const thumb = setPart(
    node(
      circleField({ cx: t * width, cy: height / 2, r: thumbR }),
      { z: 2 },
    ),
    'thumb',
  );

  // Manual composition — explicit child positions, not stack auto-centering.
  // The fill must align to the track's left edge; the thumb must sit at the
  // value's x. stack() would re-center both on the chrome's midpoint and
  // break the visual.
  const container: SceneNode = node(null, { z: opts.z ?? 0 });
  container.children.push(track, fill, thumb);
  track.parent = container;
  fill.parent = container;
  thumb.parent = container;
  container.intrinsic = { x: 0, y: 0, w: width, h: height };

  return component(container, {
    id: opts.id,
    ariaRole: opts.ariaRole ?? 'slider',
    ariaLabel: opts.ariaLabel ?? `slider ${Math.round(t * 100)}%`,
    disabled: opts.disabled,
    value,
    min,
    max,
    onClick: opts.onChange,
    onPointerEnter: opts.onPointerEnter,
    onPointerLeave: opts.onPointerLeave,
    onPointerDown: opts.onPointerDown,
    onPointerUp: opts.onPointerUp,
  });
};
