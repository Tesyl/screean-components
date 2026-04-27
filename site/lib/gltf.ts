// gltf.ts — minimal .glb loader + triangle-surface sampler.
//
// Goal: turn a binary glTF file into a flat list of mesh-local 3D points
// distributed by triangle area, ready to feed as targets to screean's 2D
// particle system. We never touch materials, normals, animations, or skins
// — POSITION + indices is all that matters for "matter-shape of the model."
//
// Why hand-rolled parsing instead of @loaders.gl/gltf or three.js: the file
// is JSON + binary, and we only need POSITION + indices. ~120 LOC of parse
// is leaner than a 200KB dependency, and the experiment doesn't gain
// anything from a richer loader.
//
// Format reference: https://registry.khronos.org/glTF/specs/2.0/glTF-2.0.html
// (binary form §3.4: 12-byte header, then chunks of {len, type, data}).

import type { Rng } from 'screean';

// Component types from glTF 2.0 — only the ones we handle for indices.
const COMPONENT_BYTE = 5120;
const COMPONENT_UBYTE = 5121;
const COMPONENT_SHORT = 5122;
const COMPONENT_USHORT = 5123;
const COMPONENT_UINT = 5125;
const COMPONENT_FLOAT = 5126;

const CHUNK_JSON = 0x4e4f534a; // 'JSON'
const CHUNK_BIN = 0x004e4942; // 'BIN\0'

type GltfAccessor = {
  bufferView: number;
  componentType: number;
  count: number;
  type: 'SCALAR' | 'VEC2' | 'VEC3' | 'VEC4' | 'MAT2' | 'MAT3' | 'MAT4';
  byteOffset?: number;
};

type GltfBufferView = {
  buffer: number;
  byteOffset?: number;
  byteLength: number;
  byteStride?: number;
};

type GltfPrimitive = {
  attributes: Record<string, number>;
  indices?: number;
  mode?: number; // 4 = TRIANGLES, default per spec
};

type GltfMesh = {
  primitives: GltfPrimitive[];
};

type GltfRoot = {
  meshes?: GltfMesh[];
  accessors?: GltfAccessor[];
  bufferViews?: GltfBufferView[];
};

export type LoadedMesh = {
  // Flat (x, y, z) per vertex, expanded so that each consecutive 9 floats
  // is a triangle (no shared indices). Length = triangleCount × 9.
  triangles: Float32Array;
  triangleCount: number;
  // Mesh-local axis-aligned bounding box. Used by callers to fit the model
  // into the viewport without per-frame re-measurement.
  bbox: { min: [number, number, number]; max: [number, number, number] };
};

// Read a Uint8Array slice as a typed array given a glTF componentType. Used
// for both indices and positions. Stride is component-byte * components per
// element; we honor `byteStride` from the bufferView if present (interleaved
// vertex data uses it; non-interleaved usually doesn't set it).
const readAccessor = (
  acc: GltfAccessor,
  bv: GltfBufferView,
  bin: Uint8Array,
): ArrayLike<number> => {
  const offset = (bv.byteOffset ?? 0) + (acc.byteOffset ?? 0);
  // ArrayBuffer + offset; the typed array view points into the same memory
  // as `bin` so we don't copy. Read-only is fine — callers don't mutate.
  const buf = bin.buffer;
  const start = bin.byteOffset + offset;
  switch (acc.componentType) {
    case COMPONENT_BYTE:
      return new Int8Array(buf, start, acc.count * componentsFor(acc.type));
    case COMPONENT_UBYTE:
      return new Uint8Array(buf, start, acc.count * componentsFor(acc.type));
    case COMPONENT_SHORT:
      return new Int16Array(buf, start, acc.count * componentsFor(acc.type));
    case COMPONENT_USHORT:
      return new Uint16Array(buf, start, acc.count * componentsFor(acc.type));
    case COMPONENT_UINT:
      return new Uint32Array(buf, start, acc.count * componentsFor(acc.type));
    case COMPONENT_FLOAT:
      return new Float32Array(buf, start, acc.count * componentsFor(acc.type));
    default:
      throw new Error(`gltf: unsupported componentType ${acc.componentType}`);
  }
};

const componentsFor = (type: GltfAccessor['type']): number => {
  switch (type) {
    case 'SCALAR': return 1;
    case 'VEC2':   return 2;
    case 'VEC3':   return 3;
    case 'VEC4':   return 4;
    case 'MAT2':   return 4;
    case 'MAT3':   return 9;
    case 'MAT4':   return 16;
  }
};

