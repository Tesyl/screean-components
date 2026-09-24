// Reproduces the CPU-only experiment described in particle-fidelity-handoff.md.
// Run from any directory. Requires this checkout's installed esbuild CLI and
// the sibling screean source tree. Bundles are temporary; repositories are read-only.
import { execFileSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir, cpus } from 'node:os';
import { dirname, resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const args = process.argv.slice(2);
if (args.some(arg => arg !== '--smoke') || args.length > 1) {
  throw new Error('Usage: node docs/benchmarks/particle-fidelity.mjs [--smoke]');
}
const smoke = args.includes('--smoke');
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const engineRoot = resolve(root, '../screean');
const scratch = await mkdtemp(join(tmpdir(), 'screean-fidelity-'));
const percentile = (values, p) => [...values].sort((a, b) => a - b)[
  Math.min(values.length - 1, Math.floor(values.length * p))
];

try {
  const esbuild = resolve(root, 'node_modules/.bin/esbuild');
  for (const [entry, output] of [
    ['src/index.ts', 'engine.mjs'],
    ['src/core/forces.ts', 'forces.mjs'],
  ]) {
    execFileSync(esbuild, [resolve(engineRoot, entry), '--bundle',
      '--platform=node', '--format=esm', `--outfile=${join(scratch, output)}`,
    ], { stdio: ['ignore', 'ignore', 'inherit'] });
  }
  const { World, feels, spawn, spring, drag, shimmer, neighborRepel,
    pointForce, radialImpulse, packRGBA, mulberry32,
  } = await import(pathToFileURL(join(scratch, 'engine.mjs')).href);
  const { perlinForce } = await import(pathToFileURL(join(scratch, 'forces.mjs')).href);

  function makeWorld(n, width, height, mode) {
    const rng = mulberry32(12345);
    const f = feels.soft;
    const world = new World({ width: 1280, height: 800,
      hashCellSize: f.hashCellSize, rng });
    world.setForces([
      spring(f.springK, f.springC), drag(f.drag),
      shimmer(f.shimmerAmp, f.shimmerFreq),
      neighborRepel(f.repelRadius, mode === 'default' ? f.repelStrength : 0),
      pointForce(() => null, f.pointerAttract, 80),
      ...(mode === 'perlin'
        ? [perlinForce({ strength: 40, speed: 0.1, octaves: 3 })] : []),
    ]);
    const particles = spawn({ n, origin: { kind: 'point', x: 0, y: 0 },
      color: packRGBA(230, 230, 240, 255), speed: 0, rng });
    for (const p of particles) {
      p.x = p.tx = 100 + rng() * width;
      p.y = p.ty = 100 + rng() * height;
      p.weight = 0;
    }
    world.addParticles(particles);
    radialImpulse(particles, {
      origin: { x: 100 + width / 2, y: 100 + height / 2 }, kick: 420,
    });
    return world;
  }

  const modes = ['default', 'no-repel', 'perlin'];
  const trials = smoke ? 1 : 3;
  const steps = smoke ? 8 : 43;
  console.log(JSON.stringify({ type: 'metadata', mode: smoke ? 'smoke' : 'full',
    date: new Date().toISOString(), node: process.version,
    platform: process.platform, arch: process.arch, cpu: cpus()[0]?.model,
    engineRoot, trials, steps, dt: 1 / 60, seed: 12345,
    warning: 'CPU physics only; smoke results are not the full benchmark.' }));

  // Same warmup and order as the original measurement.
  for (const mode of modes) {
    const world = makeWorld(6000, 160, 48, mode);
    for (let i = 0; i < 50; i++) world.tick(1 / 60);
  }
  for (const [width, height] of smoke ? [[160, 48]] : [[160, 48], [640, 360]]) {
    for (const n of smoke ? [6000] : [6000, 25000, 65536]) {
      for (const mode of modes) {
        const initial = [];
        const roam = [];
        for (let trial = 0; trial < trials; trial++) {
          const world = makeWorld(n, width, height, mode);
          for (let frame = 0; frame < steps; frame++) {
            const start = performance.now();
            world.tick(1 / 60);
            const ms = performance.now() - start;
            if (frame === 0) initial.push(ms);
            else roam.push(ms);
          }
        }
        console.log(JSON.stringify({ type: 'result', area: `${width}x${height}`,
          n, mode, firstMs: +percentile(initial, 0.5).toFixed(2),
          roamMedianMs: +percentile(roam, 0.5).toFixed(2),
          roamP95Ms: +percentile(roam, 0.95).toFixed(2) }));
      }
    }
  }
} finally {
  await rm(scratch, { recursive: true, force: true });
}
