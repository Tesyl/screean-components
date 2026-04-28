/// <reference types="vite/client" />
// gpu-engine experiment — the 6ix logo, formed by the new GPU engine.
//
// First end-to-end consumer of the engine's GPU surface (P7b-II + P20):
//   - createRendererAsync({ backend: 'auto' }) → WebGPU → WebGL2 → Canvas2D
//   - createWorld({ backend: 'auto' })         → WorldGPU when an adapter
//                                                 is available, CPU World
//                                                 otherwise.
//
// Same pattern as the six-logo experiment: sample the .glb to a 3D point
// cloud, rotate per frame, project to screen pixels, write each particle's
// spring target. The spring force pulls particles toward the projection;
// click scatters via a one-tick negative point force.
//
// What's new: the physics runs on the GPU when supported. Each frame the
// targets are pushed up via WorldGPU's sparse-write queue; the spring +
// drag kernels integrate; results sync back to a CPU shadow for the
// renderer. (A future phase shares buffers between WorldGPU and
// WebGPURenderer for zero-readback residency.)

import sixLogoGlb from '../assets/6ixLogo.glb?url';

import { renderNav, renderFooter } from '../layout';
import { THEMES, DEFAULT_THEME } from '../themes';
import {
  createWorld,
  createRendererAsync,
  WorldGPU,
  type IWorld,
  type Renderer,
  packRGBA,
  hslToRgb,
  mulberry32,
  spring,
  drag as cpuDrag,
  pointForce,
  radialImpulse,
  type Color,
  type Particle,
  type GpuParticleInput,
  type Rng,
} from 'screean';
import {
  loadGlb,
  sampleSurface,
  centerAndScale,
  type LoadedMesh,
} from '../lib/loaders/gltf';

const DEFAULTS = {
  particleCount: 6000,
  springK: 32,
  springC: 6.5,
  drag: 0.55,
  shimmerAmp: 4,
  shimmerFreq: 1.6,
  rotYspeed: 0.35,        // radians/sec — slow spin
  scatterKick: 1600,      // radial-impulse magnitude — punchy
  scatterSoftness: 0.06,  // 1/d falloff — small = punchy near, gentle far
  cloudScale: 1.0,
  perspective: 580,
  modelRadius: 220,
  modelDepth: 600,
  particleSize: 1.4,
  trailAlpha: 0.18,
};

// 6ix Collective brand-ish hue band. Same palette philosophy as the lab —
// each particle samples once at construction so the cloud has variety.
const COLOR_BAND = { hueCenter: 268, hueRange: 70, sat: 0.78, lit: 0.62 };

