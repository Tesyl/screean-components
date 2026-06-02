// Group — a lazy resolver from "logical selection" to particle indices.
//
// Effects don't operate on components directly; they operate on Groups, which
// are functions that return the current particle indices for whatever logical
// region they describe. Three flavors cover ~99% of choreography needs:
//
//   groupOfComponent(c)        — every particle bound to c's subtree
//   groupOfPart(c, partName)   — every particle bound to c's named child
//   groupAll()                 — every particle in the world
//   groupWhere(predicate)      — ad-hoc filter (escape hatch)
//
// Default `mode: 'run'` snapshots indices at pipeline-run time. Pass
// `mode: 'tick'` to re-resolve every frame — useful when particles rebind
// mid-pipeline (scene swap during a long-running effect, dynamic
// composition, etc). Cost is one engine-side index lookup per tick;
// engine caches the lookup so it's O(leaves) typically.

import type { Particle, Scene, SceneNode } from '@tesyl/screean';
import type { Component } from '../types';
import { findPart } from './parts';

export type GroupCtx = {
  scene: Scene;
  particles: ReadonlyArray<Particle>;
};

// Resolution mode — 'run' (default) snapshots at pipeline-run time;
// 'tick' re-resolves every frame.
export type GroupMode = 'run' | 'tick';

export type GroupOpts = {
  mode?: GroupMode;
};

export type Group = {
  resolve: (ctx: GroupCtx) => readonly number[];
  // Optional human-readable label for debugging / lab UI ("button.chrome").
  label?: string;
  // 'run' = snapshot once at runner.run(); 'tick' = re-resolve every tick.
  // Runner inspects this to decide whether to call resolve once or per-tick.
  mode: GroupMode;
};

// Every particle bound to a SceneNode's subtree. Component is a SceneNode,
// so this also handles components — `groupOfComponent` is the typed shortcut.
// Useful for callers that have a non-component SceneNode (e.g. routing's
// "current page" node).
export const groupOfSubtree = (node: SceneNode, opts: GroupOpts = {}): Group => ({
  resolve: (ctx) => ctx.scene.indicesForSubtree(node),
  label: 'subtree',
  mode: opts.mode ?? 'run',
});

// Every particle bound to the component's subtree. Resolution delegates to
// the engine's existing per-leaf index cache (populated by scene.bindAll),
// so this is O(leaves) — typically ≤10 for a single component.
export const groupOfComponent = (c: Component, opts: GroupOpts = {}): Group => ({
  resolve: (ctx) => ctx.scene.indicesForSubtree(c),
  label: `component(${c._component.id ?? '?'})`,
  mode: opts.mode ?? 'run',
});

// Particles bound to the named subpart of a component. Returns [] when the
// part doesn't exist — choreography degrades silently rather than throwing.
// Useful for default registry entries that reference parts the consumer's
// component might not have populated.
export const groupOfPart = (c: Component, partName: string, opts: GroupOpts = {}): Group => ({
  resolve: (ctx) => {
    const partNode = findPart(c, partName);
    if (partNode === null) return [];
    return ctx.scene.indicesForSubtree(partNode);
  },
  label: `${c._component.id ?? '?'}.${partName}`,
  mode: opts.mode ?? 'run',
});

// Every particle in the world. Allocates an index array sized to particle
// count — discourage in default registries; use as an escape hatch for
// world-wide effects (e.g. screen-shake, global glitch).
export const groupAll = (opts: GroupOpts = {}): Group => ({
  resolve: (ctx) => {
    const out: number[] = new Array(ctx.particles.length);
    for (let i = 0; i < ctx.particles.length; i++) out[i] = i;
    return out;
  },
  label: 'all',
  mode: opts.mode ?? 'run',
});

// Ad-hoc filter. O(N) over the particle pool — keep predicates cheap. Use
// for queries that don't fit the scene-graph shape (e.g. "particles whose
// life is below 0.2", "particles in the upper half of the screen").
export const groupWhere = (
  predicate: (p: Particle, i: number) => boolean,
  opts: GroupOpts = {},
): Group => ({
  resolve: (ctx) => {
    const out: number[] = [];
    for (let i = 0; i < ctx.particles.length; i++) {
      if (predicate(ctx.particles[i], i)) out.push(i);
    }
    return out;
  },
  label: 'where',
  mode: opts.mode ?? 'run',
});
