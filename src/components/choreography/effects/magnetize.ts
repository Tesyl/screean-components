// magnetize — pulls particles toward a target via inverse-square attraction.
// Same shape as the engine's pointForce, applied as a temporary effect.
//
// Strength tuning (typical ranges):
//   100   — drift
//   1000  — strong but smooth
//   5000  — snap
//
// Target snapshotted at start: even if the target moves during the effect's
// window, particles pull toward the original position. Document — moving
// targets create feedback loops at this scale.

import { defineEffect, type Effect, type EffectState } from '../effect';
import { centroidOf } from './_geom';
import { findPart } from '../parts';
import type { Component } from '../../types';

export type MagnetizeTo =
  | { x: number; y: number }
  | 'centroid'
  | { component: Component; part?: string };

export type MagnetizeOpts = {
  to: MagnetizeTo;
  strength: number;
  duration: number;
};

type MagnetizeState = EffectState & {
  __magnetize?: { destX: number; destY: number };
};

const resolveTarget = (
  to: MagnetizeTo,
  indices: readonly number[],
  ctx: Parameters<Effect['tick']>[1],
): { x: number; y: number } => {
  if (typeof to === 'object' && 'component' in to) {
    const comp = to.component;
    const node = to.part ? findPart(comp, to.part) ?? comp : comp;
    const sub = ctx.scene.indicesForSubtree(node);
    return centroidOf(sub, ctx.particles);
  }
  if (to === 'centroid') return centroidOf(indices, ctx.particles);
  return to;
};

export const magnetize = (opts: MagnetizeOpts): Effect =>
  defineEffect<MagnetizeState>({
    scope: 'spatial',
    duration: opts.duration,
    tick: (indices, ctx) => {
      let state = ctx.state.__magnetize;
      if (!state) {
        const dest = resolveTarget(opts.to, indices, ctx);
        state = { destX: dest.x, destY: dest.y };
        ctx.state.__magnetize = state;
      }

      const dtSec = ctx.dt / 1000;
      if (dtSec === 0) return;
      const strengthDt = opts.strength * dtSec;
      for (const i of indices) {
        const p = ctx.particles[i];
        if (!p || p.life <= 0) continue;
        const dx = state.destX - p.x;
        const dy = state.destY - p.y;
        const distSq = dx * dx + dy * dy;
        if (distSq < 1e-6) continue;
        // Inverse-square; cap at distSq=1 to avoid singularity near target.
        const denom = distSq < 1 ? 1 : distSq;
        p.vx += (dx / denom) * strengthDt;
        p.vy += (dy / denom) * strengthDt;
      }
    },
  });
