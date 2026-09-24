# Particle fidelity implementation handoff

Prepared on September 23, 2026, America/Chicago. Status: investigation complete; runtime implementation not started. This document is the implementation brief, not a claim that the proposed API or experiment already exists.

The user built `screean-components` on the sibling `screean` engine to support a particle-based component UI. They find its particle fidelity substantially below the `flow` screen in their personal `flowfield` repository. They want to understand whether earlier performance constraints or library architecture explain the gap, and whether the density and fine structure achieved by noise in `flow` can be brought to components. They recognize that particles must still form and reform components. Their latest request is an extremely detailed handoff with context, findings, a proposed solution, and validation procedures.

The immediate deliverable is this handoff. A future implementer should start with the controlled experiment described here. No production default, public API, or engine behavior has changed during this investigation.

## 1. Outcome and scope

Comparable density and coherent flow appear technically feasible within the DOM-first architecture. The investigation does not establish exact visual parity, a production particle budget, or a guaranteed frame rate. Those require a reference capture and browser measurements.

The strongest evidence is that the two applications currently do different work:

- Component factories typically request 1,200–6,000 particles and simulate them on the CPU.
- A request for 25,000 particles in flow's GPU path allocates 65,536 particles because the square texture dimensions round upward to powers of two.
- Flow uses spatially coherent, three-octave curl noise. The component controller has no spatial-noise force in its default stack.
- Component neighbor repulsion is expensive when particles start densely packed into a small silhouette. The existing GPU equivalent also has an all-pairs algorithm.
- Drawing, opacity, blending, sampling, and perspective differ. Count alone does not define fidelity.

The recommended change is an opt-in dense flow mode in the shared engine controller, demonstrated through the component site's experiment registry. Preserve existing behavior for consumers that do not opt in. Establish the appearance at moderate counts first, then implement GPU simulation and reform for higher counts.

Keep these goals separate:

| Goal | Initial scope | Evidence needed |
| --- | --- | --- |
| Fine, dense particle texture | Required | Matched-size captures with controlled point footprint and opacity |
| Coherent noise-driven motion | Required | Video showing continuous structures rather than unrelated jitter |
| Formation and reform onto component targets | Required | Target error and transition behavior tests |
| Native component behavior | Required | Keyboard, pointer, input, disposal, and concurrency tests |
| Exact recreation of flow's projected 3D volume | Deferred decision | User reference capture; 2D prototype may be insufficient |
| Faithful text/image colors throughout particle phase | Separate optional extension | Color-aware sampling and detail allocation tests |
| A universal 65k/250k production default | Not established | Device-specific browser benchmarks |

There is no need to replace real DOM controls with particle hit testing. The DOM remains responsible for input, focus, accessibility, and layout. Particles need target coordinates and transition state; they do not need to implement button semantics.

## 2. Repository context and source authority

The workspace is `/Users/r_1/Documents/Repos/tesyl/screean-components`.

| Repository | Local path | HEAD at handoff | Responsibility |
| --- | --- | --- | --- |
| Component library/site | `/Users/r_1/Documents/Repos/tesyl/screean-components` | `7fff248b86d411f9744e6104077415a4e7f9c3d4` | Headless components, React wrappers, experiment UI, integration tests |
| Engine | `/Users/r_1/Documents/Repos/tesyl/screean` | `58352f9a24c80501a69409aa55cad81612c94840` | Controller, physics, fields, samplers, renderers, GPU kernels |
| Visual reference | `/Users/r_1/Documents/Repos/personal/flowfield` | `7762dd61396032d916d357aaa57db359880ec03e` | Reference noise, GPU simulation, particle presentation |

These commits do not fully identify the reviewed state. Existing working-tree changes were present and were included in the review:

- Component repository: `CLAUDE.md`, `README.md`.
- Engine: `src/screen/constant.ts`, `controller.ts`, `index.ts`, `machine.test.ts`, `machine.ts`, and `types.ts`.
- Flowfield: untracked `.DS_Store`, `docs/.DS_Store`, and `docs/LIFTOFF.md` were present when preparing this handoff. They are unrelated to this work.

Do not reset or overwrite these files to reproduce the review. Record the state before starting implementation. The [baseline artifact](benchmarks/particle-fidelity-baseline.json) includes source hashes recorded at handoff for the benchmark dependencies and transition files. Those hashes identify the handoff source state; they are not a claim that raw frame samples were archived during the original run.

The component package declares `@tesyl/screean` as a peer dependency and uses `file:../screean` locally. The repository documentation says pnpm copies the built engine into `node_modules`; source edits are not automatically live. After an engine change, run `pnpm run sync:engine` in this repository and verify the installed exports. Do not debug a stale installed copy as though it were current source.

Read [CLAUDE.md](../CLAUDE.md), [component architecture](ARCHITECTURE-components.md), and the [rendering-pattern decision](DECISION-component-rendering-pattern.md). Runtime code is authoritative where comments or historical diagrams disagree with it. For example, the current controller supports concurrent transitions even though its header still describes chaining, and the architecture document contains an older phase diagram.

### Source map

| ID | Source | Inspect for |
| --- | --- | --- |
| S01 | [Engine controller](../../screean/src/screen/controller.ts) | `createScreenController`, `new World`, force stack, capture, spawn, concurrent slices, disposal |
| S02 | [Engine state machine](../../screean/src/screen/machine.ts) | `applyTransitionFrame`, phase timing, per-particle reform |
| S03 | [Transition constants](../../screean/src/screen/constant.ts) and [types](../../screean/src/screen/types.ts) | Exact defaults and current public contract |
| S04 | [Component counts](../src/components/headless/constant.ts), [button](../src/components/headless/button.ts), [element helpers](../src/components/headless/element.ts) | Count overrides and component lifecycle |
| S05 | [CPU forces](../../screean/src/core/forces.ts), [World](../../screean/src/core/World.ts), [spatial hash](../../screean/src/core/SpatialHash.ts) | Shimmer, Perlin, neighbor work, hash rebuild |
| S06 | [Bitmap sampler](../../screean/src/fields/bitmap.ts), [DOM rasterizer](../../screean/src/fields/bitmapFromElement.ts) | Mask sampling, DPR, alpha threshold |
| S07 | [WebGL renderer](../../screean/src/renderers/webgl/WebGLRenderer.ts), [sprite](../../screean/src/renderers/webgl/sprite.ts) | Point footprint, opacity, blending, buffer upload |
| S08 | [GPU world](../../screean/src/core/gpu/WorldGPU.ts), [kernels](../../screean/src/core/gpu/kernels.ts), [struct](../../screean/src/core/gpu/struct.ts) | GPU limitations, shared uniforms, layout, particle lifetime |
| S09 | [GPU binding](../../screean/src/core/gpu/GpuBinding.ts), [renderWorld](../../screean/src/core/render-world.ts) | Shadow writes, bulk writes, readback versus direct buffer rendering |
| S10 | [GPU renderer](../../screean/src/renderers/webgpu/WebGPURenderer.ts), [shaders](../../screean/src/renderers/webgpu/shaders.ts), [device lifecycle](../../screean/src/renderers/webgpu/lifecycle.ts) | Shared device, presentation, device loss |
| S11 | [Engine React binding](../../screean/react/index.tsx), [useHeadless](../src/react/useHeadless.ts), [component option types](../src/components/headless/types.ts) | `world()`, `useWorld`, async boot compatibility |
| S12 | [Local CPU flow](../site/lib/physics/flowfield.ts), [GPU flow experiment](../site/experiments/flowfieldGpu.ts) | Existing sine-based visualizations, not reference curl noise |
| S13 | [Experiment registry](../site/experiments/registry.ts), [lab mount](../site/lab/mount.ts) | Experiment entry and canvas-local coordinates |
| S14 | [Flow configuration](../../../personal/flowfield/src/config.ts), [initial UI state](../../../personal/flowfield/src/context/types.ts) | Default counts and noise settings |
| S15 | [Flow GPU compute](../../../personal/flowfield/src/flowfield/GPUParticleCompute.ts) | Texture allocation, GPU position/velocity storage |
| S16 | [Flow noise](../../../personal/flowfield/src/shaders/noise.glsl), [velocity shader](../../../personal/flowfield/src/shaders/particleVelocity.glsl) | Curl derivatives, octaves, domain warp, velocity relaxation |
| S17 | [Flow particle renderer](../../../personal/flowfield/src/flowfield/GPUParticleSystem.ts), [renderer](../../../personal/flowfield/src/rendering/Renderer.ts) | Point size, perspective, opacity normalization, theme blending |
| S18 | [Historical scale RFC](../../screean/docs/RFC-scale.md) | Original CPU-first decision and profiling gates |
| S19 | [Component package](../package.json), [engine package](../../screean/package.json), [engine Vite/test config](../../screean/vite.config.ts) | Actual build/test commands and execution environment |
| S20 | [Original review](particle-fidelity-review.md) | Shorter findings and original benchmark narrative |

