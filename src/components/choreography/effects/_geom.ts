// Geometry helpers shared across effects. Pure functions; testable in
// isolation. Live alongside effects rather than in a global utilities module
// so the dependency graph stays scoped (effects → _geom only).

import type { Particle } from 'screean';

// Mean (cx, cy) over the live particles in the index set. Skips dead
// particles. Returns (0, 0) for empty / all-dead groups — callers that need
// a different fallback should check `indices.length` themselves.
export const centroidOf = (
  indices: readonly number[],
  particles: ReadonlyArray<Particle>,
): { x: number; y: number } => {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (const i of indices) {
    const p = particles[i];
    if (!p || p.life <= 0) continue;
    sx += p.x;
    sy += p.y;
    n++;
  }
  if (n === 0) return { x: 0, y: 0 };
  return { x: sx / n, y: sy / n };
};

// Largest distance from the group centroid to any live particle in the set.
// Used as a fallback radius for spatial impulses when no explicit radius is
// supplied. Returns 0 for empty groups.
export const boundsRadiusOf = (
  indices: readonly number[],
  particles: ReadonlyArray<Particle>,
): number => {
  if (indices.length === 0) return 0;
  const c = centroidOf(indices, particles);
  let maxDistSq = 0;
  for (const i of indices) {
    const p = particles[i];
    if (!p || p.life <= 0) continue;
    const dx = p.x - c.x;
    const dy = p.y - c.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > maxDistSq) maxDistSq = d2;
  }
  return Math.sqrt(maxDistSq);
};
