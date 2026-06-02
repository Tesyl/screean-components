/// <reference types="vite/client" />
// p24-binding-parity — proving the backend-aware binding bridge.
//
// Two worlds, identical scene, side-by-side canvases. Left runs on the
// CPU `World`; right tries to run on `WorldGPU` (WebGPU adapter — falls
// back to CPU and labels itself if unavailable).
//
// Both worlds bind the same scene via the new `scene.bindAll(world)`
// overload (P24). The binding bridge — `world.binding()` — routes
// per-leaf target writes through `IBinding.setTargets` on each backend.
// CPU mutates `particles[i].tx/ty` directly; GPU queues writes onto the
// WebGPU shadow + dispatches them on the next tick. Same call site, same
// observable behavior.
//
// The "Disturb" button uses `binding.setVelocityImpulse` on BOTH backends
// to stomp particle velocities — proving that velocity writes also route
// through the binding without a backend-specific code path here. The
// spring then pulls particles back into the bound layout, identically
// on both sides.

import {
  World,
  WorldGPU,
  scene,
  node,
  spring,
  drag as cpuDrag,
  circleField,
  roundedRectField,
  spawn,
  packRGBA,
  Canvas2DRenderer,
  acquireDevice,
  isAcquireFailure,
  type IWorld,
  type SceneNode,
  type Particle,
  type GpuParticleInput,
} from '@tesyl/screean';
import { renderNav, renderFooter } from '../layout';

const W = 480;
const H = 360;
const N = 1500;

const COLORS = {
  cpu: packRGBA(120, 180, 255, 255),
  gpu: packRGBA(255, 140, 200, 255),
};

const composeScene = (): { root: SceneNode; circleLeaf: SceneNode; rectLeaf: SceneNode } => {
  const root = node(null);
  // Centered circle on the left half, rounded rect on the right half.
  const circleLeaf = node(circleField({ cx: 0, cy: 0, r: 60 }), {
    transform: { x: -100, y: 0 },
  });
  const rectLeaf = node(
    roundedRectField({ x: 0, y: 0, w: 130, h: 80, radius: 18 }),
    { transform: { x: 30, y: -40 } },
  );
  root.children.push(circleLeaf, rectLeaf);
  circleLeaf.parent = root;
  rectLeaf.parent = root;
  return { root, circleLeaf, rectLeaf };
};

// Build a CPU world with N particles seeded near the canvas center.
const buildCpuWorld = (color: number): { world: World } => {
  const w = new World({ width: W, height: H, hashCellSize: 24 });
  const ps = spawn({
    n: N,
    origin: { kind: 'point', x: W / 2, y: H / 2 },
    color: color as never,
  });
  // Spread the seed positions a bit so the binding has visible work to do.
  for (let i = 0; i < ps.length; i++) {
    ps[i].x += (Math.random() - 0.5) * 40;
    ps[i].y += (Math.random() - 0.5) * 40;
    ps[i].weight = 1;
  }
  w.addParticles(ps);
  // springK/C from the gpu-engine experiment: critically-damped feel.
  w.setForces([cpuDrag(0.5), spring(60, 6)]);
  return { world: w };
};

// Build a GPU world. Returns null if WebGPU isn't available.
const buildGpuWorld = async (color: number): Promise<{ world: WorldGPU } | null> => {
  const result = await acquireDevice();
  if (isAcquireFailure(result)) return null;
  const w = new WorldGPU({
    device: result.device,
    width: W,
    height: H,
    capacity: N,
  });
  const ps: GpuParticleInput[] = [];
  for (let i = 0; i < N; i++) {
    ps.push({
      x: W / 2 + (Math.random() - 0.5) * 40,
      y: H / 2 + (Math.random() - 0.5) * 40,
      vx: 0, vy: 0,
      tx: 0, ty: 0,
      life: 1,
      color,
    });
  }
  w.setParticles(ps);
  w.setForces(['drag', 'spring'], { drag: 0.5, springK: 60, springC: 6 });
  return { world: w };
};

// Run scene.bindAll(world) and verify the world is positioned. Returns
// nothing — observed via subsequent renders.
const bindWorld = (s: ReturnType<typeof scene>, world: IWorld): void => {
  // The scene was constructed with particleCount: N — the IWorld overload
  // uses that as the budget. Both leaves get equal-split (the policy
  // here is 'bounds-area', which weights by leaf field area; equal also
  // works but bounds-area is the default and more honest about layout).
  s.bindAll(world, { kind: 'bounds-area' });
};

// "Disturb" — velocity impulse on every particle, pushed away from canvas
// center. Routed through the binding so both backends fire the same path.
const disturb = (world: IWorld, count: number): void => {
  const indices: number[] = [];
  const vxs = new Float32Array(count);
  const vys = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    indices.push(i);
    // Random direction × magnitude — same on both worlds because they
    // share the index list (ordering matches). For a strictly identical
    // disturbance pattern, RNG seed would need to match too; here the
    // visual is "scatter, then spring back," which is bystander-readable.
    const angle = Math.random() * Math.PI * 2;
    const mag = 220 + Math.random() * 180;
    vxs[i] = Math.cos(angle) * mag;
    vys[i] = Math.sin(angle) * mag;
  }
  world.binding().setVelocityImpulse(indices, vxs, vys);
};