## 3. Current behavior, step by step

A headless component creates a real DOM element and supplies a transition controller. The relevant current path is:

1. Its interaction handler changes state and repaints where required, then invokes `screen.dissolve` or `screen.swap` with component overrides.
2. The controller waits for fonts and rasterizes the source element using the `foreignObject` strategy. For a swap it captures the destination, temporarily making a pre-hidden target visible for capture and restoring its prior capture-time styles.
3. The rasterizer uses the device pixel ratio, then scales sampled coordinates back to CSS pixels. `originOf` supplies viewport or canvas-local positioning.
4. The bitmap field stores pixel indices whose alpha exceeds the cutoff. Sampling chooses among them uniformly, with replacement, then jitters within each pixel.
5. The controller creates a `Particle[]` slice, samples source and destination targets, and assigns palette colors. Particle spring weights are zero during free motion. Source and target arrays pair by index; current random sampling does not establish semantic pixel correspondence, despite a controller comment referring to bitmap pixel order.
6. A radial impulse starts the motion. The source DOM element becomes transparent and loses pointer events. The slice joins the controller's active transition set.
7. The controller ticks the shared CPU world while any transition is in a free-physics phase. The world rebuilds its spatial hash and applies forces. Each transition then advances through the shared state machine.
8. Reform directly integrates a damped spring for every particle in that slice. It retains roam velocity. A per-particle speed multiplier changes stiffness and damping together.
9. The destination DOM fades in, the transition resolves, that slice is retired, and the CPU world compacts dead particles.
10. Each frame, the renderer packs CPU particles into an instance buffer and draws them. A GPU renderer does not make the preceding simulation GPU-resident.

Current constants from S03:

| Setting | Value | Meaning |
| --- | ---: | --- |
| Controller particle count | 6,000 | Used when calls do not supply a count |
| Component counts | 1,200–6,000 | Toggle 1,200; checkbox/radio 1,500; label 2,000; slider 2,200; text field 2,600; button 3,000; heading 3,500; card/image 6,000 |
| Handoff phase | 16 ms | Initial dissolve handoff |
| Free phase | 700 ms | Noise/forces must become visible within this interval |
| Radial kick | 420 | Initial velocity impulse |
| Reform speed range | 0.6–1.4 | Derived from uniformly distributed settle times |
| Reform base spring | K = 160, C = 13 | Scaled as K × speed² and C × speed |
| Reform tail | 500 ms | Default varied-speed window uses 500 / 0.6, about 833 ms |
| DOM fade | 80 ms | Reveal after reform window |
| Simulation dt clamp | 0.05 s | Limits numerical instability after a slow frame |
| Alpha cutoff | 20/255 | Inclusion threshold for mask sampling |
| Particle size | 0.8 | WebGL quad width is 2 × size at zero depth |
| Trail alpha | 0.22 | Current configured trail erase amount |
| Renderer fade window | 0.35 | Renderer lifecycle fade configuration, separate from DOM fade |

The default cycle is roughly 1.63 seconds plus capture and scheduling. This is timing arithmetic, not a measured settle guarantee. A 700 ms transient cloud should not be compared to a flow simulation that has accumulated structure for several minutes without accounting for elapsed simulation time.

## 4. Findings and their implications

### F1. Particle density is deliberately conservative, but not a hard engine limit

S04 says counts were chosen to keep simultaneous component transitions affordable. There is no controller quality tier that automatically finds a higher budget. Counts are fixed per component type; doubling a card's dimensions does not increase its count.

The per-component count also overrides the provider. Merely changing `ScreenProvider particleCount` can therefore appear ineffective for wrappers using the headless factories. Some story examples specify still lower counts. Instrument requested and actual count at the transition boundary before judging a visual change.

Flow's requested count is not necessarily its actual count. Its square texture side is `2 ^ ceil(log2(ceil(sqrt(requestedCount))))`, and the actual population is side². Thus 25,000 becomes 65,536 and 250,000 becomes 262,144. Record actual count. Saved settings may differ from code defaults; no reference session was captured in the review.

### F2. The component motion is not the flowfield motion

The current component shimmer is a time-varying sine/cosine acceleration whose phase derives from the particle's color. Equal colors give equal phase, regardless of position. It does not produce spatially correlated eddies.

S16 computes curl from three independent scalar noise fields using finite differences. The scalar noise uses three spatial coordinates and a fourth time coordinate. Three octaves add detail at different frequencies. Optional domain warping changes the coordinates before curl evaluation. The reference shader then combines orbital, pointer, and other configured influences and relaxes velocity toward the resulting flow velocity.

The current CPU and GPU flowfield experiments in this repository use stacked sine/cosine terms. The GPU experiment has 80,000 particles by default, but is self-contained and does not validate the component controller or reference noise.

Inference: coherent field structure is a major contributor to the reported fidelity gap. Its exact contribution relative to perspective, population, and presentation remains unmeasured. A 2D curl field can test this inference; it cannot establish exact 3D equivalence.

### F3. Neighbor repulsion makes dense component starts expensive

S05 performs short-range neighbor queries through a spatial hash. Many particles in a small silhouette still have many neighbors. At fixed area and radius, increasing count increases both particles and neighbors per particle. The initial dense silhouette is particularly costly.

S08's GPU neighbor force has no spatial hash and loops over every particle for every particle. At 65,536 particles that means 4,294,967,296 inner-loop iterations before branch effects. This is an algorithmic count, not a measured GPU duration. Do not accept the kernel's optimistic performance comment as benchmark evidence.

