/// <reference types="vite/client" />
// six-logo experiment — a glTF model rendered as a particle cloud.
//
// The 3D shape is fed to screean's 2D particle system as PROJECTED targets:
// each frame we rotate the mesh-local sample points, project to screen
// pixels, and write each particle's `tx`/`ty`. The spring force pulls the
// particle toward its current projected position; depth modulates alpha so
// the back of the model recedes.
//
// Click anywhere → radialImpulse from the cursor scatters the cloud. The
// per-frame projection updater keeps writing fresh tx/ty regardless, so the
// scatter is just a transient kick — the spring pulls the cloud back into
// shape on its own.
//
// Controls: particle count (rebuilds the cloud), spring K/C, drag, shimmer,
// auto-rotate Y/X speeds, cycle seconds (mesh ↔ text alternation).
//
// Two cloud sources alternate every `cycleSec` seconds: the .glb logo and
// a 3D-projected "the6ixCollective" wordmark. Switching is just a pointer
// swap on `state.points` — particles re-target to the new positions, the
// spring force makes the morph automatic. No respawn, no fade choreography.

import sixLogoGlb from '../assets/6ixLogo.glb?url';

import { renderNav, renderFooter } from '../layout';
import { Stage, makeColor } from '../embed';
import { THEMES, DEFAULT_THEME } from '../themes';
import {
  spawn,
  radialImpulse,
  TRANSPARENT,
  packRGBA,
  mulberry32,
  textField,
  type Rng,
} from 'screean';
import { loadGlb, sampleSurface, centerAndScale, type LoadedMesh } from '../lib/loaders/gltf';
import { attachFullscreenButton } from '../lib/ui/fullscreen';
import { stepFlowfield } from '../lib/physics/flowfield';

// Visual tuning constants. Live in sync with the controls' default values
// so a "reset" button can restore the same baseline. Plain object (no
// `as const`) so the values broaden to `number` for setter calls.
const DEFAULTS: Record<string, number> = {
  particleCount: 8000,
  // ─── force knobs (mirror landing-page playground) ──────────────────────
  springK: 32,
  springC: 6.5,
  drag: 0.55,
  shimmerAmp: 4,
  shimmerFreq: 1.6,    // breathing-motion frequency (Hz-ish)
  repelRadius: 6,      // neighbor-repulsion search radius
  repelStrength: 0,    // 0 = silhouette matches projection exactly; >0 = particles push each other apart
  // ─── interaction knobs ─────────────────────────────────────────────────
  scatterKick: 360,    // initial impulse magnitude on click
  scatterSoftness: 0.06, // 1/d falloff sharpness — small = punchy near, gentle far
  // ─── projection knobs ──────────────────────────────────────────────────
  cloudScale: 1.0,     // zoom multiplier applied post-rotation, pre-perspective
  perspective: 580,    // focal length; lower = wider FOV / more dramatic foreshortening
  // ─── motion / cycle ────────────────────────────────────────────────────
  rotYspeed: 0.0,      // radians per second; user-tunable via slider
  rotXspeed: 0.0,
  rotZspeed: 0.0,      // roll around the camera/view axis
  cycleSec: 8,         // mesh → text → flowfield rotation interval
  // ─── flowfield (third state — particles drift through a curl-like field
  //                bounded to the canvas) ────────────────────────────────
  flowSpeed: 1.0,      // overall multiplier on flow vector magnitude
  flowScale: 0.013,    // spatial frequency of the noise (lower = larger eddies)
  flowLookahead: 28,   // how far ahead in the flow direction we set tx/ty
  // ─── fixed (no user knob — internal layout constants) ──────────────────
  modelRadius: 220,    // post-fit cloud radius in world units (≈ canvas px / 2)
  modelDepth: 600,     // camera distance — shifts whole cloud onto the +z side
};

const WORDMARK = 'the6ixCollective';
const WORDMARK_FONT = 'bold 110px system-ui, -apple-system, "Segoe UI", sans-serif';