// Parse a .glb ArrayBuffer into the JSON root + binary chunk. The binary
// chunk is optional in the spec but every model with vertex data has one.
const parseGlb = (
  buffer: ArrayBuffer,
): { json: GltfRoot; bin: Uint8Array } => {
  const view = new DataView(buffer);
  const magic = view.getUint32(0, true);
  if (magic !== 0x46546c67) {
    throw new Error('gltf: not a .glb file (bad magic)');
  }
  const version = view.getUint32(4, true);
  if (version !== 2) {
    throw new Error(`gltf: unsupported version ${version}`);
  }

  let cursor = 12;
  let json: GltfRoot | null = null;
  let bin: Uint8Array | null = null;

  while (cursor < buffer.byteLength) {
    const chunkLen = view.getUint32(cursor, true);
    const chunkType = view.getUint32(cursor + 4, true);
    const dataStart = cursor + 8;
    if (chunkType === CHUNK_JSON) {
      // JSON chunk is padded to 4-byte alignment with spaces; TextDecoder
      // ignores trailing spaces if we just feed it the raw chunk.
      const text = new TextDecoder().decode(
        new Uint8Array(buffer, dataStart, chunkLen),
      );
      json = JSON.parse(text) as GltfRoot;
    } else if (chunkType === CHUNK_BIN) {
      bin = new Uint8Array(buffer, dataStart, chunkLen);
    }
    cursor = dataStart + chunkLen;
  }

  if (!json) throw new Error('gltf: missing JSON chunk');
  if (!bin) throw new Error('gltf: missing BIN chunk');
  return { json, bin };
};

// Walk every mesh primitive in the glTF, expand into a flat triangle list.
// Indexed primitives are dereferenced; non-indexed are taken sequentially.
// Triangle strips / fans are NOT supported in v1 — the 6ixLogo file (and
// almost every Blender export) uses mode=TRIANGLES (4).
const expandTriangles = (root: GltfRoot, bin: Uint8Array): LoadedMesh => {
  const meshes = root.meshes ?? [];
  const accessors = root.accessors ?? [];
  const bufferViews = root.bufferViews ?? [];

  // First pass: count triangles so we can allocate the output once.
  let triCount = 0;
  for (const mesh of meshes) {
    for (const prim of mesh.primitives) {
      const mode = prim.mode ?? 4;
      if (mode !== 4) continue; // skip non-TRIANGLES primitives in v1
      const posIdx = prim.attributes.POSITION;
      if (posIdx === undefined) continue;
      if (prim.indices !== undefined) {
        triCount += accessors[prim.indices].count / 3;
      } else {
        triCount += accessors[posIdx].count / 3;
      }
    }
  }

  const out = new Float32Array(triCount * 9);
  const min: [number, number, number] = [Infinity, Infinity, Infinity];
  const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  let cursor = 0;

  for (const mesh of meshes) {
    for (const prim of mesh.primitives) {
      const mode = prim.mode ?? 4;
      if (mode !== 4) continue;
      const posIdx = prim.attributes.POSITION;
      if (posIdx === undefined) continue;

      const posAcc = accessors[posIdx];
      const posBv = bufferViews[posAcc.bufferView];
      const positions = readAccessor(posAcc, posBv, bin) as Float32Array;

      // Walk indices (if any) or sequential triangle list. For each vertex
      // index we copy 3 floats into the flat output and update bbox.
      const writeVert = (vIdx: number): void => {
        const x = positions[vIdx * 3];
        const y = positions[vIdx * 3 + 1];
        const z = positions[vIdx * 3 + 2];
        out[cursor++] = x;
        out[cursor++] = y;
        out[cursor++] = z;
        if (x < min[0]) min[0] = x;
        if (y < min[1]) min[1] = y;
        if (z < min[2]) min[2] = z;
        if (x > max[0]) max[0] = x;
        if (y > max[1]) max[1] = y;
        if (z > max[2]) max[2] = z;
      };

      if (prim.indices !== undefined) {
        const idxAcc = accessors[prim.indices];
        const idxBv = bufferViews[idxAcc.bufferView];
        const indices = readAccessor(idxAcc, idxBv, bin);
        for (let i = 0; i < indices.length; i++) writeVert(indices[i] as number);
      } else {
        const vCount = posAcc.count;
        for (let i = 0; i < vCount; i++) writeVert(i);
      }
    }
  }

  return {
    triangles: out,
    triangleCount: triCount,
    bbox: { min, max },
  };
};