A field-only dense mode should omit particle-to-particle repulsion. If separation later proves visually necessary, evaluate a bounded neighbor scheme or coarse density-gradient force as a separate feature. Do not let that block the first comparison.

### F4. GPU engine support exists, but the controller is CPU-specific

S01 constructs `World` directly and owns JavaScript particle references. S02 performs reform through direct mutation. `ScreenController.world()` and React `useWorld()` expose the CPU world. Replacing `World` with `WorldGPU` would break behavior and types, and an adapter that reads every position back each frame would defeat much of the benefit.

Reuse the existing GPU engine and direct-buffer renderer. Extend the shared controller so phase decisions remain in one place and the CPU/GPU implementations execute equivalent particle operations.

### F5. Current Perlin support is not a ready-made curl implementation

The CPU `perlinForce` exists internally but is not exported from the public engine barrel. The component stack does not install it. Setting its strength in a generic constants table alone does not make the controller evaluate the force.

The GPU Perlin force samples independent scalar components, not curl. Its seed comes from the shared `seed ^ frameCounter` uniform, so the spatial field changes each tick. It adds its force directly to velocity without multiplying by dt. The CPU path returns acceleration and the integrator multiplies by dt.

Before reusing it, add tests that establish intended temporal continuity and units. Do not globally change the shared seed to fix Perlin if other kernels rely on frame-varying randomness. Introduce a stable field seed separately. Do not silently change existing Perlin semantics for unrelated consumers; correct them with an explicit compatibility decision or introduce a new curl mode with documented units.

### F6. Particle presentation and source detail differ

The component WebGL path uses Gaussian sprites and defaults to additive blending. Flow uses a sharper circular profile, count-dependent opacity, depth-dependent size, and theme-dependent blending. WebGPU currently uses a quadratic procedural profile and source-over blending, so swapping renderers alone also changes appearance. Choose the profile and blend intentionally for the dense mode.

`particleSize = 0.8` in the component renderer is a radius-like CSS unit producing a 1.6 CSS-pixel quad. Flow's default `uPointSize = 4` is a framebuffer-pixel size before depth attenuation. At DPR 2 these values are closer than the raw settings suggest. Compare measured point footprints and use one explicit unit in new controls.

DPR is already honored in the component rasterizer and the WebGL renderer by default. More backing pixels do not add simulated particles or recover omitted image information.

The mask sampler discards RGB and treats all included pixels equally. The controller assigns palette colors. An opaque button's label does not get special sampling priority over its background. More particles can improve coverage but cannot recover discarded colors or create semantic letter detail. Keep color-preserving sampling separate from the initial flow experiment.

### F7. Existing lifecycle and test assumptions need explicit regression coverage

Current code ticks the whole world when any slice is free, then applies reform to returning slices. Reform integrates from the current position rather than restoring a saved one. Therefore comments claiming unrelated free slices cannot affect reform should not be treated as proof of isolation. Include mixed-phase concurrency tests in the new implementation.

The current controller's `dispose` resolves transitions and clears particles, but does not visibly call the pointer sensor's disposer, destroy the renderer, or restore active elements' styles. Treat cleanup and DOM restoration as validation requirements when extending the controller, not as guarantees already established by the review.

Several GPU tests skip when `navigator.gpu` is absent. The generic parity runner still throws in `runGpu`, and the visual snapshot tests exercise pixel-diff math. A green default Node test run does not prove shader execution or rendered parity. Section 10 specifies the additional work.

## 5. Benchmark evidence and reproduction

The original investigation ran CPU physics on an Apple M4 Pro, arm64 macOS, Node v25.1.0. Engine TypeScript was bundled directly from the working tree with the local esbuild CLI. It did not use the installed package distribution.

Method:

1. Use `mulberry32(12345)` for each fresh population. Spawn consumes its normal random values before assigning uniform positions, preserving the original RNG sequence.
2. Set world size to 1280 × 800 and start particles in either a 160 × 48 or 640 × 360 rectangle, offset by 100 CSS pixels in both axes.
3. Use the `soft` force preset, no active pointer, spring weight zero, and radial kick 420 from the rectangle center.
4. Compare the default stack, the same stack with repulsion strength zero, and the latter plus three-octave CPU Perlin at strength 40 and speed 0.1. Perlin frequency remains its implementation default.
5. Warm up each mode with 6,000 particles for 50 steps.
6. For each area, count, and mode, run three fresh populations for 43 steps at fixed dt 1/60.
7. Report the median of three first steps. For subsequent steps, combine 126 samples and compute median/p95 with index `min(length - 1, floor(length × percentile))` after sorting.

| Area, CSS px | Count | Default first, ms | Default subsequent p95, ms | No repulsion first, ms | No repulsion subsequent p95, ms | No repulsion + Perlin subsequent p95, ms |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 160 × 48 | 6,000 | 10.99 | 10.09 | 0.87 | 1.33 | 2.37 |
| 160 × 48 | 25,000 | 163.78 | 112.93 | 3.51 | 4.00 | 8.75 |
| 160 × 48 | 65,536 | 1,258.08 | 614.07 | 9.52 | 10.21 | 22.74 |
| 640 × 360 | 6,000 | 3.77 | 4.24 | 1.03 | 1.63 | 2.65 |
| 640 × 360 | 25,000 | 21.32 | 22.18 | 4.10 | 4.59 | 9.11 |
| 640 × 360 | 65,536 | 93.75 | 94.46 | 10.89 | 11.02 | 23.44 |

The [JSON baseline](benchmarks/particle-fidelity-baseline.json) preserves all 18 original case summaries, including subsequent medians. It is transcribed from captured tool output. Individual frame samples from that run were not retained. Do not invent confidence intervals or distributions from these summaries.

The [reproduction script](benchmarks/particle-fidelity.mjs) preserves the original sampling, warmup, order, and statistics, while bundling into a unique temporary directory and deleting those bundles on exit. It reads engine sources without changing either repository. Dependencies must already be installed.

From `screean-components`:

```sh
node docs/benchmarks/particle-fidelity.mjs --smoke
node docs/benchmarks/particle-fidelity.mjs > /tmp/screean-fidelity-full.jsonl
```

The full run can be slow because it deliberately includes the pathological dense-repulsion case. `--smoke` uses one count, one area, one trial, and eight measured steps. It validates the runner only and must not be compared numerically to the full run's p95. The handoff preparation successfully ran this smoke command; it did not rerun the entire original experiment.

Limits of the evidence:

- Timing excludes DOM capture, mask sampling, spawn setup, reform, rendering, instance upload, and GPU work.
- Geometry is a filled synthetic rectangle, not a screenshot of a real control.
- The first-step comparison starts with identical positions and velocities. Later trajectories differ because removing repulsion changes motion.
- Fixed simulated time does not model the controller's wall-clock phase timing under slow frames. The benchmark always executes the same number of steps.
- Disabling repulsion still pays for the CPU world's hash rebuild. A later optimization could remove that work when no force needs it; it is not included in these results.
- The Perlin diagnostic is cheaper/different work than the reference 3D curl shader. It cannot predict the cost of a literal port.
- Node and browser engines have different workloads and scheduling. These numbers explain a bottleneck, not production FPS.

## 6. Proposed architecture

Everything in this section is proposed. Resolve final names during implementation, keeping the stated behavior and compatibility requirements.

