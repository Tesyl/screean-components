// flowfield-gpu experiment — WebGPU compute pass replaces the CPU per-frame
// loop entirely. Each particle's position + velocity lives on the device;
// a compute shader samples the flow, applies spring + drag + click impulse,
// integrates, and wraps. A render pass then draws instanced quads from the
// same buffer — no CPU-GPU round-trip per frame.
//
// Self-contained: doesn't touch screean's World, forces, integrator, or
// renderers. The WGSL strings are inline so the experiment is one file.
// If the browser doesn't support WebGPU (Safari today, older Chromiums),
// we render a polite fallback and bail.

import { renderNav, renderFooter } from '../layout';
import { THEMES, DEFAULT_THEME } from '../themes';
import { attachFullscreenButton } from '../lib/ui/fullscreen';

// Theme colors. Pulled out to module scope so the offscreen-texture clear
// (which happens during pipeline init) can reference them before the
// theme variables would otherwise be in scope.
const PARTICLE_RGB: [number, number, number] = [0.78, 1.0, 0.32]; // chartreuse
const FADE_RGB: [number, number, number] = [0.04, 0.04, 0.06];

// ─── Defaults shared between knobs and shader uniforms ────────────────────
const DEFAULTS: Record<string, number> = {
  particleCount: 80000, // 10× the CPU experiment — what GPU buys you
  flowSpeed: 1.0,
  flowScale: 0.013,
  flowLookahead: 28,
  springK: 18,
  springC: 5.5,
  drag: 0.55,
  particleSize: 1.4,
  trailAlpha: 0.06,    // lower = longer trails
  scatterKick: 600,
  scatterSoftness: 0.04,
};

// ─── WGSL shaders ─────────────────────────────────────────────────────────
//
// Compute: one invocation per particle. Reads the flow, builds a moving
// spring target, applies forces, integrates, wraps. Click impulse is a
// one-shot — JS sets `kick` for one frame then resets it to 0.
//
// Why workgroup_size 64: a sweet spot across NVIDIA / AMD / Apple / Intel
// SIMD widths. 32 wastes warp on NVIDIA, 256 spills on Apple integrated.
const COMPUTE_WGSL = /* wgsl */ `
struct Particle {
  pos: vec2f,
  vel: vec2f,
}

struct Uniforms {
  time: f32,
  dt: f32,
  scale: f32,
  lookahead: f32,
  speed: f32,
  springK: f32,
  springC: f32,
  drag: f32,
  bounds: vec2f,
  cursor: vec2f,
  kick: f32,
  softness: f32,
}

@group(0) @binding(0) var<storage, read_write> particles: array<Particle>;
@group(0) @binding(1) var<uniform> u: Uniforms;

fn flowAt(x: f32, y: f32) -> vec2f {
  let xs = x * u.scale;
  let ys = y * u.scale;
  let fx =
    sin(xs + u.time * 0.6) +
    0.6 * cos(ys * 1.3 - u.time * 0.4);
  let fy =
    cos(xs * 1.1 - u.time * 0.3) -
    0.6 * sin(ys + u.time * 0.5);
  return vec2f(fx, fy);
}

@compute @workgroup_size(64)
fn main(@builtin(global_invocation_id) gid: vec3u) {
  let i = gid.x;
  if (i >= arrayLength(&particles)) { return; }
  var p = particles[i];

  // Spring target = current position + flow lookahead. (target is a WGSL
  // reserved keyword, so the local var is named tgt.)
  let flow = flowAt(p.pos.x, p.pos.y);
  let tgt = p.pos + flow * (u.lookahead * u.speed);

  // Spring force toward target with damping.
  var force = (tgt - p.pos) * u.springK - p.vel * u.springC;

  // Viscous drag.
  force -= p.vel * u.drag;

  // One-shot radial impulse from cursor (kick = 0 most frames).
  if (u.kick > 0.0) {
    let toP = p.pos - u.cursor;
    let dist = length(toP);
    let d = max(1.0, dist * u.softness);
    let mag = u.kick / d;
    if (dist > 0.0001) {
      force += (toP / dist) * mag;
    }
  }

  // Semi-implicit Euler — velocity first so position uses the new value.
  p.vel += force * u.dt;
  p.pos += p.vel * u.dt;

  // Bounded canvas wrap.
  if (p.pos.x > u.bounds.x) { p.pos.x -= u.bounds.x; }
  else if (p.pos.x < 0.0) { p.pos.x += u.bounds.x; }
  if (p.pos.y > u.bounds.y) { p.pos.y -= u.bounds.y; }
  else if (p.pos.y < 0.0) { p.pos.y += u.bounds.y; }

  particles[i] = p;
}
`;