// Sample N points from the 3D-flat projection of a text string. Reuses
// screean's `textField` rasterizer (OffscreenCanvas under the hood) for
// the (x, y) sampling, then promotes points to 3D.
//
// Axis choice: the mesh starts with rotX = -π/2 to stand a Z-up Blender
// export upright. That same rotation collapses any plain XY text into a
// thin horizontal line (text Y becomes camera-depth, so all rows project
// to the screen midline). To make the wordmark survive the same rotation
// upright, we sample text into the XZ plane instead — text "up" becomes
// world +Z. After rotX(-π/2), input Z maps to output -Y, so text top ends
// up above center on screen exactly where you'd want it.
type SampledCloud = {
  points: Float32Array;
  bbox: LoadedMesh['bbox'];
};
const sampleTextCloud = (text: string, font: string, n: number, rng: Rng): SampledCloud => {
  const f = textField({ text, x: 0, y: 0, font });
  const samples = f.sample(n);
  const points = new Float32Array(n * 3);
  let minX = Infinity, minZ = Infinity, maxX = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < n; i++) {
    const [sx, sy] = samples[i] ?? [0, 0];
    // Raster Y goes down (text top has small sy, bottom has large sy).
    // We want text top → +Z so it lands above screen center after the
    // standard X-rotation. Negating sy flips that convention.
    const sz = -sy;
    points[i * 3 + 0] = sx;
    points[i * 3 + 1] = 0;
    points[i * 3 + 2] = sz;
    if (sx < minX) minX = sx;
    if (sz < minZ) minZ = sz;
    if (sx > maxX) maxX = sx;
    if (sz > maxZ) maxZ = sz;
  }
  // Field consumers don't see rng. textField uses Math.random internally
  // for sampling, so the cloud isn't seed-deterministic across rebuilds.
  // Acceptable for a visual experiment; real determinism would mean
  // patching the field's RNG, which isn't worth the surface change.
  void rng;
  return {
    points,
    bbox: { min: [minX, 0, minZ], max: [maxX, 0, maxZ] },
  };
};

// One slider definition. Tied to a feel-override key, a Stage method, or a
// custom apply function. Kept as data so we can render the panel in a loop
// rather than emitting 6 hand-written sections.
type Knob = {
  label: string;
  min: number;
  max: number;
  step: number;
  initial: number;
  format?: (v: number) => string;
  apply: (v: number) => void;
};

