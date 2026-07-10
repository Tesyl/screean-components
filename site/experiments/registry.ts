// Experiment registry. Each entry is a self-contained demo of one or more
// component primitives, surfaced from /experiments.
//
// Two flavors:
//   • `kind: 'internal'` — a vanilla TS sandbox that lives at
//     /experiments/<name>. Owns a `mount(root)` that builds the demo and
//     returns a `teardown()` callback. Lazy-loaded via dynamic import.
//   • `kind: 'external'` — a card that links out to a separate top-level
//     SPA route (e.g. /moonshot). External entries don't define a mount;
//     they're discovery shortcuts surfaced under the experiments index.
//
// Adding an internal experiment:
//   1. Write the experiment file under site/experiments/
//   2. Append a `kind: 'internal'` entry to EXPERIMENTS.
//
// Adding an external link:
//   1. Append a `kind: 'external'` entry with `href`.

// Flattens intersected/optional/union member shapes for cleaner hover docs.
type Prettify<T> = { [K in keyof T]: T[K] } & {};

export type ExperimentMount = (root: HTMLElement) => () => void;

type ExperimentBase = {
  // URL slug, also displayed in the index. Must match
  // `/^[a-z0-9-]+$/` to play nicely with the router.
  name: string;
  // Display title shown in the index card.
  title: string;
  // One-line description.
  blurb: string;
  // What's being demonstrated, displayed below the canvas.
  topics: ReadonlyArray<string>;
};

export type InternalExperiment = Prettify<
  ExperimentBase & {
    kind: 'internal';
    // Lazy-loaded mount fn; the registry uses dynamic import so each
    // experiment only ships its code when visited. The router awaits this
    // before calling the returned mount.
    load: () => Promise<{ mount: ExperimentMount }>;
  }
>;

export type ExternalExperiment = Prettify<
  ExperimentBase & {
    kind: 'external';
    // Where the card navigates. Stays inside the SPA (the router resolves
    // it via pushState) unless the value is an absolute URL.
    href: string;
  }
>;

export type Experiment = InternalExperiment | ExternalExperiment;