// Particle render: instanced point quads with alpha-falloff fragment.
// Six vertices per quad → two triangles. Instance index picks the particle.
const PARTICLE_RENDER_WGSL = /* wgsl */ `
struct Particle {
  pos: vec2f,
  vel: vec2f,
}

struct RenderU {
  bounds: vec2f,
  particleSize: f32,
  _pad: f32,
  color: vec4f,
}

@group(0) @binding(0) var<storage, read> particles: array<Particle>;
@group(0) @binding(1) var<uniform> r: RenderU;

struct VsOut {
  @builtin(position) clipPos: vec4f,
  @location(0) uv: vec2f,
  @location(1) speed: f32,
}

@vertex
fn vs(@builtin(vertex_index) vi: u32, @builtin(instance_index) ii: u32) -> VsOut {
  let corners = array<vec2f, 6>(
    vec2f(-1, -1), vec2f( 1, -1), vec2f(-1,  1),
    vec2f(-1,  1), vec2f( 1, -1), vec2f( 1,  1),
  );
  let corner = corners[vi];
  let p = particles[ii];

  // Pixel coords → clip space (-1..1). Y flipped so canvas-down matches
  // screen-down without extra plumbing on the JS side.
  let ndc = vec2f(
    (p.pos.x / r.bounds.x) * 2.0 - 1.0,
    1.0 - (p.pos.y / r.bounds.y) * 2.0,
  );
  let halfSize = vec2f(r.particleSize) / r.bounds * 2.0;
  let offsetClip = corner * halfSize * vec2f(1.0, -1.0); // match Y flip

  var o: VsOut;
  o.clipPos = vec4f(ndc + offsetClip, 0.0, 1.0);
  o.uv = corner;
  o.speed = clamp(length(p.vel) * 0.005, 0.0, 1.0);
  return o;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  let d = length(in.uv);
  if (d > 1.0) { discard; }
  // Soft round sprite — alpha falls off radially. Speed brightens fast
  // particles slightly so motion reads even in dense clouds.
  let alpha = (1.0 - d * d) * (0.55 + in.speed * 0.45);
  return vec4f(r.color.rgb, r.color.a * alpha);
}
`;

// Trail fade: a fullscreen quad drawn each frame BEFORE particles. Source
// alpha = trailAlpha; with destination-over blending it dims the previous
// frame's pixels by (1 - trailAlpha) — matches Canvas2D's trail trick.
const FADE_WGSL = /* wgsl */ `
struct FadeU {
  alpha: f32,
  _pad0: f32, _pad1: f32, _pad2: f32,
  color: vec4f,
}

@group(0) @binding(0) var<uniform> f: FadeU;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> @builtin(position) vec4f {
  let corners = array<vec2f, 6>(
    vec2f(-1, -1), vec2f( 1, -1), vec2f(-1,  1),
    vec2f(-1,  1), vec2f( 1, -1), vec2f( 1,  1),
  );
  return vec4f(corners[vi], 0.0, 1.0);
}

@fragment
fn fs() -> @location(0) vec4f {
  return vec4f(f.color.rgb, f.alpha);
}
`;