// Per-GPU-world sync gating. mapAsync can only have one outstanding map per
// buffer at a time; calling syncToShadow every frame races. We throttle: if
// a sync is in flight, this frame reuses the last-synced positions (it's a
// CPU-side draw of stale particle data — visually fine since GPU advances
// only ~16ms/frame).
const gpuSyncState = new WeakMap<WorldGPU, { inFlight: boolean; cached: Particle[] }>();

const renderCanvas = (
  renderer: Canvas2DRenderer,
  world: IWorld,
): void => {
  // Canvas2DRenderer expects a Particle[] — for CPU it's `world.particles`,
  // for GPU we sync the shadow. The render path is intentionally CPU here:
  // the demo isolates the BINDING parity, not the rendering pipeline.
  if (world.backend === 'gpu') {
    const gpu = world as WorldGPU;
    let st = gpuSyncState.get(gpu);
    if (!st) {
      st = { inFlight: false, cached: [] };
      gpuSyncState.set(gpu, st);
    }
    if (!st.inFlight) {
      st.inFlight = true;
      void gpu.syncToShadow().then(() => {
        const ps: Particle[] = [];
        for (let i = 0; i < N; i++) {
          const sp = gpu.getParticle(i);
          ps.push({
            x: sp.x, y: sp.y, vx: sp.vx, vy: sp.vy, tx: sp.tx, ty: sp.ty,
            age: 0, life: sp.life, color: sp.color as never,
            fieldId: null, weight: 1, z: 0, tz: 0, vz: 0,
          });
        }
        st!.cached = ps;
        st!.inFlight = false;
      }).catch(() => { st!.inFlight = false; });
    }
    if (st.cached.length > 0) renderer.draw(st.cached, W, H);
  } else {
    const cpu = world as IWorld & { particles: Particle[] };
    renderer.draw(cpu.particles, W, H);
  }
};

