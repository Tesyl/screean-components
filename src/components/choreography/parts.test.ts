import { beforeEach, describe, expect, it } from 'vitest';
import { __resetNodeIds, node, rect } from 'screean';
import { findPart, getPart, setPart } from './parts';

beforeEach(() => {
  __resetNodeIds();
});

describe('parts', () => {
  it('roundtrips: setPart then getPart returns the same name', () => {
    const n = node(rect({ w: 10, h: 10, radius: 0 }), { z: 0 });
    setPart(n, 'thumb');
    expect(getPart(n)).toBe('thumb');
  });

  it('findPart walks depth-first and returns the first match in a subtree', () => {
    const thumb = setPart(node(rect({ w: 4, h: 4, radius: 0 }), { z: 2 }), 'thumb');
    const fill = setPart(node(rect({ w: 6, h: 4, radius: 0 }), { z: 1 }), 'fill');
    const track = setPart(node(rect({ w: 10, h: 4, radius: 0 }), { z: 0 }), 'track');
    const root = node(null, { z: 0 });
    root.children.push(track, fill, thumb);
    track.parent = root;
    fill.parent = root;
    thumb.parent = root;

    expect(findPart(root, 'thumb')).toBe(thumb);
    expect(findPart(root, 'track')).toBe(track);
    expect(findPart(root, 'fill')).toBe(fill);
  });

  it('findPart returns null for missing names without throwing', () => {
    const root = setPart(node(rect({ w: 10, h: 10, radius: 0 }), { z: 0 }), 'chrome');
    expect(findPart(root, 'nonexistent')).toBeNull();
    expect(getPart(node(rect({ w: 1, h: 1, radius: 0 }), { z: 0 }))).toBeUndefined();
  });
});
