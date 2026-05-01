import { afterAll, beforeAll, beforeEach, describe, expect, it, } from 'vitest';
import { __resetNodeIds, circleField, node, rect, scene, spawn, TRANSPARENT, World, } from 'screean';
import { installOffscreenCanvasStub, uninstallOffscreenCanvasStub, } from '../../testing/offscreenCanvasStub';
import { __resetComponentIds } from '../component';
import { component } from '../component';
import { groupAll, groupOfComponent, groupOfPart, groupWhere, } from './group';
import { setPart } from './parts';
beforeAll(installOffscreenCanvasStub);
afterAll(uninstallOffscreenCanvasStub);
beforeEach(() => {
    __resetNodeIds();
    __resetComponentIds();
});
// Build a tagged-subpart component analogous to slider: a container with
// `track`, `fill`, `thumb` children. We construct manually rather than calling
// the slider factory because Step 9 hasn't tagged the factory yet.
const buildTaggedComponent = () => {
    const track = setPart(node(rect({ w: 100, h: 10, radius: 5 }), { z: 0 }), 'track');
    const fill = setPart(node(rect({ w: 50, h: 10, radius: 5 }), { z: 1 }), 'fill');
    const thumb = setPart(node(circleField({ cx: 50, cy: 5, r: 8 }), { z: 2 }), 'thumb');
    const container = node(null, { z: 0 });
    container.children.push(track, fill, thumb);
    track.parent = container;
    fill.parent = container;
    thumb.parent = container;
    container.intrinsic = { x: 0, y: 0, w: 100, h: 10 };
    return component(container, {
        id: 'test-slider',
        ariaRole: 'slider',
        value: 0.5,
        min: 0,
        max: 1,
    });
};
const buildSceneAndParticles = (c, particleCount = 12) => {
    const s = scene({ particleCount }, c);
    s.tick(0);
    const w = new World({ width: 200, height: 200 });
    w.addParticles(spawn({
        n: particleCount,
        origin: { kind: 'point', x: 0, y: 0 },
        color: TRANSPARENT,
    }));
    s.bindAll(w.particles, { kind: 'equal' });
    return { s, particles: w.particles };
};
describe('groupOfComponent', () => {
    it('resolves to every particle bound to the component subtree', () => {
        const c = buildTaggedComponent();
        const { s, particles } = buildSceneAndParticles(c, 12);
        const indices = groupOfComponent(c).resolve({ scene: s, particles });
        // 3 leaves × 4 particles each via 'equal' policy = 12
        expect(indices.length).toBe(12);
        expect(new Set(indices).size).toBe(12);
    });
    it('carries a debug label tagged with the component id', () => {
        const c = buildTaggedComponent();
        expect(groupOfComponent(c).label).toBe('component(test-slider)');
    });
});
describe('groupOfPart', () => {
    it('resolves to particles bound only to the named subpart', () => {
        const c = buildTaggedComponent();
        const { s, particles } = buildSceneAndParticles(c, 12);
        const thumbIndices = groupOfPart(c, 'thumb').resolve({ scene: s, particles });
        const trackIndices = groupOfPart(c, 'track').resolve({ scene: s, particles });
        expect(thumbIndices.length).toBe(4);
        expect(trackIndices.length).toBe(4);
        // Disjoint
        expect(thumbIndices.some((i) => trackIndices.includes(i))).toBe(false);
    });
    it('returns an empty array when the part name does not exist', () => {
        const c = buildTaggedComponent();
        const { s, particles } = buildSceneAndParticles(c, 12);
        const indices = groupOfPart(c, 'nonexistent').resolve({ scene: s, particles });
        expect(indices).toEqual([]);
    });
});
describe('groupAll', () => {
    it('resolves to every index in the particle pool', () => {
        const c = buildTaggedComponent();
        const { s, particles } = buildSceneAndParticles(c, 7);
        const indices = groupAll().resolve({ scene: s, particles });
        expect(indices).toEqual([0, 1, 2, 3, 4, 5, 6]);
    });
});
describe('groupWhere', () => {
    it('filters particles by predicate', () => {
        const c = buildTaggedComponent();
        const { s, particles } = buildSceneAndParticles(c, 8);
        // Mark even-indexed particles by mutating life so the predicate can pick them.
        for (let i = 0; i < particles.length; i += 2)
            particles[i].life = 99;
        const indices = groupWhere((p) => p.life === 99).resolve({
            scene: s,
            particles,
        });
        expect(indices).toEqual([0, 2, 4, 6]);
    });
});
