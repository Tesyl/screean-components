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
    title: 'button — hover / press / click',
    blurb: 'A screean button() with hover + press + click handlers wired through pointerTracker. Particles recolor live as state changes.',
    topics: ['button', 'pointerTracker', 'routePointerEvent', 'recolor'],
    load: () => import('./button'),
  },
  {
    kind: 'internal',
    name: 'six-logo',
    title: 'six-logo — gltf as particle cloud',
    blurb: 'A 3D model fed to the 2D particle system as projected targets. Triangles are area-sampled into a point cloud; per-frame projection drives spring targets. Click to scatter.',
    topics: ['glTF', 'projection', 'radialImpulse', 'depth-cued alpha'],
    load: () => import('./sixLogo'),
  },
  {
    kind: 'internal',
    name: 'six-logo-ink',
    title: 'six-logo · ink — black particles on white',
    blurb: "The gltf particle cloud inverted to dark-on-light. Additive 'bloom' blending can only brighten, so black particles vanish on any surface; this runs source-over (pigment darkens) over a white backdrop, with a near-black charcoal palette and a lifted depth-alpha floor. Same projection, cycle, and scatter as six-logo. Click to scatter.",
    topics: ['source-over blend', 'dark-on-light', 'portal mode', 'depth-cued alpha'],
    load: () => import('./sixLogoInk'),
  },
  {
    kind: 'internal',
    name: 'six-logo-chalk',
    title: 'six-logo · chalk — white particles on black',
    blurb: "The gltf particle cloud as light-on-dark: crisp white particles over a black surface. Runs source-over (white pigment composites as opaque chalk marks, no glow halo) with a near-white palette and a low depth-alpha floor so far particles fade into the black. Same projection, cycle, and scatter as six-logo. Click to scatter.",
    topics: ['source-over blend', 'light-on-dark', 'portal mode', 'depth-cued alpha'],
    load: () => import('./sixLogoChalk'),
  },
  {
    kind: 'internal',
    name: 'qr-particles',
    title: 'qr-particles — a scannable QR code from particles',
    blurb: "A QR code rendered as a particle field. The matrix (qrcode-generator) maps each dark module to a screen cell; particles distribute round-robin across the dark cells and spring into place, re-forming after a scatter. Dark-on-light with a real quiet zone and shimmer off by default so a phone can actually decode it. Edit the payload to re-encode live.",
    topics: ['QR', 'spring targets', 'source-over blend', 'radialImpulse'],
    load: () => import('./qrParticles'),
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
    title: 'controls — every factory, controlled-input',
    blurb: 'The full v1 component library wired with the controlled-input pattern. textField creates a real <input> via the DOM mirror; checkbox / radio / image / button / card / label all live in one form. Stable IDs across rebuilds preserve cursor + element identity.',
    topics: ['component library', 'DOM mirror', 'controlled input', 'form'],
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
    name: 'visual-fallaway',
    title: 'visual.fallaway — depth axis: visual vs physical',
    blurb: "Two buttons, two depth flavors. Left runs popTo3D (physical: per-particle tz + z-spring). Right runs visual.fallAway (scale + fade only, no z). Both feel like receding; only one actually moves particles in z. The visual version works on every backend including future visionOS without a z field on the GPU struct.",
    topics: ['visual.fallAway', 'popTo3D', 'depth-axis split', 'recipes'],
    load: () => import('./visualFallAway'),
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
    name: 'six-showcase',
    title: 'six-showcase — fullscreen the6ixCollective demo',
    blurb: "Fullscreen presentation of the engine. Cycles between the 6ix logo, a sphere, and the the6ixCollective text — logo + sphere share a 2-axis rotation matrix, text faces the camera. Per-transition spring/drag presets vary the arrival feel; text mode flickers between fonts before settling. Every 10s a multi-band Perlin glitch burst kicks the field. Click to scatter. Esc to exit.",
    topics: ['fullscreen', 'WebGPU', 'WorldGPU', 'applyPerlinGlitch', 'cloud cycle'],
    load: () => import('./sixShowcase'),
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
    name: 'six-showcase-chalk',
    title: 'six-showcase · chalk — white particles on black',
    blurb: "The color-flipped twin of six-showcase-ink: near-white 'chalk' particles on a black surface with light-on-dark HUD chrome. The WebGPU renderer's particle blend is source-over alpha (no additive/bloom), so white-on-black just needs a black background + light palette. Same cloud cycle, glitch bursts, and drag modes as six-showcase.",
    topics: ['WebGPU', 'light-on-dark', 'source-over blend', 'WorldGPU'],
    load: () => import('./sixShowcaseChalk'),
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
