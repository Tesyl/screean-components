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
// Resolution is snapshotted at pipeline-run time, not per-tick. Particle
// rebinding mid-pipeline (e.g. dissolve > scene swap) leaves indices stale;
// this is documented and accepted for v1. Per-tick re-resolution is an
// additive opt later.
import { findPart } from './parts';
// Every particle bound to the component's subtree. Resolution delegates to
// the engine's existing per-leaf index cache (populated by scene.bindAll),
// so this is O(leaves) — typically ≤10 for a single component.
export const groupOfComponent = (c) => ({
    resolve: (ctx) => ctx.scene.indicesForSubtree(c),
    label: `component(${c._component.id ?? '?'})`,
});
// Particles bound to the named subpart of a component. Returns [] when the
// part doesn't exist — choreography degrades silently rather than throwing.
// Useful for default registry entries that reference parts the consumer's
// component might not have populated.
export const groupOfPart = (c, partName) => ({
    resolve: (ctx) => {
        const partNode = findPart(c, partName);
        if (partNode === null)
            return [];
        return ctx.scene.indicesForSubtree(partNode);
    },
    label: `${c._component.id ?? '?'}.${partName}`,
});
// Every particle in the world. Allocates an index array sized to particle
// count — discourage in default registries; use as an escape hatch for
// world-wide effects (e.g. screen-shake, global glitch).
export const groupAll = () => ({
    resolve: (ctx) => {
        const out = new Array(ctx.particles.length);
        for (let i = 0; i < ctx.particles.length; i++)
            out[i] = i;
        return out;
    },
    label: 'all',
});
// Ad-hoc filter. O(N) over the particle pool — keep predicates cheap. Use
// for queries that don't fit the scene-graph shape (e.g. "particles whose
// life is below 0.2", "particles in the upper half of the screen").
export const groupWhere = (predicate) => ({
    resolve: (ctx) => {
        const out = [];
        for (let i = 0; i < ctx.particles.length; i++) {
            if (predicate(ctx.particles[i], i))
                out.push(i);
        }
        return out;
    },
    label: 'where',
});