export const EXPERIMENTS: ReadonlyArray<Experiment> = [
  {
    kind: 'internal',
    name: 'button',
    title: 'button — native events, rasterized activation',
    blurb: "The button experiment rebuilt on Pattern A. headlessButton is a real <button>: hover/press are genuine CSS :hover/:active rules, pointer events fire natively (no canvas hit-test routing), and Tab+Enter works for free. Clicking runs the handler, then screen.dissolve(el) rasterizes the element as painted and round-trips it through the shared transition core. Three skins on one factory show the headless split — each variant's cloud inherits its own --screean-particle tokens.",
    topics: ['Pattern A', 'headlessButton', 'native events', ':hover/:active', 'createScreenController'],
    load: () => import('./button'),
  },
  {
    kind: 'internal',
    name: 'flowfield',
    title: 'flowfield — particles drifting through a curl-like field',
    blurb: 'No model, no projection — particles drift through a bounded 2D vector field. Spring chases a moving target one lookahead-step ahead in the flow. Wraps at canvas edges. Click to scatter.',
    topics: ['flowfield', 'spring chase', 'wrap bounds', 'radialImpulse'],
    load: () => import('./flowfield'),
  },
  {
    kind: 'internal',
    name: 'flowfield-gpu',
    title: 'flowfield-gpu — webgpu compute pipeline',
    blurb: 'Same flowfield, run on the GPU. Compute shader handles flow + spring + drag + integrate + wrap; render shader draws instanced quads from the same buffer. Default 80K particles, ceiling 500K. Requires WebGPU (Chrome / Edge / Firefox-nightly).',
    topics: ['WebGPU', 'compute shader', 'WGSL', 'instanced rendering'],
    load: () => import('./flowfieldGpu'),
  },
  {
    kind: 'internal',
    name: 'controls',
    title: 'controls — real DOM, rasterized transitions',
    blurb: 'The controls showcase rebuilt on Pattern A (DOM-rasterize). Every control is a real element — no mirror, no scene graph: checkbox / switch / radio / text field are plain DOM; button + slider are the headless factories. Activating a discrete control mutates state, then screen.dissolve(el) rasterizes it as painted and round-trips it through the shared transition core. The slider and text field stay live-dom — only their edges (double-click / commit) dissolve.',
    topics: ['Pattern A', 'createScreenController', 'headless components', 'rasterize vs live-dom'],
    load: () => import('./controls'),
  },
  {
    kind: 'internal',
    name: 'gpu-engine',
    title: 'gpu-engine — createWorld + createRendererAsync',
    blurb: "First end-to-end consumer of the engine's new GPU surface (P7b-II + P20). Both halves auto-select: createRendererAsync walks WebGPU → WebGL2 → Canvas2D; createWorld picks GPU compute when an adapter is available, falls back to CPU otherwise. Status pill shows resolved backends. Cursor pulls particles via point force.",
    topics: ['createWorld', 'createRendererAsync', 'WebGPU', 'WorldGPU', 'auto-fallback'],
    load: () => import('./gpuEngine'),
  },
  {
    kind: 'internal',
    name: 'p24-binding-parity',
    title: 'p24-binding-parity — IBinding bridge proof',
    blurb: "Same scene, two backends, side-by-side. scene.bindAll(world) writes per-leaf targets through world.binding() — direct mutation on CPU, queued sparse writes on GPU. The 'Disturb' button stomps velocities through the same IBinding contract; the spring pulls everything back. Visual identicality means the bridge holds.",
    topics: ['IBinding', 'scene.bindAll', 'WorldGPU', 'cross-backend parity'],
    load: () => import('./p24BindingParity'),
  },
  {
    kind: 'internal',
    name: 'six-showcase-ink',
    title: 'six-showcase · ink — black particles on white',
    blurb: "The fullscreen GPU showcase inverted to dark-on-light: black particles on a white surface with ink-on-light HUD chrome. The WebGPU renderer has no additive/bloom mode (its particle blend is source-over alpha), so dark-on-light just needs a white background + dark palette. Same cloud cycle, glitch bursts, and drag modes as six-showcase.",
    topics: ['WebGPU', 'dark-on-light', 'source-over blend', 'WorldGPU'],
    load: () => import('./sixShowcaseInk'),
  },
  {
    kind: 'internal',
    name: 'particle-mask',
    title: 'particle-mask — particles as a punch-through mask',
    blurb: "A live particle field used as a mask that erases a frosted (blurred) colorful backdrop, revealing crisp vivid color through every particle — the equivalent of CSS `mask-composite: exclude` with the static SVG window swapped for a flowing particle cloud. The backdrop is blurred ONCE into a bitmap, so each frame is just a frost blit + one destination-out drawImage; no per-frame backdrop-filter. 'invert' flips the punch (particles become the frosted spots); 'live blur' re-blurs every frame so you can feel the cost the pre-blur path avoids. FPS readout overlaid. Click to scatter.",
    topics: ['destination-out', 'mask compositing', 'pre-blur vs backdrop-filter', 'flowfield', 'perf probe'],
    load: () => import('./particleMask'),
  },
  {
    kind: 'external',
    name: 'moonshot',
    title: 'moonshot — multi-screen react over a persistent world',
    blurb: "Multi-screen React shell sitting above one persistent canvas. Horizon / Atlas / Signal screens swap behind the route while a single World keeps running underneath; cross-screen choreography is proven in the /moonshot/test route. The shell where component-level dissolves graduate into page-level transitions.",
    topics: ['React', 'multi-screen', 'persistent canvas', 'route-driven choreography'],
    href: '/moonshot',
  },
];

// Resolves a route slug to a mountable experiment. External entries are
// link-only — they're surfaced via the index but don't have a mount, so we
// narrow the return to InternalExperiment. A user who manually deep-links
// to /experiments/<external-name> hits the standard 404-ish branch.
export const findExperiment = (name: string): InternalExperiment | undefined => {
  const match = EXPERIMENTS.find((e) => e.name === name);
  return match?.kind === 'internal' ? match : undefined;
};