### 6.1 Preserve the shared controller

Do not implement a separate dissolve state machine inside the experiment. Extend `screean/src/screen` and let the experiment supply configuration, fixtures, and telemetry.

The intended division is:

```text
Real DOM component
  capture source/target once per transition
        |
        v
Shared transition scheduler
  phase/time, DOM handoff, completion, concurrent slice ownership
        |
        +-- CPU executor: particle arrays + field sampling + reform
        |
        +-- GPU executor: stable buffer ranges + field/reform kernels
                    |
                    v
             direct-buffer renderer
```

Extract phase decisions from per-particle execution so CPU and GPU share the same timing rules. Keep the existing `applyTransitionFrame` entry compatible through a CPU adapter if consumers import it. Do not leave two independently evolving definitions of when a transition starts, reforms, reveals, or resolves.

Target positions must remain component targets throughout free motion. Do not reuse `tx/ty` as moving flow lookahead targets, as the separate CPU flow experiment does. The reform needs those original targets intact.

### 6.2 Configuration and compatibility

Start with explicit opt-in configuration on the engine controller. Keep current defaults when it is absent. Proposed concepts:

| Concept | Proposed representation/meaning |
| --- | --- |
| Motion | Discriminated choice of existing behavior or coherent curl flow |
| Count policy | Fixed count or density-derived count, with per-transition and global limits |
| Presentation | Dot diameter in CSS pixels, opacity multiplier, profile, blend mode, trail persistence |
| Field | Stable seed, spatial scale in CSS pixels, temporal speed, strength with explicit units, octave count; optional warp later |
| Execution | CPU, forced GPU, or auto, with requested and actual backend available in diagnostics |
| Compatibility | Existing synchronous controller remains CPU-compatible; an additive async factory can initialize GPU |

Use discriminated unions for mutually exclusive modes. Parse numeric ranges once at controller/experiment boundaries, including finite values, nonnegative density, positive scale, valid octave counts, and supported enum values. Internal hot loops should consume validated values. Do not scatter repeated checks through every particle update.

Preserve the existing `particleCount` option as an explicit request. Proposed precedence for the opt-in mode:

1. Explicit per-transition/component count supplied by the caller.
2. Explicit count or density policy selected on the controller.
3. Component-type fallback for legacy mode, or the documented dense-mode fallback.
4. Budget allocation limits the actual granted count in either case.

The factory must preserve whether a count was explicit. Its internally supplied default must not masquerade as an explicit caller override. One implementation is a transition request with a separate component fallback hint, while `particleCount` remains the caller's explicit override. Another is a controller-owned count resolver. Select one contract and test it across every factory. Avoid changing existing implicit legacy counts as a side effect.

A GPU controller cannot truthfully satisfy `world(): World`. Preserve the old synchronous controller and its CPU return type. Introduce a common transition interface derived from the operations components actually use, initially `dissolve` and `swap`, and allow headless factories to depend on that narrower interface. Expose GPU-specific capabilities through a discriminated backend handle or separate diagnostic API. Never cast `WorldGPU` into `World` or return a stale CPU shadow as a live world.

The engine React binding and `useHeadless` currently name the concrete controller. A first experiment can be vanilla TypeScript with an explicitly awaited controller. React integration follows once the engine contract is stable. Async provider setup must handle unmount before initialization completes, Strict Mode setup/cleanup, and rapid option changes. Keep frame updates outside React state; publish telemetry at a throttled cadence. Preserve the existing `useWorld()` semantics for existing users.

### 6.3 Count allocation and sampling

Use CSS-space eligible area for density, not backing texture pixel count. For a DPR-scaled mask, eligible area can begin as the number of included pixels divided by DPR². If a later sampler weights alpha, define the change explicitly and compare boundary coverage.

A starting policy is `requested = ceil(eligibleCssArea × particlesPerCssPixelSquared)` with a configured per-transition maximum. Keep source/destination count equal during swaps. Use the larger eligible area as a conservative starting rule so a small-to-large morph does not inherit a tiny population; measure whether this oversaturates the smaller shape. An empty mask grants zero particles and completes through a defined DOM-only path.

Allocate against a controller-wide active-particle budget. Track pending capture reservations as well as active transitions so two simultaneous captures cannot each claim all remaining capacity. Keep existing slices stable; grant new transitions up to the remaining budget. When none remains, perform the semantic state change and DOM handoff without particles. Do not queue interactive behavior behind a decorative effect, silently exceed the budget, or reclaim particles from another live transition.

Record requested/granted counts and the reason for reduction. Treat fixed counts as requests subject to documented resource limits in the new opt-in mode. Establish numeric limits from measurements; 65,536 is an experiment target, not a universal entitlement.

Retain uniform jittered sampling for the first experiment. If coverage quality becomes limiting, add a seeded stratified sampler with an explicit fallback for thin shapes. Color-aware or edge-weighted sampling is a later, separately tested extension. Upload sampled targets at capture/resize boundaries, not on every frame.

### 6.4 Coherent field motion

For the first CPU experiment, define a 2D curl field from a smooth scalar potential: `flow = (dPotential/dy, -dPotential/dx)`. Use a stable seed and continuous time input. The potential can use a spatial noise function with time as another coordinate; specify the chosen algorithm and derivative approximation so the GPU version can implement the same definition.

Evaluate a shared grid and interpolate at particle positions rather than evaluating many noise derivatives for every CPU particle. Tune grid spacing relative to the shortest wavelength introduced by the highest octave. A coarse grid can erase exactly the detail being sought. Include direct evaluation on a small population as the quality reference for interpolation error and visible cell boundaries.

Use a bounded field grid over the canvas plus an explicit margin. Define behavior outside the grid, such as continued direct sampling or a smooth edge treatment. Do not inherit the ambient experiment's wraparound behavior without deciding whether component particles should disappear on one edge and reappear on another. That would be a separate visual choice.

For GPU motion, evaluate the field directly per particle or sample a GPU-generated grid after measuring both. Treat these as alternatives with separate quality/cost evidence. Keep a stable noise seed distinct from frame-varying random effects.

Specify whether the field means acceleration or desired velocity. Recommended for matching flow is desired velocity with exponential relaxation: `v += (flowVelocity - v) × (1 - exp(-response × dt))`, followed by position integration. This resembles the reference shader's velocity relaxation more closely than adding an unscaled force every frame. It changes the role of drag; avoid applying two independent damping models by accident.

Keep the existing radial kick independently configurable. Strong bursts can dominate a short free window and hide the noise. Compare zero, reduced, and legacy kick at equal particle counts. Test a longer free phase only as a separate ablation, then return to production timing to assess whether the effect is perceptible in actual interaction.

During reform, use an explicit slice-level mode to stop or smoothly reduce field motion. Preserve the existing per-particle reform speed schedule and target coordinates. A fade should not allow residual flow or pointer forces to prevent final settling.

A 2D solution is the first feasibility test. If the reference's depth/projection is essential, evaluate a separate 2.5D/3D design after viewing the comparison. Current GPU particles have no independent z/vz/tz fields. Adding them affects layout, kernels, renderer projection, memory, and tests; anchor projection alone does not create a moving 3D cloud.

### 6.5 GPU state, slices, and device ownership