export const mount = (root: HTMLElement): (() => void) => {
  root.innerHTML = '';
  root.appendChild(renderNav({ current: '/experiments' }));

  const head = document.createElement('section');
  head.className = 'doc-head';
  head.innerHTML = `
    <span class="doc-eyebrow">EXPERIMENT · P24</span>
    <h1>binding parity · CPU world ↔ GPU world</h1>
    <p>Same scene, two backends. <code>scene.bindAll(world)</code> writes per-leaf targets through <code>world.binding()</code> — direct mutation on CPU, queued sparse writes on GPU. The "Disturb" button stomps particle velocities through the same <code>IBinding</code> contract; the spring pulls everything back into the bound layout. Visual identicality (within RNG seeding) means the bridge holds.</p>
  `;
  root.appendChild(head);

  const stage = document.createElement('section');
  stage.className = 'experiment-stage';
  stage.innerHTML = `
    <div class="experiment-canvas-wrap surface-card" style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 12px;">
      <figure style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
        <figcaption style="font-size: 11px; letter-spacing: 0.08em; opacity: 0.7;">CPU WORLD</figcaption>
        <canvas data-canvas="cpu" width="${W}" height="${H}" style="width: 100%; height: auto; background: #0c0d10; border-radius: 6px;"></canvas>
        <code data-fps="cpu" style="font-size: 11px; opacity: 0.7;">…</code>
      </figure>
      <figure style="margin: 0; display: flex; flex-direction: column; gap: 6px;">
        <figcaption style="font-size: 11px; letter-spacing: 0.08em; opacity: 0.7;">GPU WORLD</figcaption>
        <canvas data-canvas="gpu" width="${W}" height="${H}" style="width: 100%; height: auto; background: #0c0d10; border-radius: 6px;"></canvas>
        <code data-fps="gpu" style="font-size: 11px; opacity: 0.7;">…</code>
      </figure>
    </div>
    <aside class="experiment-aside surface-card">
      <header class="experiment-aside-head">
        <span class="experiment-aside-eyebrow">CONTROLS</span>
      </header>
      <div style="display: flex; flex-direction: column; gap: 10px; padding: 8px 4px;">
        <button type="button" data-action="disturb" class="playground-reset">DISTURB BOTH</button>
        <button type="button" data-action="rebind" class="playground-reset">RE-BIND</button>
        <p style="margin: 0; font-size: 12px; opacity: 0.75;">
          <strong>Disturb</strong> pushes a velocity impulse through <code>binding.setVelocityImpulse</code> on each backend.
          <strong>Re-bind</strong> calls <code>scene.bindAll(world)</code> again — useful after disturbance to confirm targets stick.
        </p>
      </div>
    </aside>
  `;
  root.appendChild(stage);
  root.appendChild(renderFooter());

  const cpuCanvas = stage.querySelector<HTMLCanvasElement>('[data-canvas="cpu"]')!;
  const gpuCanvas = stage.querySelector<HTMLCanvasElement>('[data-canvas="gpu"]')!;
  const cpuFps = stage.querySelector<HTMLElement>('[data-fps="cpu"]')!;
  const gpuFps = stage.querySelector<HTMLElement>('[data-fps="gpu"]')!;
  const disturbBtn = stage.querySelector<HTMLButtonElement>('[data-action="disturb"]')!;
  const rebindBtn = stage.querySelector<HTMLButtonElement>('[data-action="rebind"]')!;

  // Two scenes — same geometry, separate instances so each owns its own
  // leafIndices map. (Sharing one scene across two worlds technically works
  // but obscures intent; the parity claim is "same scene description ↔ same
  // bound result," not "same scene object.")
  const cpuScene = scene({ particleCount: N }, composeScene().root);
  const gpuScene = scene({ particleCount: N }, composeScene().root);

  // Center both scene roots on the canvas.
  cpuScene.root.transform = { x: W / 2, y: H / 2, sx: 1, sy: 1, rot: 0 };
  gpuScene.root.transform = { x: W / 2, y: H / 2, sx: 1, sy: 1, rot: 0 };

  // Force Canvas2D rendering for both — the demo isolates the BINDING layer,
  // not the rendering pipeline. Using the same renderer on both sides keeps
  // any visual differences purely physical.
  const cpuRenderer = new Canvas2DRenderer({ canvas: cpuCanvas, particleSize: 2.4, trailAlpha: 0.2 });
  const gpuRenderer = new Canvas2DRenderer({ canvas: gpuCanvas, particleSize: 2.4, trailAlpha: 0.2 });

  // Build the worlds.
  const { world: cpuWorld } = buildCpuWorld(COLORS.cpu);
  let gpuWorld: WorldGPU | null = null;
  let gpuFallbackReason: string | null = null;

  let raf = 0;
  let disposed = false;

  const init = async (): Promise<void> => {
    const gpu = await buildGpuWorld(COLORS.gpu);
    if (disposed) return;
    if (gpu) {
      gpuWorld = gpu.world;
    } else {
      gpuFallbackReason = 'WebGPU adapter unavailable on this device';
    }

    // Tick scene reflows (no-op for our static layouts, but the contract).
    cpuScene.tick(0);
    gpuScene.tick(0);

    // ▶ THE PAYOFF: scene.bindAll(world) — backend-aware overload.
    bindWorld(cpuScene, cpuWorld as unknown as IWorld);
    if (gpuWorld) bindWorld(gpuScene, gpuWorld as unknown as IWorld);

    raf = requestAnimationFrame(loop);
  };

  // ─── Frame loop ────────────────────────────────────────────────────────
  let last = performance.now();
  let cpuFpsAcc = 0;
  let gpuFpsAcc = 0;
  let frameCount = 0;

  const loop = (): void => {
    if (disposed) return;
    const now = performance.now();
    const dt = Math.min(0.05, (now - last) / 1000);
    last = now;

    // Step CPU.
    const cpuStart = performance.now();
    cpuWorld.tick(dt);
    renderCanvas(cpuRenderer, cpuWorld as unknown as IWorld);
    cpuFpsAcc += performance.now() - cpuStart;

    // Step GPU.
    if (gpuWorld) {
      const gpuStart = performance.now();
      gpuWorld.tick(dt);
      renderCanvas(gpuRenderer, gpuWorld as unknown as IWorld);
      gpuFpsAcc += performance.now() - gpuStart;
    } else {
      // Show the fallback reason.
      const ctx = gpuCanvas.getContext('2d');
      if (ctx) {
        ctx.fillStyle = '#0c0d10';
        ctx.fillRect(0, 0, W, H);
        ctx.fillStyle = '#888';
        ctx.font = '12px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(gpuFallbackReason ?? 'GPU unavailable', W / 2, H / 2);
      }
    }

    frameCount++;
    if (frameCount >= 30) {
      const cpuMs = (cpuFpsAcc / frameCount).toFixed(2);
      cpuFps.textContent = `cpu · ${cpuMs} ms/frame · n=${N}`;
      if (gpuWorld) {
        const gpuMs = (gpuFpsAcc / frameCount).toFixed(2);
        gpuFps.textContent = `gpu · ${gpuMs} ms/frame · n=${N}`;
      } else {
        gpuFps.textContent = `gpu · unavailable (${gpuFallbackReason ?? 'no adapter'})`;
      }
      cpuFpsAcc = 0;
      gpuFpsAcc = 0;
      frameCount = 0;
    }

    raf = requestAnimationFrame(loop);
  };

  // ─── Controls ──────────────────────────────────────────────────────────
  disturbBtn.addEventListener('click', () => {
    disturb(cpuWorld as unknown as IWorld, N);
    if (gpuWorld) disturb(gpuWorld as unknown as IWorld, N);
  });
  rebindBtn.addEventListener('click', () => {
    bindWorld(cpuScene, cpuWorld as unknown as IWorld);
    if (gpuWorld) bindWorld(gpuScene, gpuWorld as unknown as IWorld);
  });

  void init();

  return () => {
    disposed = true;
    if (raf) cancelAnimationFrame(raf);
    if (gpuWorld) gpuWorld.destroy();
  };
};
