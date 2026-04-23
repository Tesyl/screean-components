import { beforeEach, describe, expect, it } from 'vitest';
import { __resetNodeIds, node, rect } from 'screean';
import {
  __resetComponentIds,
  component,
  findComponentAncestor,
} from './component';
import { isComponent } from './types';

beforeEach(() => {
  __resetNodeIds();
  __resetComponentIds();
});

describe('component() factory', () => {
  it('attaches _component metadata and returns the same node reference', () => {
    const n = node(rect({ w: 10, h: 10, radius: 0 }));
    const c = component(n, { onClick: () => {} });
    // Identity — no wrapping, no new node.
    expect(c).toBe(n);
    expect(isComponent(n)).toBe(true);
  });

  it('defaults id to a fresh counter-based value', () => {
    const a = component(node(rect({ w: 10, h: 10, radius: 0 })));
    const b = component(node(rect({ w: 10, h: 10, radius: 0 })));
    expect(a._component.id).not.toBe(b._component.id);
    expect(a._component.id).toMatch(/^c\d+$/);
  });

  it('honors an explicit id', () => {
    const c = component(node(rect({ w: 10, h: 10, radius: 0 })), { id: 'save' });
    expect(c._component.id).toBe('save');
  });

  it('freezes handlers + internals so consumer mutation is impossible', () => {
    const c = component(node(rect({ w: 10, h: 10, radius: 0 })), {
      onClick: () => {},
    });
    expect(Object.isFrozen(c._component)).toBe(true);
    expect(Object.isFrozen(c._component.handlers)).toBe(true);
  });

  it('defaults ariaRole=none, label=undefined, disabled=false', () => {
    const c = component(node(rect({ w: 10, h: 10, radius: 0 })));
    expect(c._component.role).toBe('none');
    expect(c._component.label).toBeUndefined();
    expect(c._component.disabled).toBe(false);
  });

  it('propagates ariaRole / ariaLabel / disabled opts', () => {
    const c = component(node(rect({ w: 10, h: 10, radius: 0 })), {
      ariaRole: 'button',
      ariaLabel: 'Save',
      disabled: true,
    });
    expect(c._component.role).toBe('button');
    expect(c._component.label).toBe('Save');
    expect(c._component.disabled).toBe(true);
  });

  it('throws when tagging an already-tagged node (no silent overwrite)', () => {
    const n = node(rect({ w: 10, h: 10, radius: 0 }));
    component(n, { id: 'first' });
    expect(() => component(n, { id: 'second' })).toThrow(/already a component/);
  });
});

describe('isComponent type guard', () => {
  it('returns false for plain nodes', () => {
    expect(isComponent(node(rect({ w: 10, h: 10, radius: 0 })))).toBe(false);
  });

  it('returns true for tagged nodes', () => {
    const c = component(node(rect({ w: 10, h: 10, radius: 0 })));
    expect(isComponent(c)).toBe(true);
  });
});

describe('findComponentAncestor', () => {
  it('returns null when the node is not inside any component', () => {
    const leaf = node(rect({ w: 10, h: 10, radius: 0 }));
    expect(findComponentAncestor(leaf)).toBeNull();
  });

  it('returns the node itself when the node IS a component', () => {
    const c = component(node(rect({ w: 10, h: 10, radius: 0 })));
    expect(findComponentAncestor(c)).toBe(c);
  });

  it('walks up the parent chain to find the nearest component', () => {
    const child = node(rect({ w: 10, h: 10, radius: 0 }));
    const parent = node(null);
    parent.children.push(child);
    child.parent = parent;
    const wrapped = component(parent, { id: 'wrap' });
    expect(findComponentAncestor(child)).toBe(wrapped);
  });

  it('returns the INNERMOST component when multiple ancestors are tagged', () => {
    const leaf = node(rect({ w: 10, h: 10, radius: 0 }));
    const inner = node(null);
    const outer = node(null);
    inner.children.push(leaf);
    leaf.parent = inner;
    outer.children.push(inner);
    inner.parent = outer;
    const innerComp = component(inner, { id: 'inner' });
    component(outer, { id: 'outer' });
    expect(findComponentAncestor(leaf)).toBe(innerComp);
  });

  it('tolerates a null input', () => {
    expect(findComponentAncestor(null)).toBeNull();
  });
});