Acquire one GPU device for both world and renderer. Do not independently call two factories that each acquire a device and then try to share buffers. Use explicit device injection through existing constructors or extend the factory API to accept a shared acquired context.

Represent active transitions as stable ranges or indirection handles in a shared pool. Keep phase, timestamps, source/destination DOM references, and completion callbacks on CPU. Keep positions, velocities, targets, and per-particle reform multipliers on GPU. A compact transition descriptor buffer can supply range and phase settings.

Prefer an auxiliary reform-speed/ownership buffer over casually changing the shared 32-byte particle struct. If the struct changes, update its authoritative layout, all packers/shaders, direct-buffer renderer, and layout tests together. At 65,536 particles the existing main struct alone is 2 MiB; shadows, auxiliary data, capacity headroom, and render targets add to that. Measure total allocation rather than presenting 2 MiB as the complete memory cost.

Each live particle should advance once per simulation step according to its slice's phase. Do not run free integration and reform integration on the same particle. A newly triggered free slice must not reactivate noise/pointer forces for another slice that is reforming.

Implement slice-scoped spawn, target upload, impulse, reform, retirement, and reuse. The existing GPU impulse operates over its configured population; it needs slice selection before use for independent components. Preserve the existing distinction between the initial radial impulse and the controller's pointer `thwack` formula if legacy behavior is retained.

The GPU shadow is not authoritative after simulation advances. The existing binding code already documents stale-shadow overwrite risks from coalesced writes. Do not overwrite a wide buffer region from stale CPU state when changing one slice's target/color/life. Use field-specific kernels or exact field writes that preserve current GPU positions and velocities. Test allocation, retirement, and a new spawn while other particles are moving.

Keep buffers stable while transitions are active when practical. If growth is needed, copy current GPU state to the new buffer and rebuild every affected bind group. Do not rebuild from an unsynchronized shadow. Free-list reuse must not expose a retired slice's lifetime, color, or reform settings to a new transition. Generation identifiers can reject stale async capture completions.

Render from the live particle buffer without `syncToShadow` in the frame loop. Readback is allowed for explicit tests and diagnostics outside performance runs. Instrument it so accidental readback is detectable rather than inferred from low FPS.

### 6.6 Presentation and DOM handoff

Expose diameter in CSS pixels for the new mode and convert once to each renderer's convention. Preserve the old `particleSize` semantics if that option remains public. Track DPR separately.

Choose an explicit alpha profile. Matching Gaussian WebGL sprites to quadratic WebGPU sprites is not automatic. Implement equivalent profiles or document/measure an intentional difference. Use premultiplied color consistently with the chosen blend factors.

Start density comparisons with trails disabled through a verified full clear. Setting `trailAlpha = 1` is the intended existing full-erase control, but verify actual framebuffer behavior in the selected backend. The current WebGL implementation blends into the drawing buffer without an explicit persistent offscreen history target or requested `preserveDrawingBuffer`; do not assume the configured trail amount proves reliable inter-frame history. If trails are required, validate them separately and use explicit history buffers where necessary.

Use normal alpha as an explicit option for ink on light backgrounds and additive as an explicit option for light on dark. Do not generalize opaque-background blending rules to every transparent portal composition. Capture the canvas over the actual DOM background and verify alpha as well as RGB.

Opacity should be calibrated against projected density and footprint. Flow's `sqrt(referenceCount / count)` is a useful comparison curve, not a universal formula for components of different areas. Freeze opacity settings before performance comparisons, because larger dots and more overdraw change GPU cost. Avoid claiming that darker or blurrier particles are inherently higher resolution.

Keep source DOM visible until capture and particle initialization are ready. Only then hand it to the particle layer. On capture/init failure, restore a usable DOM state and settle the operation. On dispose or device loss, retire active transitions, restore affected inline styles according to recorded originals, resolve promises once, and release owned observers/listeners/resources. Do not destroy a borrowed shared GPU device.

A GPU-to-WebGL fallback may require replacing the canvas because a canvas that already has one context type cannot be assumed to accept another. Decide this before building provider fallback. The safest mid-transition loss behavior is a clean DOM completion, followed by a newly initialized supported backend for later transitions; attempting to reconstruct lost live particles is unnecessary for this feature.

## 7. Implementation sequence and reviewable milestones

Use these as separate changes where practical. Each milestone has a concrete exit condition. This handoff does not authorize publishing packages or changing the reference repository's saved settings.

| Milestone | Work and likely files | Exit condition |
| --- | --- | --- |
| M0: reference and baseline | Capture flow configuration and video; inventory installed/source versions; run baseline commands; use existing perf helpers where suitable | Reference is reproducible; actual population, viewport, DPR, timing, and hardware are recorded |
| M1: experiment and presentation | Add `site/experiments/particleFidelity.ts` and registry entry; extend shared controller render options in engine types/controller; expose requested/actual counts | Legacy behavior is unchanged; real components run through the shared controller; count/size/opacity can be varied independently |
| M2: coherent CPU field | Add pure field sampling and an optional grid implementation under engine physics/core; route by slice phase; preserve targets | Moderate-count experiment shows coherent motion and deterministic replay; field and mixed-phase tests pass |
| M3: GPU transition execution | Add backend executor, slice-aware kernels and pool management under `src/screen`/`src/core/gpu`; shared device and direct rendering | Forced-GPU experiment runs with real shader tests, no per-frame readback, independent concurrent transitions, and safe disposal |
| M4: density policy and wrappers | Add eligible-area accounting/count resolver; update headless requests without losing explicit-count precedence; narrow controller types; integrate async React provider carefully | Counts respond to area and shared budget; existing wrappers/defaults remain compatible; async lifecycle tests pass |
| M5: quality tuning and acceptance | Run ablations and browser/device matrix; select profile/noise/count settings; record configuration with captures | Visual target and performance tier are supported by evidence; unsupported targets have an explicit fallback |
| M6: package verification and documentation | Sync built engine, build both packages, test isolated package consumption, document options/limitations | New APIs resolve through public entry points; no sibling-source imports or stale dist artifacts in consumers |

M1 and M2 must not grow into a site-owned particle engine. Experimental UI belongs in `screean-components`; reusable field, presentation, and transition capabilities belong in `screean`.

Recommended experiment route: `/experiments/particle-fidelity`. This route and filename are proposed and do not exist yet. Use the existing internal experiment `mount(root) -> teardown` contract and lazy loading. Use a canvas-local `originOf`, as the lab does, when placing multiple fixtures on one page.

The first experiment should provide:

- A legacy comparison and a dense-flow comparison for the same DOM fixture. Freeze the fixture's dimensions, style, and content across runs.
- Fixed actual-count choices of 6,000, 16,384, 32,768, and 65,536; also retain each component's legacy default. Include the original 25,000 benchmark point in performance diagnostics if useful.
- Independent motion selection, noise seed/scale/speed/strength/octaves, repulsion toggle, kick, free-phase duration, point diameter, opacity, profile, blending, and trails.
- A deterministic reset/replay and capture control. Seed every stochastic input, including bitmap sampling, spawn, palette choice, and reform schedule. Seeding only the noise is insufficient.
- Requested/actual backend, requested/granted/active count, DPR, viewport, phase, and dropped-frame diagnostics. Keep these developer controls out of production component flows.
- Button, text-only label, opaque card, image, and concurrent-transition scenarios. Reuse real headless factories rather than hand-drawn stand-ins.
- A saved serializable configuration and result export. Include a version so future option changes can be interpreted correctly.