// Blit pass: copy our persistent scene texture to the swapchain texture
// each frame. Necessary because the WebGPU swapchain's texture content is
// not guaranteed to persist between frames (different backends preserve or
// discard arbitrarily — Chrome on macOS Metal happens to discard, which
// shows up as a flicker between "trail visible" and "blank" frames). We
// own the offscreen texture, so loadOp: 'load' on it is well-defined; the
// canvas texture just gets overwritten by this pass each frame.
const BLIT_WGSL = /* wgsl */ `
struct VsOut {
  @builtin(position) clipPos: vec4f,
  @location(0) uv: vec2f,
}

@group(0) @binding(0) var samp: sampler;
@group(0) @binding(1) var tex: texture_2d<f32>;

@vertex
fn vs(@builtin(vertex_index) vi: u32) -> VsOut {
  let corners = array<vec2f, 6>(
    vec2f(-1, -1), vec2f( 1, -1), vec2f(-1,  1),
    vec2f(-1,  1), vec2f( 1, -1), vec2f( 1,  1),
  );
  let c = corners[vi];
  var o: VsOut;
  o.clipPos = vec4f(c, 0.0, 1.0);
  // NDC origin is bottom-left, texture origin is top-left → flip Y so the
  // blit isn't upside-down.
  o.uv = vec2f(c.x * 0.5 + 0.5, 0.5 - c.y * 0.5);
  return o;
}

@fragment
fn fs(in: VsOut) -> @location(0) vec4f {
  return textureSample(tex, samp, in.uv);
}
`;

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
    <span class="doc-eyebrow">EXPERIMENT · 04</span>
    <h1>flowfield-gpu — webgpu compute</h1>
    <p>Identical flowfield to the CPU experiment, run on the GPU. Compute shader: flow + spring + drag + integrate + wrap, one invocation per particle. Render shader: instanced quads from the same buffer, no readback. Default 80,000 particles; push to 500,000 if your hardware likes it.</p>
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
        <span class="experiment-aside-eyebrow">CONTROLS · GPU</span>
        <button type="button" class="playground-reset" data-reset>RESET</button>
      </header>
      <div class="playground-knobs" data-knobs></div>
      <footer class="experiment-aside-foot">
        <code class="playground-code" data-status>booting webgpu…</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);
  root.appendChild(renderFooter());

  const canvas = stage.querySelector<HTMLCanvasElement>('.experiment-canvas')!;
  const wrap = stage.querySelector<HTMLDivElement>('.experiment-canvas-wrap')!;
  const knobsHost = stage.querySelector<HTMLDivElement>('[data-knobs]')!;
  const resetBtn = stage.querySelector<HTMLButtonElement>('[data-reset]')!;
  const statusEl = stage.querySelector<HTMLElement>('[data-status]')!;

  const INITIAL_W = 720;
  const INITIAL_H = 480;
  let W = INITIAL_W;
  let H = INITIAL_H;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  // WebGPU canvas needs explicit pixel dimensions (CSS sizing is for
  // layout only; the back-buffer size is `width`/`height` attrs).
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);

  // Mutable state read by the per-frame uniform writer.
  const state = {
    flowSpeed: DEFAULTS.flowSpeed,
    flowScale: DEFAULTS.flowScale,
    flowLookahead: DEFAULTS.flowLookahead,
    springK: DEFAULTS.springK,
    springC: DEFAULTS.springC,
    drag: DEFAULTS.drag,
    particleSize: DEFAULTS.particleSize,
    trailAlpha: DEFAULTS.trailAlpha,
    scatterKick: DEFAULTS.scatterKick,
    scatterSoftness: DEFAULTS.scatterSoftness,
    particleCount: DEFAULTS.particleCount,
    pendingKick: 0,
    pendingCursor: { x: 0, y: 0 },
  };

  let cleanupFns: Array<() => void> = [];
  const onCleanup = (fn: () => void): void => { cleanupFns.push(fn); };

  // ─── WebGPU init ─────────────────────────────────────────────────────────
  const init = async (): Promise<void> => {
    if (!('gpu' in navigator) || !navigator.gpu) {
      statusEl.textContent = 'webgpu not supported in this browser · try chrome / edge / firefox-nightly';
      statusEl.style.color = '#f88';
      return;
    }
    const adapter = await navigator.gpu.requestAdapter();
    if (!adapter) {
      statusEl.textContent = 'no webgpu adapter · gpu disabled?';
      statusEl.style.color = '#f88';
      return;
    }
    const device = await adapter.requestDevice();
    onCleanup(() => device.destroy());

    const ctx = canvas.getContext('webgpu') as GPUCanvasContext | null;
    if (!ctx) {
      statusEl.textContent = 'webgpu canvas context unavailable';
      statusEl.style.color = '#f88';
      return;
    }
    const format = navigator.gpu.getPreferredCanvasFormat();
    ctx.configure({ device, format, alphaMode: 'premultiplied' });

    // ─── Shaders ──────────────────────────────────────────────────────────
    const computeModule = device.createShaderModule({ code: COMPUTE_WGSL });
    const particleRenderModule = device.createShaderModule({ code: PARTICLE_RENDER_WGSL });
    const fadeModule = device.createShaderModule({ code: FADE_WGSL });
    const blitModule = device.createShaderModule({ code: BLIT_WGSL });

    // ─── Pipeline layouts ────────────────────────────────────────────────
    // Compute: storage(read_write) particles + uniform(simParams).
    const computeBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
        { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      ],
    });
    const computePipeline = device.createComputePipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [computeBgl] }),
      compute: { module: computeModule, entryPoint: 'main' },
    });

    // Particle render: storage(read) particles + uniform(renderParams).
    const renderBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
        { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const renderPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [renderBgl] }),
      vertex: { module: particleRenderModule, entryPoint: 'vs' },
      fragment: {
        module: particleRenderModule,
        entryPoint: 'fs',
        targets: [{
          format,
          blend: {
            // Premultiplied alpha — matches `alphaMode: 'premultiplied'`
            // on the canvas. Particles compose nicely over the previous
            // frame's faded backdrop.
            color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // Fade: just a uniform.
    const fadeBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      ],
    });
    const fadePipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [fadeBgl] }),
      vertex: { module: fadeModule, entryPoint: 'vs' },
      fragment: {
        module: fadeModule,
        entryPoint: 'fs',
        targets: [{
          format,
          blend: {
            // The fade pass paints `(bg * alpha)` over the previous
            // frame using normal alpha blending → previous frame is
            // dimmed by (1 - alpha). Trail effect drops out for free.
            color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
          },
        }],
      },
      primitive: { topology: 'triangle-list' },
    });

    // ─── Buffers ────────────────────────────────────────────────────────
    // Particle storage: 4 floats × particleCount. (pos.xy, vel.xy)
    let particleBuffer: GPUBuffer;
    let computeBindGroup: GPUBindGroup;
    let renderBindGroup: GPUBindGroup;

    // Compute uniform: 12 floats packed (see Uniforms struct in WGSL).
    const SIM_UNI_BYTES = 64; // padded to 64 — std140-ish vec2 alignment
    const simUniBuf = device.createBuffer({
      size: SIM_UNI_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    onCleanup(() => simUniBuf.destroy());

    const RENDER_UNI_BYTES = 32; // bounds(2) + size + pad + color(4) = 8 floats
    const renderUniBuf = device.createBuffer({
      size: RENDER_UNI_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    onCleanup(() => renderUniBuf.destroy());

    const FADE_UNI_BYTES = 32; // alpha + 3 pads + color(4) = 8 floats
    const fadeUniBuf = device.createBuffer({
      size: FADE_UNI_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    onCleanup(() => fadeUniBuf.destroy());

    const fadeBindGroup = device.createBindGroup({
      layout: fadeBgl,
      entries: [{ binding: 0, resource: { buffer: fadeUniBuf } }],
    });

    // ─── Blit pipeline (offscreen → canvas) ────────────────────────────
    const blitBgl = device.createBindGroupLayout({
      entries: [
        { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
        { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      ],
    });
    const blitPipeline = device.createRenderPipeline({
      layout: device.createPipelineLayout({ bindGroupLayouts: [blitBgl] }),
      vertex: { module: blitModule, entryPoint: 'vs' },
      fragment: { module: blitModule, entryPoint: 'fs', targets: [{ format }] },
      primitive: { topology: 'triangle-list' },
    });
    const sampler = device.createSampler({ magFilter: 'linear', minFilter: 'linear' });

    // Persistent offscreen texture for trail accumulation. Recreated on
    // resize. The fade + particle passes target this; the blit pass reads
    // from it and writes to the swapchain.
    let sceneTex: GPUTexture;
    let sceneView: GPUTextureView;
    let blitBindGroup: GPUBindGroup;
    const recreateSceneTex = (): void => {
      if (sceneTex) sceneTex.destroy();
      sceneTex = device.createTexture({
        size: { width: canvas.width, height: canvas.height },
        format,
        usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
      });
      sceneView = sceneTex.createView();
      blitBindGroup = device.createBindGroup({
        layout: blitBgl,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: sceneView },
        ],
      });
      // Prime the offscreen texture so loadOp: 'load' has known content.
      const e = device.createCommandEncoder();
      e.beginRenderPass({
        colorAttachments: [{
          view: sceneView,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: FADE_RGB[0], g: FADE_RGB[1], b: FADE_RGB[2], a: 1 },
        }],
      }).end();
      device.queue.submit([e.finish()]);
    };

    // Build particle buffer + bind groups. Called on init and on
    // particle-count change (buffer is fixed-size, must recreate).
    const buildParticles = (n: number): void => {
      // Initial seed: random positions across canvas, zero velocity.
      // Float32Array layout: [px, py, vx, vy, px, py, vx, vy, ...]
      const seed = new Float32Array(n * 4);
      for (let i = 0; i < n; i++) {
        seed[i * 4 + 0] = Math.random() * W;
        seed[i * 4 + 1] = Math.random() * H;
        seed[i * 4 + 2] = 0;
        seed[i * 4 + 3] = 0;
      }
      // Drop the previous buffer + groups (held in closure on rebuild).
      // GC will reclaim once nothing references them.
      if (particleBuffer) particleBuffer.destroy();
      particleBuffer = device.createBuffer({
        size: seed.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        mappedAtCreation: true,
      });
      new Float32Array(particleBuffer.getMappedRange()).set(seed);
      particleBuffer.unmap();

      computeBindGroup = device.createBindGroup({
        layout: computeBgl,
        entries: [
          { binding: 0, resource: { buffer: particleBuffer } },
          { binding: 1, resource: { buffer: simUniBuf } },
        ],
      });
      renderBindGroup = device.createBindGroup({
        layout: renderBgl,
        entries: [
          { binding: 0, resource: { buffer: particleBuffer } },
          { binding: 1, resource: { buffer: renderUniBuf } },
        ],
      });
      state.particleCount = n;
    };
    buildParticles(DEFAULTS.particleCount);
    onCleanup(() => particleBuffer?.destroy());

    // ─── Per-frame uniforms scratch buffers (reused, no GC) ─────────────
    const simScratch = new Float32Array(SIM_UNI_BYTES / 4);
    const renderScratch = new Float32Array(RENDER_UNI_BYTES / 4);
    const fadeScratch = new Float32Array(FADE_UNI_BYTES / 4);

    // theme is unused for now (PARTICLE_RGB / FADE_RGB live at module scope
    // because recreateSceneTex needs them at pipeline init time). A later
    // pass can wire palette-derived colors through.
    void theme;

    // Initial scene texture + initial swapchain clear. The offscreen tex
    // is what we accumulate trails into across frames.
    recreateSceneTex();
    onCleanup(() => sceneTex?.destroy());

    let lastT = performance.now();
    let raf = 0;
    statusEl.textContent = `webgpu · ${state.particleCount.toLocaleString()} particles`;
    statusEl.style.color = '';

    const tick = (now: number): void => {
      raf = requestAnimationFrame(tick);
      const dt = Math.min(0.05, (now - lastT) / 1000);
      lastT = now;

      // Sim uniforms.
      let i = 0;
      simScratch[i++] = now / 1000;       // time
      simScratch[i++] = dt;
      simScratch[i++] = state.flowScale;
      simScratch[i++] = state.flowLookahead;
      simScratch[i++] = state.flowSpeed;
      simScratch[i++] = state.springK;
      simScratch[i++] = state.springC;
      simScratch[i++] = state.drag;
      simScratch[i++] = W; simScratch[i++] = H;            // bounds
      simScratch[i++] = state.pendingCursor.x;             // cursor.x
      simScratch[i++] = state.pendingCursor.y;             // cursor.y
      simScratch[i++] = state.pendingKick;
      simScratch[i++] = state.scatterSoftness;
      device.queue.writeBuffer(simUniBuf, 0, simScratch.buffer, simScratch.byteOffset, SIM_UNI_BYTES);

      // One-shot click impulse — consume after this frame.
      state.pendingKick = 0;

      // Render uniforms.
      renderScratch[0] = W;
      renderScratch[1] = H;
      renderScratch[2] = state.particleSize * dpr;
      renderScratch[3] = 0;
      renderScratch[4] = PARTICLE_RGB[0];
      renderScratch[5] = PARTICLE_RGB[1];
      renderScratch[6] = PARTICLE_RGB[2];
      renderScratch[7] = 1.0;
      device.queue.writeBuffer(renderUniBuf, 0, renderScratch.buffer, renderScratch.byteOffset, RENDER_UNI_BYTES);

      // Fade uniforms.
      fadeScratch[0] = state.trailAlpha;
      fadeScratch[1] = 0; fadeScratch[2] = 0; fadeScratch[3] = 0;
      fadeScratch[4] = FADE_RGB[0];
      fadeScratch[5] = FADE_RGB[1];
      fadeScratch[6] = FADE_RGB[2];
      fadeScratch[7] = 1.0;
      device.queue.writeBuffer(fadeUniBuf, 0, fadeScratch.buffer, fadeScratch.byteOffset, FADE_UNI_BYTES);

      // ─── Encode the frame ──────────────────────────────────────────────
      const encoder = device.createCommandEncoder();

      // Compute pass — one workgroup per ceil(N/64).
      {
        const cpass = encoder.beginComputePass();
        cpass.setPipeline(computePipeline);
        cpass.setBindGroup(0, computeBindGroup);
        const groups = Math.ceil(state.particleCount / 64);
        cpass.dispatchWorkgroups(groups);
        cpass.end();
      }

      // Pass A: fade + particles → persistent offscreen texture. We own
      // this texture, so loadOp: 'load' is well-defined here (unlike on
      // the swapchain texture, where it's implementation-dependent).
      {
        const rpass = encoder.beginRenderPass({
          colorAttachments: [{
            view: sceneView,
            loadOp: 'load',
            storeOp: 'store',
          }],
        });
        rpass.setPipeline(fadePipeline);
        rpass.setBindGroup(0, fadeBindGroup);
        rpass.draw(6);
        rpass.setPipeline(renderPipeline);
        rpass.setBindGroup(0, renderBindGroup);
        rpass.draw(6, state.particleCount);
        rpass.end();
      }

      // Pass B: blit offscreen → swapchain. Full overwrite so loadOp:
      // 'clear' is correct (no trail accumulation needed at this stage —
      // the offscreen already has the fully composed frame).
      {
        const swapView = ctx.getCurrentTexture().createView();
        const rpass = encoder.beginRenderPass({
          colorAttachments: [{
            view: swapView,
            loadOp: 'clear',
            storeOp: 'store',
            clearValue: { r: 0, g: 0, b: 0, a: 1 },
          }],
        });
        rpass.setPipeline(blitPipeline);
        rpass.setBindGroup(0, blitBindGroup);
        rpass.draw(6);
        rpass.end();
      }

      device.queue.submit([encoder.finish()]);
    };

    raf = requestAnimationFrame(tick);
    onCleanup(() => cancelAnimationFrame(raf));

    // Expose buildParticles to the count knob — captured via closure.
    // Stored on a "private" prop of state for the knob's apply callback.
    (state as Record<string, unknown>)._rebuild = (n: number) => buildParticles(n);

    // ─── Resize ─────────────────────────────────────────────────────────
    // Recreate the offscreen scene texture at the new size; the next blit
    // pass repaints the swapchain. The previous trail content is lost on
    // resize — acceptable trade-off for cleanly-sized buffers.
    const onResize = (w: number, h: number): void => {
      W = w; H = h;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      recreateSceneTex();
    };

    const fs = attachFullscreenButton({
      wrap,
      restoreWidth: INITIAL_W,
      restoreHeight: INITIAL_H,
      onResize,
    });
    onCleanup(() => fs.dispose());

    // ─── Click → scatter ────────────────────────────────────────────────
    const onClick = (e: MouseEvent): void => {
      const r = canvas.getBoundingClientRect();
      // Convert CSS pixels to canvas pixels (matches what the compute shader
      // works in: pure pixels relative to W × H, not back-buffer dpr).
      state.pendingKick = state.scatterKick;
      state.pendingCursor.x = (e.clientX - r.left) * (W / r.width);
      state.pendingCursor.y = (e.clientY - r.top) * (H / r.height);
    };
    canvas.addEventListener('click', onClick);
    onCleanup(() => canvas.removeEventListener('click', onClick));
  };

  // ─── Knobs ──────────────────────────────────────────────────────────────
  const knobs: Knob[] = [
    {
      label: 'particles',
      min: 5000,
      max: 500000,
      step: 5000,
      initial: DEFAULTS.particleCount,
      format: (v) => Math.round(v).toLocaleString(),
      apply: (v) => {
        const n = Math.round(v);
        const rebuild = (state as Record<string, unknown>)._rebuild as
          | ((n: number) => void)
          | undefined;
        if (rebuild) {
          rebuild(n);
          statusEl.textContent = `webgpu · ${n.toLocaleString()} particles`;
        }
      },
    },
    { label: 'flow speed',     min: 0,    max: 4,   step: 0.05, initial: DEFAULTS.flowSpeed,       format: (v) => `${v.toFixed(2)}×`, apply: (v) => { state.flowSpeed = v; } },
    { label: 'flow scale',     min: 0.002,max: 0.05,step: 0.001,initial: DEFAULTS.flowScale,       format: (v) => v.toFixed(3),       apply: (v) => { state.flowScale = v; } },
    { label: 'lookahead',      min: 4,    max: 120, step: 1,    initial: DEFAULTS.flowLookahead,   format: (v) => v.toFixed(0),       apply: (v) => { state.flowLookahead = v; } },
    { label: 'spring k',       min: 4,    max: 120, step: 1,    initial: DEFAULTS.springK,         format: (v) => v.toFixed(0),       apply: (v) => { state.springK = v; } },
    { label: 'damping (c)',    min: 0.5,  max: 20,  step: 0.1,  initial: DEFAULTS.springC,         format: (v) => v.toFixed(1),       apply: (v) => { state.springC = v; } },
    { label: 'drag',           min: 0.05, max: 1.5, step: 0.05, initial: DEFAULTS.drag,            format: (v) => v.toFixed(2),       apply: (v) => { state.drag = v; } },
    { label: 'particle size',  min: 0.4,  max: 5,   step: 0.1,  initial: DEFAULTS.particleSize,    format: (v) => `${v.toFixed(1)}px`,apply: (v) => { state.particleSize = v; } },
    { label: 'trail alpha',    min: 0.01, max: 0.6, step: 0.005,initial: DEFAULTS.trailAlpha,      format: (v) => v.toFixed(3),       apply: (v) => { state.trailAlpha = v; } },
    { label: 'scatter kick',   min: 0,    max: 3000,step: 50,   initial: DEFAULTS.scatterKick,     format: (v) => v.toFixed(0),       apply: (v) => { state.scatterKick = v; } },
    { label: 'scatter falloff',min: 0.005,max: 0.5, step: 0.005,initial: DEFAULTS.scatterSoftness, format: (v) => v.toFixed(3),       apply: (v) => { state.scatterSoftness = v; } },
  ];

  const inputs: HTMLInputElement[] = [];
  const valueEls: HTMLSpanElement[] = [];

  knobs.forEach((k, idx) => {
    const w = document.createElement('div');
    w.className = 'pg-knob';
    w.innerHTML = `
      <div class="pg-knob-head">
        <span class="pg-knob-label">${k.label}</span>
        <span class="pg-knob-value" data-knob-value="${idx}">${k.format ? k.format(k.initial) : k.initial}</span>
      </div>
      <input class="pg-knob-slider" type="range"
             min="${k.min}" max="${k.max}" step="${k.step}" value="${k.initial}" />
    `;
    knobsHost.appendChild(w);
    const input = w.querySelector<HTMLInputElement>('input')!;
    const valueEl = w.querySelector<HTMLSpanElement>('.pg-knob-value')!;
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

  // Boot. Catch async failures so the page doesn't blow up on no-WebGPU
  // browsers — the status footer already shows a polite message.
  init().catch((err) => {
    console.error('flowfield-gpu: init failed', err);
    statusEl.textContent = `webgpu init failed · ${String(err)}`;
    statusEl.style.color = '#f88';
  });

  return () => {
    for (const fn of cleanupFns) {
      try { fn(); } catch { /* swallow — best-effort teardown */ }
    }
    cleanupFns = [];
  };
};