export const loadGlb = async (url: string): Promise<LoadedMesh> => {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`gltf: fetch ${url} → ${res.status}`);
  const buf = await res.arrayBuffer();
  const { json, bin } = parseGlb(buf);
  return expandTriangles(json, bin);
};

// Triangle area via half-cross-product of two edges. Clamped at 0 to avoid
// tiny negative values from floating-point drift on degenerate triangles.
const triArea = (
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number => {
  const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
  const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
  // cross = e1 × e2
  const nx = e1y * e2z - e1z * e2y;
  const ny = e1z * e2x - e1x * e2z;
  const nz = e1x * e2y - e1y * e2x;
  return 0.5 * Math.sqrt(nx * nx + ny * ny + nz * nz);
};

// Sample N points uniformly distributed across the mesh surface, weighted
// by triangle area. Output: Float32Array of N×3 floats in mesh-local space.
//
// Algorithm:
//   1. Compute area per triangle, build a CDF.
//   2. For each sample, pick a uniform [0, totalArea) value and binary-
//      search the CDF to choose the triangle.
//   3. Sample uniformly inside the triangle via the (u, v) reflection trick:
//      u, v ∈ [0, 1]; if u + v > 1, flip both. Barycentric w = 1 - u - v.
//
// Given the same `rng`, the same N produces the same point cloud — useful
// for reproducible visuals + deterministic tests if we ever want them.
export const sampleSurface = (
  mesh: LoadedMesh,
  n: number,
  rng: Rng,
): Float32Array => {
  const tris = mesh.triangles;
  const triCount = mesh.triangleCount;

  // Build CDF of triangle areas.
  const cdf = new Float32Array(triCount);
  let total = 0;
  for (let i = 0; i < triCount; i++) {
    const o = i * 9;
    total += triArea(
      tris[o + 0], tris[o + 1], tris[o + 2],
      tris[o + 3], tris[o + 4], tris[o + 5],
      tris[o + 6], tris[o + 7], tris[o + 8],
    );
    cdf[i] = total;
  }

  const out = new Float32Array(n * 3);
  for (let s = 0; s < n; s++) {
    // Binary search for the triangle whose CDF cell contains a uniform
    // sample in [0, total). Standard lower-bound on a sorted array.
    const target = rng() * total;
    let lo = 0, hi = triCount - 1;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (cdf[mid] < target) lo = mid + 1;
      else hi = mid;
    }
    const t = lo;
    const o = t * 9;

    // Uniform-on-triangle: reflection trick avoids vertex-clustering bias.
    let u = rng();
    let v = rng();
    if (u + v > 1) {
      u = 1 - u;
      v = 1 - v;
    }
    const w = 1 - u - v;
    const ax = tris[o + 0], ay = tris[o + 1], az = tris[o + 2];
    const bx = tris[o + 3], by = tris[o + 4], bz = tris[o + 5];
    const cx = tris[o + 6], cy = tris[o + 7], cz = tris[o + 8];
    out[s * 3 + 0] = w * ax + u * bx + v * cx;
    out[s * 3 + 1] = w * ay + u * by + v * cy;
    out[s * 3 + 2] = w * az + u * bz + v * cz;
  }
  return out;
};

// Center + scale the sampled cloud to fit a target radius around the origin.
// Done in-place. Lets the caller consume the sample without doing matrix
// math, and decouples model-local units from screen-space units (the .glb
// might be 0.1 units tall, or 1000).
export const centerAndScale = (
  points: Float32Array,
  bbox: LoadedMesh['bbox'],
  targetRadius: number,
): void => {
  const cx = (bbox.min[0] + bbox.max[0]) * 0.5;
  const cy = (bbox.min[1] + bbox.max[1]) * 0.5;
  const cz = (bbox.min[2] + bbox.max[2]) * 0.5;
  const dx = bbox.max[0] - bbox.min[0];
  const dy = bbox.max[1] - bbox.min[1];
  const dz = bbox.max[2] - bbox.min[2];
  const extent = 0.5 * Math.sqrt(dx * dx + dy * dy + dz * dz);
  const scale = targetRadius / Math.max(extent, 1e-6);
  for (let i = 0; i < points.length; i += 3) {
    points[i + 0] = (points[i + 0] - cx) * scale;
    points[i + 1] = (points[i + 1] - cy) * scale;
    points[i + 2] = (points[i + 2] - cz) * scale;
  }
};