Async API naming recommendation: preserve `createScreenController` as the existing synchronous CPU-compatible entry and add an explicitly async factory such as `createScreenControllerAsync` for backend selection. This name is a proposal, not an existing export. Both must use the same scheduler and DOM handoff logic. Start with explicit controller injection into the experiment before broadening the React API.

## 8. Reference capture and visual comparison procedure

Do this before tuning a new preset around memory of the effect.

1. Start the personal flowfield app using its current package scripts and capture the actual `flow`/flowfield view. Verify that the selected mode is GPU and record the actual count exposed by its compute system. Do not assume a display label reports allocated count.
2. Export or record the active settings without overwriting saved preferences: particle count, theme, point size, user alpha, noise scale/strength, octaves/warp, orbital behavior, camera, bloom/postprocessing, and audio-driven settings. Record app commit and dirty state.
3. Capture the user's preferred appearance first, including its enabled effects. Then make a separate controlled reference with audio modulation and pointer input inactive. Do not substitute the controlled reference for the user's aesthetic target.
4. Record CSS viewport, backing-canvas dimensions, DPR, browser/version, display refresh, zoom, device, and time since reset. Capture short video as well as stills. A still cannot establish coherent motion or flicker.
5. For the component experiment, use the same output dimensions and backgrounds where meaningful. Compare projected cloud area and particle footprint, not total population alone. A full-screen 65k cloud and a 65k button have radically different local density.
6. Use fixtures at known CSS sizes, including a 160 × 48 button and a 640 × 360 card to connect browser results to the synthetic benchmark. Also test natural-size text and irregular transparent images.
7. Capture named stages: DOM before activation; first particle frame; 100, 350, and 650 ms into the free phase; early/mid/late reform; first fully restored DOM frame. Derive timestamps from actual phase entry so capture latency does not shift comparisons.
8. Add a diagnostic persistent-flow run or extended free window to evaluate mature field structure. Keep it labeled separately from the default 700 ms interaction window.
9. Compare one changed variable at a time using the ablation table below. Reset the seed, initial population, and timing for every comparison.
10. Save settings beside images/videos and ask for visual selection only when concrete variants exist. Record the selected configuration as the candidate preset, with remaining differences from the reference.

| Ablation | Hold fixed | Change | What it resolves |
| --- | --- | --- | --- |
| Population | Motion, point footprint, exposure | Count only | Whether sparsity dominates |
| Motion | Count, appearance, timing | Legacy shimmer versus curl | Whether coherent structure dominates |
| Repulsion | Initial population and other forces | On versus off | Visual and performance contribution of separation |
| Presentation | Particle state/seed | Profile, opacity, blend separately | Whether softness/saturation hides detail |
| Duration | Motion and initial state | 700 ms versus extended free phase | Whether the effect needs time to develop |
| Field resolution | Count and output profile | CPU grid spacing or direct sampling | Whether interpolation erases fine structures |
| Dimension | Matched projected density | 2D versus later depth prototype | Whether missing volume is essential |
| Domain warp | Base curl and appearance | Warp off/on | Whether base curl already reaches the target |

Use density heatmaps, covered-pixel fraction, luminance distribution, and spatial detail measurements as diagnostics if they help. They do not replace visual selection: a uniformly opaque blob can score high coverage while losing the desired particle texture. Do not impose exact pixel equality between different algorithms or long chaotic trajectories.

## 9. Automated validation plan

Add focused tests for the new contracts rather than duplicating implementation loops in tests. Reuse real field/controller logic. Mock only inaccessible platform boundaries. Candidate test file names below are proposed; existing tests are linked where applicable.

### 9.1 Pure policy, field, and sampling tests

| ID | Case | Required assertion |
| --- | --- | --- |
| P01 | Explicit count versus factory fallback versus controller density | Caller intent wins; internal legacy fallback does not disable selected controller policy |
| P02 | Same CSS mask at DPR 1 and 2 | Density policy grants the same count within rounding; coordinates cover the same CSS region |
| P03 | Empty/fully transparent mask | No center-piled fallback population; operation completes with usable DOM |
| P04 | Two captures resolve concurrently | Reservations and active grants never exceed the shared budget |
| P05 | Active slice plus newly denied transition | Existing slice/count stays stable; denied effect does not delay semantic interaction |
| P06 | Invalid configuration | Boundary rejects nonfinite counts/scales, impossible limits, and unsupported modes before allocating buffers |
| F01 | Identical seed, position, time | Identical CPU field samples; deterministic seeded spawn/palette/reform replay |
| F02 | Same position at nearby times | Smooth bounded change according to the defined field, not frame-index reseeding |
| F03 | Frame partitioning | Equal elapsed time at 30/60/120 steps converges within documented integrator tolerance; no frame-rate-proportional impulse growth |
| F04 | Grid versus direct evaluation | Error is measured against the same potential; no discontinuity at cell boundaries; finer grid reduces error |
| F05 | Scale and octave changes | Shortest wavelengths are represented at the selected grid spacing or reported as reduced-quality configuration |
| F06 | Noise off/strength zero | Legacy or documented zero-field behavior is preserved; no hidden noise work on the hot path |
| F07 | Boundary/outside-grid positions | Finite, documented motion with no accidental wrap or abrupt index failures |
| S01 | Seeded mask sampling | All targets are valid under sampler rules and repeat for identical inputs |
| S02 | Thin glyph and transparent-edge fixtures | Coverage and bounds remain valid at both DPRs; empty strokes are detected |

For F03, a small force-only fixture with analytic relaxation behavior is more useful than demanding that two long turbulent runs land at identical coordinates. Record absolute tolerances as well as relative ones, since values near zero make relative error unstable.

Extend [bitmap tests](../../screean/src/fields/bitmap.test.ts), [rasterizer tests](../../screean/src/fields/bitmapFromElement.test.ts), and [force tests](../../screean/src/core/forces.test.ts), and add dedicated policy/curl tests as needed. Do not export an internal helper solely to make a redundant test easy; test the public or module-level contract that actually matters.

### 9.2 Controller and lifecycle tests

Extend [state machine tests](../../screean/src/screen/machine.test.ts) and add a controller integration suite, since testing phase arithmetic alone cannot prove DOM ownership or resource cleanup.

| ID | Case | Required assertion |
| --- | --- | --- |
| C01 | Self dissolve and source-to-destination swap | Correct target set, expected phase order, completion once, correct visible final element |
| C02 | Slow capture/fonts/image decode | DOM stays usable until initialized particle output is ready; no blank handoff |
| C03 | Capture or shader-init failure | Recorded styles restored; no leaked reservation; promise settles according to documented failure policy |
| C04 | Slice A reforming while B begins free motion | B's noise, impulse, pointer, and timing do not perturb A's reform |
| C05 | Slice A finishes while B is active | Only A retires; B's indices/state remain valid after pool changes |
| C06 | Component removed during capture or motion | Stale completion cannot resurrect it, write into a replacement slice, or hold a promise forever |
| C07 | Controller disposed in every phase | All active promises settle once; observers, sensor listeners, renderer resources, and owned loop are released |
| C08 | Existing inline opacity/pointer-events values | Completion/failure restores the intended prior values rather than blindly setting every element to auto/1 |
| C09 | Pointer movement or thwack during reform | Behavior is explicitly defined and isolated; reform still reaches its targets |
| C10 | Tab hidden then resumed | No giant dt, NaN, phase deadlock, or permanently invisible control |
| C11 | Resize, scroll, and canvas-local embedding | Samples and renderer share coordinates; ongoing transitions follow a documented resize policy |
| C12 | Reduced-motion preference | Native interaction completes with the chosen reduced-motion behavior and no unnecessary dense simulation |

