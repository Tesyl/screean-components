// Subpart naming for components — a side-channel WeakMap that lets factories
// tag meaningful subtrees (e.g. slider's `thumb`, button's `chrome`) so the
// choreography layer can address them via groupOfPart(component, name).
//
// Lives outside the engine deliberately: SceneNode is shared infrastructure;
// "what's the name of this part of a component?" is a components-only concept
// and never reaches GPU memory. WeakMap auto-clears removed nodes.
//
// Lookup is O(1); subtree search is depth-first and bails on first hit.

import type { SceneNode } from 'screean';

const partNames: WeakMap<SceneNode, string> = new WeakMap();

// Tag a node with a part name. Returns the node for fluent chaining inside
// factory definitions: setPart(node(rect({...})), 'thumb').
export const setPart = (n: SceneNode, name: string): SceneNode => {
  partNames.set(n, name);
  return n;
};

// Read back a part name. Returns undefined for untagged nodes.
export const getPart = (n: SceneNode): string | undefined =>
  partNames.get(n);

// Walk a subtree depth-first looking for the first node tagged with `name`.
// Returns null when no match exists. Pure traversal — no caching, no mutation.
//
// Typical input is a component's root subtree (<10 nodes); recursion depth
// matches scene-graph nesting which is also small for v1 components.
export const findPart = (root: SceneNode, name: string): SceneNode | null => {
  if (partNames.get(root) === name) return root;
  for (const child of root.children) {
    const hit = findPart(child, name);
    if (hit !== null) return hit;
  }
  return null;
};