const sampleColor = (rng: Rng): Color => {
  const h = (((COLOR_BAND.hueCenter + (rng() - 0.5) * COLOR_BAND.hueRange) + 360) % 360) / 360;
  const [r, g, b] = hslToRgb(h, COLOR_BAND.sat, COLOR_BAND.lit);
  return packRGBA((r * 255) | 0, (g * 255) | 0, (b * 255) | 0, 255);
};

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
  void theme;
  root.innerHTML = '';

  const worldBehind = document.createElement('div');
  worldBehind.className = 'world-behind';
  worldBehind.setAttribute('aria-hidden', 'true');
  root.appendChild(worldBehind);

  root.appendChild(renderNav({ current: '/experiments' }));

  const head = document.createElement('section');
  head.className = 'doc-head';
  head.innerHTML = `
    <span class="doc-eyebrow">EXPERIMENT · 06</span>
    <h1>gpu-engine · 6ix logo on the GPU world</h1>
    <p>The 6ix logo, formed by particles whose physics runs on the new GPU engine. Both halves auto-select: <code>createRendererAsync</code> walks WebGPU → WebGL2 → Canvas2D; <code>createWorld</code> picks GPU compute when an adapter is available, falls back to CPU otherwise. The logo is sampled to a 3D point cloud, rotated each frame, and each particle's spring target is written via the GPU world's sparse-write queue. Click to scatter.</p>
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
        <span class="experiment-aside-eyebrow">BACKEND</span>
      </header>
      <div data-status class="gpu-status">booting renderer + world…</div>
      <header class="experiment-aside-head" style="margin-top: 4px;">
        <span class="experiment-aside-eyebrow">CONTROLS</span>
        <button type="button" class="playground-reset" data-reset>RESET</button>
      </header>
      <div class="playground-knobs" data-knobs></div>
      <footer class="experiment-aside-foot">
        <code class="playground-code" data-fps>click canvas → scatter</code>
      </footer>
    </aside>
  `;
  root.appendChild(stage);
  root.appendChild(renderFooter());

  const canvas = stage.querySelector<HTMLCanvasElement>('.experiment-canvas')!;
  const statusEl = stage.querySelector<HTMLDivElement>('[data-status]')!;
  const knobsHost = stage.querySelector<HTMLDivElement>('[data-knobs]')!;
  const fpsEl = stage.querySelector<HTMLElement>('[data-fps]')!;
  const resetBtn = stage.querySelector<HTMLButtonElement>('[data-reset]')!;

  const W = 720;
  const H = 480;
  canvas.style.width = `${W}px`;
  canvas.style.height = `${H}px`;
  canvas.width = W;
  canvas.height = H;

  // ─── State ──────────────────────────────────────────────────────────────
  type State = {
    rotY: number;
    rotX: number;
    rotYspeed: number;
    cloudScale: number;
    perspective: number;
    particleCount: number;
    springK: number;
    springC: number;
    drag: number;
    points: Float32Array;       // mesh-local 3D point cloud (n × 3)
    pointCount: number;
  };
  const state: State = {
    rotY: 0,
    rotX: -Math.PI / 2,         // stand the Z-up Blender export upright
    rotYspeed: DEFAULTS.rotYspeed,
    cloudScale: DEFAULTS.cloudScale,
    perspective: DEFAULTS.perspective,
    particleCount: DEFAULTS.particleCount,
    springK: DEFAULTS.springK,
    springC: DEFAULTS.springC,
    drag: DEFAULTS.drag,
    points: new Float32Array(0),
    pointCount: 0,
  };

  let cursor = { x: W / 2, y: H / 2 };
  canvas.addEventListener('pointermove', (e) => {
    const r = canvas.getBoundingClientRect();
    cursor.x = e.clientX - r.left;
    cursor.y = e.clientY - r.top;
  });
  // Click → kick. Single-frame radial velocity impulse on every live
  // particle, pushing them away from the cursor. The spring force pulls
  // them back into the logo silhouette over the next ~second. Same shape
  // on both backends — WorldGPU.applyRadialImpulse mirrors the CPU
  // radialImpulse formula exactly.
  canvas.addEventListener('pointerdown', (e) => {
    const r = canvas.getBoundingClientRect();
    cursor.x = e.clientX - r.left;
    cursor.y = e.clientY - r.top;
    if (!world) return;
    if (world.backend === 'gpu') {
      (world as WorldGPU).applyRadialImpulse({
        origin: { x: cursor.x, y: cursor.y },
        kick: DEFAULTS.scatterKick,
        softness: DEFAULTS.scatterSoftness,
      });
    } else {
      const cpu = world as IWorld & { particles: Particle[] };
      radialImpulse(cpu.particles, {
        origin: { x: cursor.x, y: cursor.y },
        kick: DEFAULTS.scatterKick,
        softness: DEFAULTS.scatterSoftness,
      });
    }
  });

  // ─── Async boot ────────────────────────────────────────────────────────
  let renderer: Renderer | null = null;
  let world: IWorld | null = null;
  let mesh: LoadedMesh | null = null;
  let raf = 0;
  let disposed = false;

  // Adapter array reused frame-to-frame for GPU readback rendering.
  const renderParticles: Particle[] = [];

  const init = async (): Promise<void> => {
    statusEl.textContent = 'loading 6ix logo + acquiring devices…';

    [renderer, mesh] = await Promise.all([
      createRendererAsync({
        canvas,
        backend: 'auto',
        particleSize: DEFAULTS.particleSize,
        trailAlpha: DEFAULTS.trailAlpha,
        portalMode: true,
        onFallback: (e) => console.warn('[gpu-engine] renderer fallback:', e.message),
      }),
      loadGlb(sixLogoGlb),
    ]);
    if (disposed) return;

    world = await createWorld({
      width: W,
      height: H,
      backend: 'auto',
      // Allocate the full ceiling up front (32 MB on GPU @ 32 B/particle) so
      // dragging the slider into the millions doesn't trigger geometric grows
      // mid-render. WebGPU's maxStorageBufferBindingSize is typically 128 MB
      // on desktop / 256 MB on Apple Silicon — comfortable headroom.
      capacity: 1_000_000,
      seed: 1,
      onFallback: (e) => console.warn('[gpu-engine] world fallback:', e.message),
    });
    if (disposed) return;

    paintStatus();

    // Sample mesh + spawn particles.
    rebuild(state.particleCount);

    // Render knobs after we know the world is up — applies feed live.
    renderKnobs();

    raf = requestAnimationFrame((n) => void tick(n));
  };

  // ─── Status pill ───────────────────────────────────────────────────────
  const paintStatus = (): void => {
    if (!renderer || !world) return;
    const rg = renderer.backend === 'webgpu';
    const wg = world.backend === 'gpu';
    const tag = (label: string, value: string, hot: boolean): string => `
      <div class="gpu-status-row">
        <span class="gpu-status-label">${label}</span>
        <span class="gpu-status-value ${hot ? 'hot' : 'cool'}">${value}</span>
      </div>
    `;
    statusEl.innerHTML = `
      ${tag('renderer', renderer.backend, rg)}
      ${tag('world', world.backend, wg)}
      <div class="gpu-status-hint">${rg && wg ? 'rendering + simulating on the GPU' : rg ? 'GPU render · CPU physics' : wg ? 'CPU render · GPU physics' : 'CPU render · CPU physics (no adapter)'}</div>
    `;
  };

  // ─── Mesh sampling + particle spawn ────────────────────────────────────
  const rebuild = (n: number): void => {
    if (!world || !mesh) return;
    state.particleCount = n;

    const rng = mulberry32(0xab36c1);
    const cloud = sampleSurface(mesh, n, rng);
    centerAndScale(cloud, mesh.bbox, DEFAULTS.modelRadius);
    state.points = cloud;
    state.pointCount = n;

    // Seed each particle from its initial projected target so the assembly
    // looks like the cloud snaps into place rather than flying in cold.
    const initial = projectAll(cloud, state.rotY, state.rotX, state.cloudScale, state.perspective, W, H);

    if (world.backend === 'gpu') {
      const gpu = world as WorldGPU;
      const ps: GpuParticleInput[] = [];
      for (let i = 0; i < n; i++) {
        const tx = initial[i * 2]!;
        const ty = initial[i * 2 + 1]!;
        // Slight scatter on initial pos so the spring has work to do.
        ps.push({
          x: tx + (rng() - 0.5) * 12,
          y: ty + (rng() - 0.5) * 12,
          vx: 0, vy: 0,
          tx, ty,
          life: 1,
          color: sampleColor(rng) as unknown as number,
        });
      }
      gpu.setParticles(ps);
      gpu.setForces(['drag', 'spring', 'point'], {
        drag: state.drag,
        springK: state.springK,
        springC: state.springC,
        pointStrength: 0,    // overridden each frame from cursor + scatter
        pointSoftness: 30,
        pointX: cursor.x,
        pointY: cursor.y,
      });
    } else {
      const cpu = world as IWorld & {
        particles: Particle[];
        addParticles: (ps: readonly Particle[]) => void;
        setForces: (fs: unknown[]) => void;
      };
      // Wipe + re-add. The CPU World doesn't have a setParticles helper,
      // so we drain particles in place.
      cpu.particles.length = 0;
      const ps: Particle[] = [];
      for (let i = 0; i < n; i++) {
        const tx = initial[i * 2]!;
        const ty = initial[i * 2 + 1]!;
        ps.push({
          x: tx + (rng() - 0.5) * 12,
          y: ty + (rng() - 0.5) * 12,
          vx: 0, vy: 0,
          tx, ty,
          age: 0, life: 1,
          color: sampleColor(rng),
          fieldId: null, weight: 1, z: 0, tz: 0, vz: 0,
        });
      }
      cpu.addParticles(ps);
      cpu.setForces([
        spring(state.springK, state.springC),
        cpuDrag(state.drag),
        // Cursor pull / push — same negative pulse semantics as GPU branch.
        pointForce(() => cursor, 0, 30),
      ]);
    }
  };

  // ─── Projection ────────────────────────────────────────────────────────
  // Rotate Y → rotate X → perspective project. Output buffer is interleaved
  // x,y per particle.
  const projectAll = (
    points: Float32Array,
    rotY: number,
    rotX: number,
    scale: number,
    perspective: number,
    w: number,
    h: number,
  ): Float32Array => {
    const n = points.length / 3;
    const out = new Float32Array(n * 2);
    const cy = Math.cos(rotY), sy = Math.sin(rotY);
    const cx = Math.cos(rotX), sx = Math.sin(rotX);
    const cxCenter = w / 2;
    const cyCenter = h / 2;
    for (let i = 0; i < n; i++) {
      const px = points[i * 3]!;
      const py = points[i * 3 + 1]!;
      const pz = points[i * 3 + 2]!;
      // rotY: rotate around Y axis (x, z plane).
      const x1 = px * cy + pz * sy;
      const z1 = -px * sy + pz * cy;
      // rotX: rotate around X axis (y, z plane).
      const y2 = py * cx - z1 * sx;
      const z2 = py * sx + z1 * cx;
      // Perspective: depth-shifted scale. Larger z2 (closer to camera with
      // our axis convention) ⇒ larger projected coord.
      const dist = perspective + DEFAULTS.modelDepth + z2;
      const k = (perspective / Math.max(1, dist)) * scale;
      out[i * 2] = cxCenter + x1 * k;
      out[i * 2 + 1] = cyCenter + y2 * k;
    }
    return out;
  };

  // ─── Per-frame loop ────────────────────────────────────────────────────
  let last = performance.now();
  let fpsAcc = 0;
  let fpsCount = 0;

  const tick = async (now: number): Promise<void> => {
    if (disposed) return;
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Animate rotation.
    state.rotY += state.rotYspeed * dt;

    // Project all points to current 2D targets.
    const targets = projectAll(
      state.points,
      state.rotY,
      state.rotX,
      state.cloudScale,
      state.perspective,
      W, H,
    );

    // Push targets into the world.
    if (world!.backend === 'gpu') {
      const gpu = world as WorldGPU;
      for (let i = 0; i < state.pointCount; i++) {
        gpu.queueTarget(i, targets[i * 2]!, targets[i * 2 + 1]!);
      }
      // Mild cursor attractor — pulls particles slightly toward the
      // pointer. Real scatter is a click-fired velocity impulse handled
      // by the pointerdown listener, not by this force.
      gpu.setForceConstants({
        pointStrength: 60,
        pointX: cursor.x,
        pointY: cursor.y,
      });
    } else {
      const cpu = world as IWorld & { particles: Particle[] };
      for (let i = 0; i < state.pointCount && i < cpu.particles.length; i++) {
        cpu.particles[i]!.tx = targets[i * 2]!;
        cpu.particles[i]!.ty = targets[i * 2 + 1]!;
      }
    }

    // Step physics.
    world!.tick(dt);

    // Render. CPU world: pass particles directly. GPU world: read shadow.
    if (world!.backend === 'gpu') {
      const gpu = world as WorldGPU;
      await gpu.syncToShadow();
      if (renderParticles.length !== gpu.count) {
        renderParticles.length = 0;
        for (let i = 0; i < gpu.count; i++) {
          renderParticles.push({
            x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0,
            age: 0, life: 1, color: 0 as Color,
            fieldId: null, weight: 1, z: 0, tz: 0, vz: 0,
          });
        }
      }
      for (let i = 0; i < gpu.count; i++) {
        const p = gpu.getParticle(i);
        const a = renderParticles[i]!;
        a.x = p.x; a.y = p.y;
        a.life = p.life;
        a.color = p.color as unknown as Color;
      }
      renderer!.draw(renderParticles, W, H);
    } else {
      const cpu = world as IWorld & { particles: readonly Particle[] };
      renderer!.draw(cpu.particles, W, H);
    }

    // FPS readout.
    fpsAcc += dt;
    fpsCount++;
    if (fpsAcc > 0.5) {
      const fps = (fpsCount / fpsAcc).toFixed(0);
      fpsEl.textContent = `${fps} fps · n=${state.particleCount.toLocaleString()} · click to scatter`;
      fpsAcc = 0;
      fpsCount = 0;
    }

    raf = requestAnimationFrame((n) => void tick(n));
  };

  // ─── Knobs ─────────────────────────────────────────────────────────────
  const KNOBS: Knob[] = [
    {
      // 1k–1M is a 1000× range. Linear slider with step=1000 means the
      // lower-resolution end (e.g. dialing in 8k) needs care — drag slow
      // for fine control. Bumping to 1M makes the readback cost dominate
      // beyond ~100k (sync per frame is 32 MB at full cap); the visual
      // still works but FPS drops. Future work: skip readback when the
      // renderer can read WorldGPU's buffer directly.
      label: 'particles', min: 1000, max: 1_000_000, step: 1000,
      initial: DEFAULTS.particleCount,
      format: (v) => v.toLocaleString(),
      apply: (v) => rebuild(v | 0),
    },
    {
      label: 'spring K', min: 4, max: 80, step: 1,
      initial: DEFAULTS.springK,
      apply: (v) => {
        state.springK = v;
        if (world?.backend === 'gpu') {
          (world as WorldGPU).setForceConstants({ springK: v });
        } else if (world) {
          const cpu = world as IWorld & { setForces: (fs: unknown[]) => void };
          cpu.setForces([
            spring(state.springK, state.springC),
            cpuDrag(state.drag),
            pointForce(() => cursor, 0, 30),
          ]);
        }
      },
    },
    {
      label: 'spring C', min: 0.5, max: 16, step: 0.1,
      initial: DEFAULTS.springC,
      apply: (v) => {
        state.springC = v;
        if (world?.backend === 'gpu') {
          (world as WorldGPU).setForceConstants({ springC: v });
        }
      },
    },
    {
      label: 'drag', min: 0.05, max: 1.2, step: 0.05,
      initial: DEFAULTS.drag,
      apply: (v) => {
        state.drag = v;
        if (world?.backend === 'gpu') {
          (world as WorldGPU).setForceConstants({ drag: v });
        }
      },
    },
    {
      label: 'rotation Y', min: -1.5, max: 1.5, step: 0.05,
      initial: DEFAULTS.rotYspeed,
      apply: (v) => { state.rotYspeed = v; },
    },
    {
      label: 'cloud scale', min: 0.4, max: 1.8, step: 0.05,
      initial: DEFAULTS.cloudScale,
      apply: (v) => { state.cloudScale = v; },
    },
  ];

  const renderKnobs = (): void => {
    knobsHost.innerHTML = '';
    KNOBS.forEach((k) => {
      const wrap = document.createElement('div');
      wrap.className = 'pg-knob';
      const fmt = k.format ?? ((v: number) => v.toString());
      wrap.innerHTML = `
        <div class="pg-knob-head">
          <span class="pg-knob-label">${k.label}</span>
          <span class="pg-knob-value">${fmt(k.initial)}</span>
        </div>
        <input class="pg-knob-slider" type="range"
          min="${k.min}" max="${k.max}" step="${k.step}" value="${k.initial}" />
      `;
      const input = wrap.querySelector<HTMLInputElement>('input')!;
      const valEl = wrap.querySelector<HTMLSpanElement>('.pg-knob-value')!;
      input.addEventListener('input', () => {
        const v = parseFloat(input.value);
        valEl.textContent = fmt(v);
        k.apply(v);
      });
      knobsHost.appendChild(wrap);
    });
  };

  resetBtn.addEventListener('click', () => {
    state.rotY = 0;
    state.rotYspeed = DEFAULTS.rotYspeed;
    state.cloudScale = DEFAULTS.cloudScale;
    state.springK = DEFAULTS.springK;
    state.springC = DEFAULTS.springC;
    state.drag = DEFAULTS.drag;
    rebuild(DEFAULTS.particleCount);
    renderKnobs();
  });

  void init();

  return () => {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    if (world && world.backend === 'gpu') {
      (world as WorldGPU).destroy();
    }
  };
};