Current component guards mainly bracket a busy flag, and some comments still mention serialized transitions. Verify repeated programmatic calls to the same handle as well as event-handler gating. Define same-element re-entry separately from concurrency across different elements. Do not fix cross-element concurrency by globally blocking input.

### 9.3 Real GPU correctness tests

Real GPU assertions must run against a real browser/device and report their executed count. Mocks are useful for buffer orchestration but do not compile WGSL or validate driver behavior.

| ID | Case | Required assertion |
| --- | --- | --- |
| G01 | Field/reform shaders compile | No uncaptured GPU validation errors; compilation diagnostics inspected |
| G02 | Same CPU/GPU field inputs | Small deterministic fixtures agree within declared absolute/relative tolerances |
| G03 | dt and seed invariants | Stable field seed across ticks; correct time scaling at multiple dt values |
| G04 | Per-slice phases | A particle receives only the update for its slice's phase, once per step |
| G05 | Subrange target/color/life/impulse write | Unaffected moving particles keep current GPU state; stale shadow cannot overwrite them |
| G06 | Pool growth and slot reuse | GPU state survives buffer changes; bind groups use the new buffer; retired slots cannot affect replacements |
| G07 | Shared device | World and renderer use the same device; no cross-device buffer binding |
| G08 | Dense rendering | Direct-buffer path is exercised; production frame loop performs zero `syncToShadow` calls |
| G09 | Loss/disposal during capture/free/reform | DOM restored, promises settled, resources released, subsequent fallback/init follows policy |
| G10 | Renderer profiles and alpha | Direct-buffer and CPU-upload rendering honor the selected footprint/profile/blend and portal transparency |

Readback at the end of a test is appropriate for inspecting state; do not reuse that readback strategy in production frames. Existing real-device examples are [drag parity](../../screean/tests/parity/m4-drag.test.ts) and [cross-backend tests](../../screean/tests/parity/m9-cross-backend.test.ts). The generic [world runner](../../screean/tests/parity/world-runner.ts) still has a GPU stub, so either implement it deliberately or use working concrete fixtures.

### 9.4 Component, React, and package regressions

Run and extend [headless tests](../src/components/headless/headless.test.ts), [factory tests](../src/components/headless/factories.test.ts), and [React tests](../src/react/react.test.tsx) for:

- All nine wrappers continue accepting existing props and explicit controllers.
- Legacy counts remain unchanged unless the new mode is selected.
- A button activation invokes its business handler once, independently of particle completion.
- Checked-state controls paint their new state before capture.
- Slider dragging and text-field typing/IME stay live DOM; only their documented transition edges rasterize.
- Multiple components can transition together without globally disabling the rest of the UI.
- Async provider initialization can resolve after unmount without creating a live loop or exposing a disposed controller.
- Strict Mode setup/cleanup does not duplicate listeners, devices, canvases, or controllers.
- Existing `useWorld()` consumers still receive the documented CPU contract; GPU access is explicit.
- Public declarations and package subpath exports include intended new APIs, without requiring source-relative imports.

## 10. Browser execution and performance validation

### 10.1 Existing test infrastructure limitations

The engine test configuration in S19 uses the Node environment. [GPU setup](../../screean/tests/gpu/setup.ts) detects `navigator.gpu` and allows tests to skip when absent. The names `test:gpu` and `test:parity` select files; they do not by themselves establish a hardware browser run.

The [snapshot helper](../../screean/tests/visual/snapshot.ts) compares pixel arrays, and its current test file validates that math. It is not a complete screenshot-regression suite. The [rAF helper](../../screean/tests/perf/raf-harness.ts) falls back to timers in Node and catches step errors. Neither timer-mode results nor silently caught render failures are acceptable performance evidence.

Add a real-browser test configuration/runner as part of M3. The engine package lists both Vitest and browser-related dependencies, but their declared versions differ; verify compatible tooling before enabling a browser runner. Do not paste a guessed CLI flag and assume it worked. A Playwright-driven dedicated browser page using existing installed tooling is another valid route.

The GPU acceptance command must fail or explicitly report unsupported status when no adapter is available. It must not return an unqualified pass with all relevant tests skipped. Archive browser name/version, adapter/backend when available, executed/skipped counts, GPU validation errors, and whether a software renderer was used. A software renderer can validate some correctness; it cannot substantiate hardware performance.

### 10.2 Performance run procedure

1. Use a production build for acceptance measurements, with dev overlays and console spam disabled. Keep a dev run separately for debugging.
2. Record hardware, OS/browser, power mode, viewport, actual backing dimensions/DPR, display refresh, backend, seed, and all visual settings. Run foreground and avoid simultaneous benchmark workloads.
3. Measure the idle page as a baseline. Warm shaders and allocations separately, then report both cold and warmed transition starts. Never hide capture/shader-init latency inside an excluded warmup without reporting it elsewhere.
4. Run each shortlisted configuration for at least five independent trials. Use 30 seconds of repeated transitions per trial, with a consistent schedule and enough active frames to characterize every phase. Keep idle frames out of active-phase percentiles.
5. Test one button, one large card, several small controls, and a large card plus overlapping small controls. Add a burst where A is reforming when B starts. Record both requested/granted population and peak simultaneously active population.
6. Measure request-to-capture-complete, sampling/upload time, first particle frame, CPU update time, render submission time, rAF intervals, transition completion, and final target error. Report each phase separately so a cheap reform does not hide a slow initial burst.
7. Use rAF intervals to assess delivered frames, not just `performance.now()` around GPU command submission. GPU timestamps are optional diagnostics where supported; do not require them for cross-platform acceptance or claim submission time equals GPU execution time.
8. Count long tasks and intervals exceeding the selected frame budget. Report p50/p95/p99 and worst initial transition latency, not average FPS alone. Abort invalid runs on JS/GPU errors.
9. Measure allocated CPU/GPU resources where available, and track counts of owned resources even when reliable GPU memory totals are unavailable. Repeat mount/use/dispose and verify counts return to baseline.
10. Run a five-minute repeat/resize/background-resume soak for the selected preset. Record memory/resource trend and errors. Confirm that forced fallback reports its reduced count rather than attempting the dense GPU population on CPU.

At 60 Hz, 16.7 ms is the total frame interval. A useful provisional desktop acceptance target is active-frame p95 no greater than about 18.3 ms, fewer than 1% of active intervals above 33.3 ms, and no recurring main-thread task above 50 ms from particle updates. These are proposed gates with scheduling allowance, not measured results or universal mobile thresholds. Record the native refresh interval; adjust comparisons appropriately for 90/120 Hz displays.

