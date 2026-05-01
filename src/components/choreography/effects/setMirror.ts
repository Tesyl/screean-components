// Mirror-scope primitives — write CSS state on a component's DOM mirror div.
//
// setMirrorOpacity({to})           — opacity write
// setMirrorPointerEvents({to})     — pointer-events write
//
// Both default to ctx.component as the mirror target; pass `target` to
// override (rare, but lets one component's choreography animate another's
// mirror — useful for "select all" patterns).
//
// Resolves silently when neither target is available — no crash mid-demo.
// Consumers that want loud failures can wrap with `when(ctx => ctx.component, ...)`.

import type { Effect } from '../effect';
import type { Component } from '../../types';
import { findMirrorDiv, resolveMirrorTarget } from './_mirror';

export type SetMirrorOpacityOpts = {
  to: number;
  target?: Component;
};

export const setMirrorOpacity = (opts: SetMirrorOpacityOpts): Effect => ({
  scope: 'mirror',
  duration: 0,
  tick: (_, ctx) => {
    const target = resolveMirrorTarget(opts.target, ctx.component);
    if (!target) return;
    const div = findMirrorDiv(ctx.mirrorHost, target._component.id);
    if (!div) return;
    div.style.opacity = String(opts.to);
  },
});

export type SetMirrorPointerEventsOpts = {
  to: 'auto' | 'none';
  target?: Component;
};

export const setMirrorPointerEvents = (
  opts: SetMirrorPointerEventsOpts,
): Effect => ({
  scope: 'mirror',
  duration: 0,
  tick: (_, ctx) => {
    const target = resolveMirrorTarget(opts.target, ctx.component);
    if (!target) return;
    const div = findMirrorDiv(ctx.mirrorHost, target._component.id);
    if (!div) return;
    div.style.pointerEvents = opts.to;
  },
});