export const mount = (root: HTMLElement): (() => void) => {
  const theme = THEMES[DEFAULT_THEME];
  root.innerHTML = '';

  const worldBehind = document.createElement('div');
  worldBehind.className = 'world-behind';
  worldBehind.setAttribute('aria-hidden', 'true');
  root.appendChild(worldBehind);

  root.appendChild(renderNav({ current: '/experiments' }));

  const head = document.createElement('section');
  head.className = 'doc-head';
  head.innerHTML = `
    <span class="doc-eyebrow">EXPERIMENT · 02</span>
    <h1>six-logo · gltf cloud</h1>
    <p>A 3D model fed to the 2D particle system as projected targets. The mesh is sampled by triangle area into a point cloud; each frame the cloud rotates and projects to screen pixels; particles spring-chase the projection. Click to scatter.</p>
  `;
  root.appendChild(head);

  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.innerHTML = `
    <div class="experiment-canvas-wrap surface-card">
      <canvas class="experiment-canvas" aria-hidden="true"></canvas>
    </div>
    <aside class="experiment-aside surface-card">
      <header class="experiment-aside-head">
        <span class="experiment-aside-eyebrow">CONTROLS</span>
        <button type="button" class="playground-reset" data-reset>RESET</button>
      </header>
      <div class="playground-knobs" data-knobs></div>
      <footer class="experiment-aside-foot">
        <code class="playground-code">click canvas → scatter · particles spring back</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);

  const canvas = stage.querySelector<HTMLCanvasElement>('.experiment-canvas')!;
  const wrap = stage.querySelector<HTMLDivElement>('.experiment-canvas-wrap')!;
  const knobsHost = stage.querySelector<HTMLDivElement>('[data-knobs]')!;
  const resetBtn = stage.querySelector<HTMLButtonElement>('[data-reset]')!;

  // W/H mutate on fullscreen toggle. The projection loop reads them via
  // closure each frame, so resize is automatic — no need to re-bind.
  const INITIAL_W = 720;
  const INITIAL_H = 480;
  let W = INITIAL_W;
  let H = INITIAL_H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;

  // Build the Stage. We don't call setScene — particles are driven directly
  // each frame by the projection updater. spawnFrom='edge' gives a nice
  // "they fly in from the borders to assemble the logo" intro.
  const sg = new Stage({
    canvas,
    width: W,
    height: H,
    feel: theme.feel,
    feelOverrides: {
      springK: DEFAULTS.springK,
      springC: DEFAULTS.springC,
      drag: DEFAULTS.drag,
      shimmerAmp: DEFAULTS.shimmerAmp,
      // Repel zero so the cloud silhouette matches the projected mesh
      // tightly. Same trick as screeanNav / screeanWipe.
      repelRadius: 6,
      repelStrength: 0,
    },
    palette: theme.palette,
    particleCount: DEFAULTS.particleCount,
    spawnFrom: 'edge',
    spawnSpeed: 220,
    portal: false,
    particleSize: 0.9,
    trailAlpha: 0.18,
  });

  // Mutable state owned by the experiment. The projection loop reads these;
  // controls write them.
  //
  // `meshCloud` and `textCloud` are both N×3 arrays sampled at the current
  // particle count. `points` aliases whichever is currently driving the
  // particles. Switching is a pointer swap — no allocation, no respawn.
  type State = {
    rotY: number;
    rotX: number;
    rotZ: number;
    rotYspeed: number;
    rotXspeed: number;
    rotZspeed: number;
    meshCloud: Float32Array;
    textCloud: Float32Array;
    points: Float32Array;
    activeSource: 'mesh' | 'text' | 'flowfield';
    pointCount: number;
    particleCount: number;
    cycleSec: number;
    cycleAccum: number; // seconds since last switch
    cloudScale: number;
    perspective: number;
    scatterKick: number;
    scatterSoftness: number;
    flowSpeed: number;
  };
  const state: State = {
    // rotY is shared between mesh and text, so we bake the mesh's 180° flip
    // into its sample data (see rebuildCloud) instead of putting it here.
    // That way the text orientation stays untouched.
    rotY: 0,
    // The 6ixLogo .glb sits flat in mesh-local space (Z-up Blender export).
    // Quarter-turn around X stands it up so the logo face points at the
    // camera at t=0; the auto-rotate then spins it on the Y axis as usual.
    rotX: -Math.PI / 2,
    rotZ: 0,
    rotYspeed: DEFAULTS.rotYspeed,
    rotXspeed: DEFAULTS.rotXspeed,
    rotZspeed: DEFAULTS.rotZspeed,
    meshCloud: new Float32Array(0),
    textCloud: new Float32Array(0),
    points: new Float32Array(0),
    activeSource: 'mesh',
    pointCount: 0,
    particleCount: DEFAULTS.particleCount,
    cycleSec: DEFAULTS.cycleSec,
    cycleAccum: 0,
    cloudScale: DEFAULTS.cloudScale,
    perspective: DEFAULTS.perspective,
    scatterKick: DEFAULTS.scatterKick,
    scatterSoftness: DEFAULTS.scatterSoftness,
    flowSpeed: DEFAULTS.flowSpeed,
  };

  const colorSampler = makeColor(theme.palette);

  // Replace the world's particles with N fresh ones spawned from the canvas
  // edges. Called on initial mount and on particle-count change. Re-samples
  // BOTH cloud sources at the new count — switching is a pointer swap, so
  // both arrays must be sized identically to the live particle array.
  const rebuildCloud = (mesh: LoadedMesh, n: number): void => {
    state.particleCount = n;

    // Mesh sample: deterministic seed so the visual is stable across rebuilds.
    const meshRng = mulberry32(0xc0ffee + n);
    const meshPts = sampleSurface(mesh, n, meshRng);
    centerAndScale(meshPts, mesh.bbox, DEFAULTS.modelRadius);
    // Bake a 180° Z flip into the mesh points so the logo reads right-way-up
    // at rest. RotateZ(π) maps (x, y, z) → (-x, -y, z). Done in place after
    // centerAndScale so the cloud stays centered on origin. Kept off any
    // live `state.rot*` axis because those are shared with the text source —
    // pre-rotating in source space lets each cloud have its own baseline
    // orientation without affecting the other.
    for (let i = 0; i < meshPts.length; i += 3) {
      meshPts[i + 0] = -meshPts[i + 0];
      meshPts[i + 1] = -meshPts[i + 1];
    }
    state.meshCloud = meshPts;

    // Text sample: same N, then center-and-scale to the same radius so the
    // wordmark and logo occupy a similar footprint when alternating.
    const textCloud = sampleTextCloud(WORDMARK, WORDMARK_FONT, n, mulberry32(0xbeef));
    centerAndScale(textCloud.points, textCloud.bbox, DEFAULTS.modelRadius);
    state.textCloud = textCloud.points;

    // Initial source = mesh; the cycle timer flips it to text after cycleSec.
    state.points = state.activeSource === 'mesh' ? state.meshCloud : state.textCloud;
    state.pointCount = n;

    sg.world.particles.length = 0;
    sg.world.addParticles(
      spawn({
        n,
        origin: { kind: 'edge', width: W, height: H },
        color: TRANSPARENT,
        speed: 240,
        toward: { x: W / 2, y: H / 2 },
      }),
    );
    // Initial color pass — projection updater will modulate alpha each
    // frame so we just paint base hues once.
    for (const p of sg.world.particles) p.color = colorSampler();
  };

  // Project every sample point and write its (sx, sy) into the matching
  // particle's tx/ty. Also derive a depth-cued alpha by mapping projected
  // z to [0.18, 1.0] so back-of-mesh particles look further away.
  //
  // Math: rotate around Y, then around X, then translate by camera distance,
  // then perspective-divide. Output is screen-centered pixels.
  const projectFrame = (): void => {
    const cy = Math.cos(state.rotY), sy = Math.sin(state.rotY);
    const cx = Math.cos(state.rotX), sx = Math.sin(state.rotX);
    const cosZ = Math.cos(state.rotZ), sinZ = Math.sin(state.rotZ);
    const f = state.perspective;
    const d = DEFAULTS.modelDepth;
    const scale = state.cloudScale;
    const cxScreen = W / 2;
    const cyScreen = H / 2;

    const pts = state.points;
    const particles = sg.world.particles;
    const n = Math.min(particles.length, state.pointCount);

    // Track depth range across the frame so we can normalize alpha. Doing
    // it per-frame (vs. precomputed) keeps the cueing tight as the cloud
    // rotates — closest 10% always reads as "foreground."
    let zMin = Infinity;
    let zMax = -Infinity;

    // First pass: rotate + translate, store the camera-space z back into
    // particle._tmpZ for the alpha pass below. We piggyback on tx for x'
    // and ty for y' / w to avoid a second array.
    //
    // We can't use a private field on Particle, so we use a parallel
    // Float32Array for z. Allocated once on rebuild; resized only when
    // particleCount changes.
    if (depthScratch.length < n) depthScratch = new Float32Array(n);

    for (let i = 0; i < n; i++) {
      const px = pts[i * 3 + 0];
      const py = pts[i * 3 + 1];
      const pz = pts[i * 3 + 2];
      // Rotation order: X → Y → Z. Why this order: the mesh starts with
      // rotX = -π/2 baked-in to stand the Z-up model upright. If Y went
      // first, the spin would happen in mesh-local space, where mesh-Y is
      // the "up" axis BEFORE the X-tilt — and the X-tilt then swings that
      // axis to align with the camera's depth axis, making rotY look
      // exactly like rotZ. Doing X first means the model is upright by
      // the time Y spins, so Y becomes a clean screen-vertical-axis spin.
      //
      // Rotate around X: (y, z) -> (cx*y - sx*z, sx*y + cx*z)
      const ax = px;
      const ay = cx * py - sx * pz;
      const az = sx * py + cx * pz;
      // Rotate around Y: (x, z) -> (cy*x + sy*z, -sy*x + cy*z)
      const rx = cy * ax + sy * az;
      const ry = ay;
      const rz = -sy * ax + cy * az;
      // Rotate around Z (roll around camera/view axis). Applied last so
      // it spins the already-oriented silhouette around screen center;
      // depth axis is unaffected.
      const rxR = cosZ * rx - sinZ * ry;
      const ryR = sinZ * rx + cosZ * ry;
      // Translate so the model sits in front of the camera (positive z
      // out of screen, larger = closer).
      const camZ = rz + d;
      // Perspective divide. Clamp w to keep particles whose camZ is
      // tiny/negative from flipping to the wrong side. cloudScale applies
      // post-rotation, pre-perspective — equivalent to scaling the model in
      // world space without re-sampling.
      const w = Math.max(camZ, 1);
      const sxp = (rxR * scale * f) / w + cxScreen;
      const syp = -(ryR * scale * f) / w + cyScreen; // flip Y so glTF Y-up reads up
      const p = particles[i];
      p.tx = sxp;
      p.ty = syp;
      depthScratch[i] = camZ;
      if (camZ < zMin) zMin = camZ;
      if (camZ > zMax) zMax = camZ;
    }

    // Second pass: depth-cued alpha. The closest particles are full-bright
    // (alpha=255), the farthest fall to ~46. Linear in camera-space z.
    const zRange = zMax - zMin || 1;
    for (let i = 0; i < n; i++) {
      const p = particles[i];
      if (p.life <= 0) continue;
      const t = 1 - (depthScratch[i] - zMin) / zRange; // 1 = closest, 0 = farthest
      const alpha = Math.round(46 + t * (255 - 46));
      // Repack with a fresh alpha channel, preserving rgb.
      const c = p.color;
      const r = c & 0xff;
      const g = (c >> 8) & 0xff;
      const b = (c >> 16) & 0xff;
      p.color = packRGBA(r, g, b, alpha);
    }
  };

  let depthScratch = new Float32Array(0);

  // Flowfield step — see site/lib/flowfield.ts for the math. Bounded to
  // the canvas; particles wrap when they leave an edge.
  const updateFlowfield = (now: number): void => {
    stepFlowfield(sg.world.particles, {
      time: now / 1000,
      scale: DEFAULTS.flowScale,
      lookahead: DEFAULTS.flowLookahead,
      speed: state.flowSpeed,
      bounds: { w: W, h: H },
    });
  };

  // Drive the projection loop at the same RAF cadence as Stage's tick. The
  // shared ticker calls Stage.step(); we run the projection right before
  // it so this frame's tx/ty are current when forces resolve. Stage doesn't
  // expose an "onBeforeStep" hook — easiest path is a parallel RAF that
  // runs slightly ahead.
  let raf = 0;
  let lastT = performance.now();
  const tick = (now: number): void => {
    raf = requestAnimationFrame(tick);
    const dt = Math.min(0.05, (now - lastT) / 1000);
    lastT = now;
    state.rotY += state.rotYspeed * dt;
    state.rotX += state.rotXspeed * dt;
    state.rotZ += state.rotZspeed * dt;

    // Cycle source on `cycleSec` boundaries. Three-state rotation:
    // mesh → text → flowfield → mesh → ... Accumulating dt instead of
    // setInterval keeps the timer in lockstep with rAF — pauses when the
    // tab is backgrounded, resumes correctly on focus, and reacts to a
    // mid-cycle slider change because we compare against the live
    // `state.cycleSec` every tick.
    if (state.meshCloud.length > 0 && state.textCloud.length > 0) {
      state.cycleAccum += dt;
      if (state.cycleAccum >= state.cycleSec) {
        state.cycleAccum = 0;
        const cycle = ['mesh', 'text', 'flowfield'] as const;
        const idx = cycle.indexOf(state.activeSource);
        state.activeSource = cycle[(idx + 1) % cycle.length];
        if (state.activeSource === 'mesh') state.points = state.meshCloud;
        else if (state.activeSource === 'text') state.points = state.textCloud;
        // For flowfield we don't swap state.points — projectFrame is
        // bypassed entirely in favor of updateFlowfield.
      }
    }

    if (state.activeSource === 'flowfield') {
      updateFlowfield(now);
    } else if (state.points.length > 0) {
      projectFrame();
    }
  };

  // Click → scatter. radialImpulse pushes every particle outward from the
  // click point. Spring brings them back automatically — no setTimeout
  // dance. Stronger impulse + lower springK gives a "drift before snap"
  // feel; the user can tune both via controls.
  const onClick = (e: MouseEvent): void => {
    const r = canvas.getBoundingClientRect();
    const cx = e.clientX - r.left;
    const cy = e.clientY - r.top;
    radialImpulse(sg.world.particles, {
      origin: { x: cx, y: cy },
      kick: state.scatterKick,
      // 1/d falloff: low softness keeps the kick punchy near cursor and
      // dies off cleanly with distance. Spring re-asserts within ~150ms
      // at default settings.
      softness: state.scatterSoftness,
    });
  };
  canvas.addEventListener('click', onClick);

  // Fullscreen toggle. On enter/exit we resize the Stage to the new viewport;
  // the projection loop reads W/H via closure each frame, so the cloud
  // re-fits naturally without a respawn.
  const fs = attachFullscreenButton({
    wrap,
    restoreWidth: INITIAL_W,
    restoreHeight: INITIAL_H,
    onResize: (w, h) => {
      W = w;
      H = h;
      sg.resize(w, h);
    },
  });

  // Wire the controls. Each Knob's `apply` mutates the appropriate piece
  // of state — Stage.setFeelOverrides for forces, state.* for projection,
  // particle rebuild for count.
  let mesh: LoadedMesh | null = null;
  const knobs: Knob[] = [
    {
      label: 'particles',
      min: 1000,
      max: 20000,
      step: 500,
      initial: DEFAULTS.particleCount,
      format: (v) => String(Math.round(v)),
      apply: (v) => {
        if (!mesh) return;
        rebuildCloud(mesh, Math.round(v));
      },
    },
    {
      label: 'spring k',
      min: 4,
      max: 120,
      step: 1,
      initial: DEFAULTS.springK,
      format: (v) => v.toFixed(0),
      apply: (v) => sg.setFeelOverrides({ springK: v }),
    },
    {
      label: 'damping (c)',
      min: 0.5,
      max: 20,
      step: 0.1,
      initial: DEFAULTS.springC,
      format: (v) => v.toFixed(1),
      apply: (v) => sg.setFeelOverrides({ springC: v }),
    },
    {
      label: 'drag',
      min: 0.05,
      max: 1.5,
      step: 0.05,
      initial: DEFAULTS.drag,
      format: (v) => v.toFixed(2),
      apply: (v) => sg.setFeelOverrides({ drag: v }),
    },
    {
      label: 'shimmer amp',
      min: 0,
      max: 24,
      step: 0.5,
      initial: DEFAULTS.shimmerAmp,
      format: (v) => v.toFixed(1),
      apply: (v) => sg.setFeelOverrides({ shimmerAmp: v }),
    },
    {
      label: 'shimmer freq',
      min: 0,
      max: 6,
      step: 0.1,
      initial: DEFAULTS.shimmerFreq,
      format: (v) => v.toFixed(1),
      apply: (v) => sg.setFeelOverrides({ shimmerFreq: v }),
    },
    {
      label: 'repel radius',
      min: 0,
      max: 40,
      step: 1,
      initial: DEFAULTS.repelRadius,
      format: (v) => v.toFixed(0),
      apply: (v) => sg.setFeelOverrides({ repelRadius: v }),
    },
    {
      label: 'repel strength',
      min: 0,
      max: 2000,
      step: 25,
      initial: DEFAULTS.repelStrength,
      format: (v) => v.toFixed(0),
      apply: (v) => sg.setFeelOverrides({ repelStrength: v }),
    },
    {
      label: 'cloud size',
      min: 0.3,
      max: 2.5,
      step: 0.05,
      initial: DEFAULTS.cloudScale,
      format: (v) => `${v.toFixed(2)}×`,
      apply: (v) => { state.cloudScale = v; },
    },
    {
      label: 'fov',
      min: 200,
      max: 1400,
      step: 20,
      initial: DEFAULTS.perspective,
      format: (v) => v.toFixed(0),
      apply: (v) => { state.perspective = v; },
    },
    {
      label: 'scatter kick',
      min: 0,
      max: 1500,
      step: 20,
      initial: DEFAULTS.scatterKick,
      format: (v) => v.toFixed(0),
      apply: (v) => { state.scatterKick = v; },
    },
    {
      label: 'scatter falloff',
      min: 0.005,
      max: 0.5,
      step: 0.005,
      initial: DEFAULTS.scatterSoftness,
      format: (v) => v.toFixed(3),
      apply: (v) => { state.scatterSoftness = v; },
    },
    {
      label: 'rotate y',
      min: -2,
      max: 2,
      step: 0.05,
      initial: DEFAULTS.rotYspeed,
      format: (v) => `${v.toFixed(2)} rad/s`,
      apply: (v) => { state.rotYspeed = v; },
    },
    {
      label: 'rotate x',
      min: -2,
      max: 2,
      step: 0.05,
      initial: DEFAULTS.rotXspeed,
      format: (v) => `${v.toFixed(2)} rad/s`,
      apply: (v) => { state.rotXspeed = v; },
    },
    {
      label: 'rotate z',
      min: -2,
      max: 2,
      step: 0.05,
      initial: DEFAULTS.rotZspeed,
      format: (v) => `${v.toFixed(2)} rad/s`,
      apply: (v) => { state.rotZspeed = v; },
    },
    {
      label: 'cycle',
      min: 1,
      max: 30,
      step: 0.5,
      initial: DEFAULTS.cycleSec,
      format: (v) => `${v.toFixed(1)}s`,
      apply: (v) => {
        state.cycleSec = v;
        // Don't reset cycleAccum — slider changes mid-cycle should only
        // shorten or lengthen the next switch, not resync. If the new
        // value is below the current accumulator, the next tick switches
        // immediately (matches user expectation: shorter time = faster).
      },
    },
    {
      label: 'flow speed',
      min: 0,
      max: 4,
      step: 0.05,
      initial: DEFAULTS.flowSpeed,
      format: (v) => `${v.toFixed(2)}×`,
      apply: (v) => { state.flowSpeed = v; },
    },
  ];

  const inputs: HTMLInputElement[] = [];
  const valueEls: HTMLSpanElement[] = [];

  knobs.forEach((k, idx) => {
    const wrap = document.createElement('div');
    wrap.className = 'pg-knob';
    wrap.innerHTML = `
      <div class="pg-knob-head">
        <span class="pg-knob-label">${k.label}</span>
        <span class="pg-knob-value" data-knob-value="${idx}">${k.format ? k.format(k.initial) : k.initial}</span>
      </div>
      <input class="pg-knob-slider" type="range"
             min="${k.min}" max="${k.max}" step="${k.step}" value="${k.initial}"
             data-knob-input="${idx}" />
    `;
    knobsHost.appendChild(wrap);
    const input = wrap.querySelector<HTMLInputElement>('input')!;
    const valueEl = wrap.querySelector<HTMLSpanElement>('.pg-knob-value')!;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valueEl.textContent = k.format ? k.format(v) : String(v);
      k.apply(v);
    });
    inputs.push(input);
    valueEls.push(valueEl);
  });

  resetBtn.addEventListener('click', () => {
    knobs.forEach((k, idx) => {
      inputs[idx].value = String(k.initial);
      valueEls[idx].textContent = k.format ? k.format(k.initial) : String(k.initial);
      k.apply(k.initial);
    });
  });

  // Boot: load the model, build the cloud, start the projection loop.
  // We don't block experiment mount on the load — the page renders the
  // chrome immediately and the cloud appears once decoded. ~860KB on this
  // model decodes in <50ms on a modern machine.
  let cancelled = false;
  loadGlb(sixLogoGlb)
    .then((m) => {
      if (cancelled) return;
      mesh = m;
      rebuildCloud(m, DEFAULTS.particleCount);
      raf = requestAnimationFrame(tick);
    })
    .catch((err) => {
      console.error('six-logo: glb load failed', err);
      const msg = document.createElement('p');
      msg.textContent = `Failed to load 6ixLogo.glb — ${String(err)}`;
      msg.style.cssText = 'color: #f88; padding: 12px; font-family: monospace; font-size: 12px;';
      stage.appendChild(msg);
    });

  root.appendChild(renderFooter());

  return () => {
    cancelled = true;
    if (raf) cancelAnimationFrame(raf);
    canvas.removeEventListener('click', onClick);
    fs.dispose();
    sg.dispose();
  };
};