Capture latency must be reported separately. Select its product threshold after measuring the actual reference fixtures; do not hide slow capture by keeping the DOM visible and calling the transition responsive. Likewise, define a final-target error threshold in CSS pixels before approving reform. A starting candidate is p95 within 0.5 CSS px at reveal, but test whether current timing can satisfy it without an obvious snap. Changing timing or snapping policy is a deliberate behavior decision.

### 10.3 Minimum device and scenario matrix

| Target | Purpose | Required cases |
| --- | --- | --- |
| Desktop Chromium, actual hardware GPU | Initial compute/render evidence | All counts, both DPRs, concurrent transitions, loss/fallback correctness |
| Desktop Safari on available target hardware | Independent browser validation | Supported GPU path or explicit fallback; portal alpha, capture, resize |
| Representative mobile browser/device | Practical resource limits | Selected reduced/full tier, touch, orientation, background/resume, sustained use |
| Forced CPU + WebGL2 | Fallback behavior | Lower documented budget, coherent field quality, normal/additive blending |
| Forced Canvas2D if supported by controller | Last fallback | Usable DOM, appropriate population reduction, no unsupported effects silently assumed |
| WKWebView/Capacitor, if still a deployment target | Embedded runtime behavior | Real device capture, lifecycle, context availability, memory/resource stability |

Do not infer browser support from old comments in experiment source. Detect the actual capability and record it. If a target is unavailable, list it as untested and avoid extending the performance claim to it.

## 11. Commands and verification order

Run from the component repository unless shown otherwise. These commands exist in the inspected package scripts. They do not start the proposed browser acceptance runner, which M3 still needs to add.

Initial state inventory:

```sh
pwd
git status --short
git rev-parse HEAD
git -C ../screean status --short
git -C ../screean rev-parse HEAD
node --version
pnpm --version
```

Baseline correctness checks before implementation, preserving results for comparison:

```sh
pnpm --dir ../screean test
pnpm --dir ../screean run build
pnpm exec tsc --noEmit
pnpm test
```

After changing engine code, follow the local dependency workflow:

```sh
pnpm --dir ../screean test
pnpm run sync:engine
pnpm exec tsc --noEmit
pnpm test
pnpm run build
pnpm run build:lib
```

`sync:engine` rebuilds the engine and runs `pnpm install`; inspect any lockfile changes. There is no reason to edit the reference flowfield repository to complete engine/component integration.

Additional engine suites:

```sh
pnpm --dir ../screean run test:gpu
pnpm --dir ../screean run test:parity
pnpm --dir ../screean run test:visual
```

Record their skipped tests. Until a browser runner is added and verified, these commands are only part of the validation, not GPU acceptance.

Site inspection:

```sh
pnpm dev
```

The configured development port is 3100. The proposed fidelity route must be registered before it is available. Existing regression routes include `/lab/button`, `/lab/card`, `/components`, and the standalone component demos listed in the README.

Production measurement build:

```sh
pnpm run build
pnpm preview --host 127.0.0.1
```

Use the URL printed by Vite. The site and library builds share the distribution workflow; run the site build immediately before preview so a prior library build has not replaced the preview output. Before testing packaged consumers, run the library build again. Verify tarballs in an isolated consumer rather than treating a working local Vite source import as proof that package exports are correct.

Do not automatically publish or release as part of this feature. Package build and local consumption checks are sufficient for the implementation handoff.

## 12. Evidence bundle, acceptance, and fallback

For each candidate preset, retain an evidence directory containing:

```text
manifest.json             repository revisions and dirty-state description
config.json               actual serialized experiment settings
reference-config.json     actual flow settings and population
reference.mp4             preferred target appearance
comparison.mp4            candidate at matched conditions
frames/                   named phase captures, with viewport/DPR metadata
metrics.json              per-trial phase/frame/capture summaries
raw-frame-samples.jsonl    frame intervals and phase labels
console.txt               browser errors/warnings and GPU validation output
tests.txt                 commands, versions, executed/skipped counts
notes.md                  visual selection, known differences, untested targets
```

Proposed metrics fields should include a schema version, run ID, repository state, backend requested/actual, adapter availability, requested/granted/peak count, viewport/backing size/DPR, phase, frame count, p50/p95/p99 intervals, long-frame count, capture latency, CPU submission timing, optional GPU timing, resource counts, and errors. Represent unavailable measurements explicitly, not as zero. Reuse the repository's profiling types where they fit rather than creating incompatible duplicates.

The feature is ready for a production opt-in when all of the following have evidence:

- A saved candidate reproduces the selected visual result at the default interaction duration, and its difference from flow's 3D reference is documented.
- Counts, point footprints, blending, and opacity have been controlled separately during comparison.
- Required CPU/unit/component tests pass, and relevant GPU tests actually execute on a real browser/device.
- Concurrent slices, repeated calls, capture failures, component removal, and disposal cannot leave controls hidden or promises pending.
- The dense path performs GPU-resident motion and reform without per-frame readback or all-pairs neighbor repulsion.
- Desktop and fallback budgets meet their recorded acceptance gates. Missing mobile/embedded validation is stated explicitly.
- The existing synchronous CPU API and default component behavior remain compatible.
- Both packages build and their public exports work in an isolated consumer.

Rollback should be configuration-first: keep the legacy mode available, leave it as the default until the dense mode is accepted, and make dense mode removable without changing native component behavior. On resource exhaustion or unsupported hardware, grant a lower tested count or perform the DOM transition without particles. Do not silently use the requested dense count with a slower fallback and claim parity.

## 13. Open decisions and immediate next action

These decisions require experiment evidence, not speculation:

| Decision | Starting recommendation | How to resolve |
| --- | --- | --- |
| Is projected depth essential? | Begin with 2D curl and preserved targets | Compare against captured user reference before expanding GPU struct |
| Which field algorithm/derivative? | Stable-seed smooth potential, CPU grid plus direct reference | Match temporal/spatial structure and measure interpolation cost/error |
| Domain warping required? | Leave off initially | Add only after base curl/count/presentation comparison |
| Desired velocity or acceleration? | Desired-velocity relaxation for the new mode | Verify trajectories and dt invariance against the reference behavior |
| Count policy and limits | Explicit counts for experiment; eligible-area density plus shared budget for product | Profile actual fixtures and concurrent use |
| Dot profile and opacity curve | Explicit shared profile, density-aware tuning | Match footprint/contrast at DPR 1/2 and different areas |
| Trail persistence | Disable for primary comparison | Validate explicit history separately if the chosen appearance needs it |
| Color-preserving reform? | Separate follow-up | Determine whether mask/palette fidelity is acceptable after motion improves |
| GPU API exposure | Additive async factory and narrow transition interface | Compile existing consumers and exercise provider lifecycle |
| Production platform tiers | No unmeasured promise | Complete browser/device matrix and record unsupported targets |

The next implementer should begin with M0 and M1: capture the actual flow reference, establish baseline test results, and build the shared-controller fidelity experiment with truthful count/backend diagnostics. Then add coherent motion and compare it at moderate counts before committing to a dense GPU preset.

At handoff, only documentation and the CPU benchmark reproduction artifact have been added. The original full benchmark and a smoke run of the preserved runner are the available measurements. No browser visual comparison, GPU performance run, new runtime feature, or full regression-suite run was performed while preparing this document.
