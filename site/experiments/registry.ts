// Experiment registry. Each entry is a self-contained demo of one or more
// component primitives, mounted at /experiments/<name>.
//
// An Experiment is a simple contract:
//   - `mount(root)` builds the demo into `root` (the page's #app element).
//   - The function returns a `teardown()` callback that disposes any
//     stages, intervals, or RAF tickers it created.
//
// The router calls mount on route entry and teardown on route exit. Adding
// an experiment is two steps:
//   1. Write the experiment file under site/experiments/
//   2. Append it to EXPERIMENTS in this file.

export type ExperimentMount = (root: HTMLElement) => () => void;

export type Experiment = {
  // URL slug, also displayed in the index. Must match
  // `/^[a-z0-9-]+$/` to play nicely with the router.
  name: string;
  // Display title shown in the index card and on the experiment page.
  title: string;
  // One-line description.
  blurb: string;
  // What's being demonstrated, displayed below the canvas.
  topics: ReadonlyArray<string>;
  // Lazy-loaded mount fn; the registry uses dynamic import so each
  // experiment only ships its code when visited. The router awaits this
  // before calling the returned mount.
  load: () => Promise<{ mount: ExperimentMount }>;
};

export const EXPERIMENTS: ReadonlyArray<Experiment> = [
  {
    name: 'button',
    title: 'button — hover / press / click',
    blurb: 'A screean button() with hover + press + click handlers wired through pointerTracker. Particles recolor live as state changes.',
    topics: ['button', 'pointerTracker', 'routePointerEvent', 'recolor'],
    load: () => import('./button'),
  },
  {
    name: 'six-logo',
    title: 'six-logo — gltf as particle cloud',
    blurb: 'A 3D model fed to the 2D particle system as projected targets. Triangles are area-sampled into a point cloud; per-frame projection drives spring targets. Click to scatter.',
    topics: ['glTF', 'projection', 'radialImpulse', 'depth-cued alpha'],
    load: () => import('./sixLogo'),
  },
  {
    name: 'flowfield',
    title: 'flowfield — particles drifting through a curl-like field',
    blurb: 'No model, no projection — particles drift through a bounded 2D vector field. Spring chases a moving target one lookahead-step ahead in the flow. Wraps at canvas edges. Click to scatter.',
    topics: ['flowfield', 'spring chase', 'wrap bounds', 'radialImpulse'],
    load: () => import('./flowfield'),
  },
  {
    name: 'flowfield-gpu',
    title: 'flowfield-gpu — webgpu compute pipeline',
    blurb: 'Same flowfield, run on the GPU. Compute shader handles flow + spring + drag + integrate + wrap; render shader draws instanced quads from the same buffer. Default 80K particles, ceiling 500K. Requires WebGPU (Chrome / Edge / Firefox-nightly).',
    topics: ['WebGPU', 'compute shader', 'WGSL', 'instanced rendering'],
    load: () => import('./flowfieldGpu'),
  },
];

export const findExperiment = (name: string): Experiment | undefined =>
  EXPERIMENTS.find((e) => e.name === name);
