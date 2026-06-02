// Landing page. Sections in document order:
//
//   1. Hero — full-bleed canvas behind a four-corner brutalist frame.
//      Particle copy of the hero word is the visible art; the HTML <h1>
//      sits visually-hidden for screen readers and document outline.
//
//   2. Specsheet — meta-design strip below the hero (theme constants).
//
//   3. Pillars (§ 01 — PRIMITIVES) — three static cards explaining the
//      engine's vocabulary (fields, forces, choreography). Hover-pulls
//      tinted by the chartreuse accent.
//
//   4. Force Playground (§ 02 — FORCES) — INTERACTIVE. A live canvas
//      tied to four sliders (stiffness, damping, shimmer, repel). Wired
//      via Stage.setFeelOverrides so changes are immediately visible
//      in motion. Dispose-clean.
//
//   5. Choreography Reel (§ 03 — CHOREOGRAPHY) — auto-cycling labeled
//      gestures (SPAWN → BIND → IDLE → DISMISS). A tape-deck-style
//      label strip reads which gesture is active. Pause/play toggle.
//
//   6. CTA (§ 04 — STORYBOOK) — final card linking to /components.
//
// Single-theme world: this page only ever renders Acid (themes.ts).
// All theme-dependent values flow via CSS vars or Stage parameters;
// nothing here branches on theme.id.

import type { Theme, ThemeId } from '../themes';
import { THEMES } from '../themes';
import { renderNav, renderFooter, type NavSection } from '../layout';
import { Stage, windowPointer, nGon, starVerts } from '../embed';
import { circle, rect, polygon, text, node } from '@tesyl/screean';
import type { SceneNode } from '@tesyl/screean';
import type { FeelPreset } from '@tesyl/screean';
import { dismiss } from '@tesyl/screean';
import { radialImpulse } from '@tesyl/screean';

// Hero scene cycle. Five distinct shapes; the hero word renders in the
// theme's font. Fallbacks keep things sane when text rasterization isn't
// available (SSR, headless tests).
const safeText = (body: string, font: string, fallbackR: number): SceneNode => {
  if (typeof OffscreenCanvas === 'undefined' || !body) return node(circle({ r: fallbackR }));
  return node(text({ text: body, font }));
};

type HeroSceneSpec = { build: (w: number, h: number) => SceneNode };

const buildHeroSpecs = (theme: Theme): HeroSceneSpec[] => {
  const word = theme.heroWord;
  const family = theme.tokens.fontHead;
  const weight = theme.fontWeight;
  return [
    { build: (w, h) => {
        const R = Math.min(w, h);
        return safeText(word, `${weight} ${Math.round(R * 0.18)}px ${family}`, R * 0.2);
    } },
    { build: (w, h) => node(circle({ r: Math.min(w, h) * 0.18 })) },
    { build: (w, h) => node(polygon({ vertices: starVerts(Math.min(w, h) * 0.18, 6, 0.5) })) },
    { build: (w, h) => {
        const R = Math.min(w, h);
        return node(rect({ w: R * 0.55, h: R * 0.18, radius: R * 0.06 }));
    } },
    { build: (w, h) => node(polygon({ vertices: nGon(Math.min(w, h) * 0.2, 6) })) },
  ];
};

// Section anchors fed into the nav. Order matches DOM order so smooth-scroll
// behavior is intuitive. ids match the section element ids below.
const NAV_SECTIONS: ReadonlyArray<NavSection> = [
  { id: 'primitives',   label: 'Primitives' },
  { id: 'forces',       label: 'Forces' },
  { id: 'choreography', label: 'Choreography' },
  { id: 'storybook',    label: 'Storybook' },
];

// ---- Force Playground definitions -----------------------------------------
//
// Sliders are declarative — `key` references a FeelPreset field, `min/max/
// step` parameterize the input, `format` renders the current value. Defining
// them as a const table keeps the rendering loop dumb and lets tooling
// catch typos via the keyof FeelPreset constraint.

type ForceKnob = {
  key: keyof FeelPreset;
  label: string;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
};

const FORCE_KNOBS: ReadonlyArray<ForceKnob> = [
  { key: 'springK',       label: 'STIFFNESS',  min: 5,   max: 140,  step: 1,   format: (v) => v.toFixed(0) },
  { key: 'springC',       label: 'DAMPING',    min: 0,   max: 30,   step: 0.1, format: (v) => v.toFixed(1) },
  { key: 'shimmerAmp',    label: 'SHIMMER',    min: 0,   max: 30,   step: 0.5, format: (v) => v.toFixed(1) },
  { key: 'repelStrength', label: 'REPEL',      min: 0,   max: 3000, step: 20,  format: (v) => v.toFixed(0) },
];

// Choreography reel — ordered list of labeled steps. Each step provides a
// duration, an effect that runs once when the step starts, and a code
// snippet shown in the side panel so viewers see the exact call being made.
//
// Loops forever (with respect to the rate slider). Click any step in the
// strip to scrub directly to it.
type ChoreoStep = {
  label: string;
  hint: string;
  ms: number;
  // Source-faithful snippet. Shown verbatim in the side panel; intentionally
  // matches what `enter` does so the panel reads as documentation.
  code: string;
  enter: (stage: Stage, w: number, h: number) => void;
};

// One-time per-page-mount: bind hero canvas, mount cards, attach interactions.
// Returns a teardown callback that the router invokes on route change so
// canvases dispose cleanly (avoids RAF + memory accretion).
export const renderLanding = (themeId: ThemeId): (() => void) => {
  const theme = THEMES[themeId];
  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app mount');

  // Wipe + rebuild on every mount. Throwaway DOM is fine — the heavy state
  // lives in Stage instances which we explicitly dispose.
  root.innerHTML = '';

  const worldBehind = document.createElement('div');
  worldBehind.className = 'world-behind';
  worldBehind.setAttribute('aria-hidden', 'true');
  root.appendChild(worldBehind);

  root.appendChild(renderNav({ current: '/', sections: NAV_SECTIONS }));

  // ---- Hero ----------------------------------------------------------------
  const hero = document.createElement('section');
  hero.className = 'hero';
  hero.id = 'hero';
  hero.innerHTML = `
    <canvas class="hero-canvas" aria-hidden="true"></canvas>
    <div class="hero-frame">
      <span class="hero-mark hero-mark-tl">[ SCREEAN ]</span>
      <span class="hero-mark hero-mark-tr">${theme.specs[0][1]}</span>
      <span class="hero-mark hero-mark-bl">${theme.tag}</span>
      <span class="hero-mark hero-mark-br">CLICK / DISPERSE</span>
    </div>
    <div class="hero-content">
      <h1 class="hero-title">${theme.heroWord}</h1>
      <p class="hero-blurb">${theme.blurb}</p>
      <p class="hero-deck">A particle-physics engine for living UI. Compose <em>fields</em>, layer <em>forces</em>, and choreograph transitions that feel like matter — not motion curves.</p>
      <div class="hero-actions">
        <a href="/components" class="btn btn-primary">Browse components →</a>
        <a href="#forces" class="btn btn-ghost">Try the playground</a>
      </div>
    </div>
  `;
  root.appendChild(hero);

  // Specsheet — meta-design strip directly under the hero.
  const specsheet = document.createElement('section');
  specsheet.className = 'specsheet';
  specsheet.innerHTML = `
    <div class="specsheet-inner">
      ${theme.specs.map(([k, v], i) => `
        <div class="spec-cell">
          <span class="spec-key">${String(i + 1).padStart(2, '0')} · ${k}</span>
          <span class="spec-val">${v}</span>
        </div>
      `).join('')}
    </div>
  `;
  root.appendChild(specsheet);

  const heroCanvas = hero.querySelector<HTMLCanvasElement>('.hero-canvas');
  if (!heroCanvas) throw new Error('hero canvas missing');

  const sizeHero = (): { w: number; h: number } => {
    const rectBox = hero.getBoundingClientRect();
    return { w: Math.max(320, rectBox.width), h: Math.max(360, rectBox.height) };
  };

  const { w: hw, h: hh } = sizeHero();
  heroCanvas.style.width = `${hw}px`;
  heroCanvas.style.height = `${hh}px`;

  const heroStage = new Stage({
    canvas: heroCanvas,
    width: hw,
    height: hh,
    feel: theme.feel,
    feelOverrides: theme.feelOverrides,
    palette: theme.palette,
    particleCount: 8000,
    spawnFrom: 'edge',
    spawnSpeed: 360,
    pointerProvider: windowPointer,
    pointerStrength: 4500,
    portal: false,
    particleSize: 1.0,
    trailAlpha: 0.16,
  });

  const heroSpecs = buildHeroSpecs(theme);
  let heroIndex = 0;
  heroStage.setScene(heroSpecs[0].build);

  let cycleTimer: ReturnType<typeof setTimeout>;
  const scheduleCycle = (ms = 4500) => {
    cycleTimer = setTimeout(() => {
      heroIndex = (heroIndex + 1) % heroSpecs.length;
      heroStage.setScene(heroSpecs[heroIndex].build);
      scheduleCycle();
    }, ms);
  };
  scheduleCycle();

  heroCanvas.addEventListener('pointerdown', (e) => {
    const r = heroCanvas.getBoundingClientRect();
    dismiss(heroStage.world.particles, {
      center: { x: e.clientX - r.left, y: e.clientY - r.top },
      impulse: 440,
      life: 0.95,
      lifeJitter: 0.6,
    });
    clearTimeout(cycleTimer);
    setTimeout(() => {
      // Dismiss is a destructive transition — by the time we land here we
      // want the cloud GONE so the next scene reads as a re-spawn from the
      // edges, not a flow from leftover dust. compact() only removed dead
      // particles; for a clean hard reset we wipe the array.
      heroStage.world.particles.length = 0;
      heroIndex = (heroIndex + 1) % heroSpecs.length;
      heroStage.setScene(heroSpecs[heroIndex].build);
      scheduleCycle();
    }, 500);
  });

  let resizeRAF = 0;
  const ro = new ResizeObserver(() => {
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    resizeRAF = requestAnimationFrame(() => {
      const { w, h } = sizeHero();
      heroCanvas.style.width = `${w}px`;
      heroCanvas.style.height = `${h}px`;
      heroStage.resize(w, h);
      heroStage.setScene(heroSpecs[heroIndex].build);
    });
  });
  ro.observe(hero);

  // ---- § 01 — Pillars ------------------------------------------------------
  const pillars = document.createElement('section');
  pillars.className = 'pillars';
  pillars.id = 'primitives';
  pillars.innerHTML = `
    <header class="section-head">
      <span class="section-num">§ 01 — PRIMITIVES</span>
      <h2>Three primitives.<br/>Infinite surface.</h2>
      <p>screean is small on purpose. Three building blocks compose into every interaction the engine ships.</p>
    </header>
    <div class="pillars-grid">
      <article class="surface-card pillar">
        <div class="pillar-num">01 / FIELDS</div>
        <h3>Implicit shape, not pixels.</h3>
        <p>Signed-distance primitives — circle, rect, polygon, text, bitmap. Compose with union, intersect, subtract.</p>
        <code>circle · rect · polygon · text · bitmap</code>
      </article>
      <article class="surface-card pillar">
        <div class="pillar-num">02 / FORCES</div>
        <h3>Acceleration, not animation.</h3>
        <p>Pure kernels. Spring binds particles to fields, drag damps motion, shimmer breathes, neighbors repel.</p>
        <code>spring · drag · shimmer · repel · point</code>
      </article>
      <article class="surface-card pillar">
        <div class="pillar-num">03 / CHOREO</div>
        <h3>Transition is state.</h3>
        <p>Spawn from edges. Dismiss with radial impulse. Swap fields without flicker. Bind to bounds.</p>
        <code>spawn · dismiss · swap · bind · impulse</code>
      </article>
    </div>
  `;
  root.appendChild(pillars);

  // ---- § 02 — Force Playground (interactive) ------------------------------
  // A small Stage tied to four sliders. Each slider mutates the live force
  // stack via setFeelOverrides; the canvas reflects the change on the next
  // tick. Reset restores the theme's resolved feel.

  const PLAYGROUND_SHAPES: ReadonlyArray<{ name: string; build: (w: number, h: number) => SceneNode }> = [
    { name: 'CIRCLE',  build: (w, h) => node(circle({ r: Math.min(w, h) * 0.32 })) },
    { name: 'RECT',    build: (w, h) => {
        const R = Math.min(w, h);
        return node(rect({ w: w * 0.7, h: R * 0.45, radius: R * 0.06 }));
    } },
    { name: 'HEX',     build: (w, h) => node(polygon({ vertices: nGon(Math.min(w, h) * 0.34, 6) })) },
    { name: 'STAR',    build: (w, h) => node(polygon({ vertices: starVerts(Math.min(w, h) * 0.34, 5, 0.4) })) },
  ];

  const playground = document.createElement('section');
  playground.className = 'playground';
  playground.id = 'forces';
  playground.innerHTML = `
    <header class="section-head">
      <span class="section-num">§ 02 — FORCES</span>
      <h2>Tune the physics.<br/>Watch matter answer.</h2>
      <p>Every screean motion is the sum of four kernels. Drag a slider — the cloud responds in real time, no rebuild.</p>
    </header>
    <div class="playground-grid">
      <div class="playground-canvas-wrap surface-card">
        <canvas class="playground-canvas" aria-hidden="true"></canvas>
        <div class="playground-overlay">
          <span class="playground-shape-label">CIRCLE</span>
          <div class="playground-shape-btns" role="group" aria-label="Shape selector"></div>
        </div>
      </div>
      <div class="playground-controls surface-card">
        <header class="playground-controls-head">
          <span class="playground-controls-eyebrow">04 KERNELS</span>
          <button class="playground-reset" type="button">RESET</button>
        </header>
        <div class="playground-knobs"></div>
        <footer class="playground-controls-foot">
          <code class="playground-code">spring(K, C) · shimmer(amp) · neighborRepel(r, F) · drag(d)</code>
        </footer>
      </div>
    </div>
  `;
  root.appendChild(playground);

  const pgCanvas = playground.querySelector<HTMLCanvasElement>('.playground-canvas')!;
  const PG_W = 640;
  const PG_H = 360;
  pgCanvas.style.width = `${PG_W}px`;
  pgCanvas.style.height = `${PG_H}px`;

  const pgStage = new Stage({
    canvas: pgCanvas,
    width: PG_W,
    height: PG_H,
    feel: theme.feel,
    feelOverrides: theme.feelOverrides,
    palette: theme.palette,
    particleCount: 1800,
    spawnFrom: 'center',
    spawnSpeed: 240,
    portal: false,
    particleSize: 1.0,
    trailAlpha: 0.18,
  });

  let pgShapeIndex = 0;
  pgStage.setScene(PLAYGROUND_SHAPES[0].build);

  // Build shape selector buttons.
  const shapeBtnsEl = playground.querySelector<HTMLDivElement>('.playground-shape-btns')!;
  const shapeLabelEl = playground.querySelector<HTMLSpanElement>('.playground-shape-label')!;
  PLAYGROUND_SHAPES.forEach((s, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'playground-shape-btn' + (i === 0 ? ' active' : '');
    b.textContent = s.name;
    b.dataset.idx = String(i);
    b.addEventListener('click', () => {
      pgShapeIndex = i;
      shapeLabelEl.textContent = s.name;
      shapeBtnsEl.querySelectorAll<HTMLButtonElement>('.playground-shape-btn').forEach((btn, j) => {
        btn.classList.toggle('active', j === i);
      });
      pgStage.setScene(s.build);
    });
    shapeBtnsEl.appendChild(b);
  });

  // Build sliders — one per FORCE_KNOBS entry. The current value display
  // is a separate <span> updated on every input event so it tracks the
  // slider thumb without flickering.
  const knobsEl = playground.querySelector<HTMLDivElement>('.playground-knobs')!;
  const initial = pgStage.getResolvedFeel();
  const valueEls = new Map<keyof FeelPreset, HTMLSpanElement>();
  const inputEls = new Map<keyof FeelPreset, HTMLInputElement>();
  for (const knob of FORCE_KNOBS) {
    const row = document.createElement('div');
    row.className = 'pg-knob';
    row.innerHTML = `
      <div class="pg-knob-head">
        <span class="pg-knob-label">${knob.label}</span>
        <span class="pg-knob-value">${knob.format(initial[knob.key])}</span>
      </div>
      <input class="pg-knob-slider" type="range" min="${knob.min}" max="${knob.max}" step="${knob.step}" value="${initial[knob.key]}" />
    `;
    knobsEl.appendChild(row);
    const slider = row.querySelector<HTMLInputElement>('.pg-knob-slider')!;
    const valueEl = row.querySelector<HTMLSpanElement>('.pg-knob-value')!;
    valueEls.set(knob.key, valueEl);
    inputEls.set(knob.key, slider);
    slider.addEventListener('input', () => {
      const v = parseFloat(slider.value);
      valueEl.textContent = knob.format(v);
      pgStage.setFeelOverrides({ [knob.key]: v });
    });
  }

  // Reset — restore the theme's resolved feel and re-sync slider UI.
  playground.querySelector<HTMLButtonElement>('.playground-reset')!.addEventListener('click', () => {
    // Re-applying the theme's preset wipes overrides; we then refresh slider
    // displays from the post-reset resolved feel.
    pgStage.retheme(theme.palette, theme.feel, theme.feelOverrides);
    pgStage.setScene(PLAYGROUND_SHAPES[pgShapeIndex].build);
    const fresh = pgStage.getResolvedFeel();
    for (const knob of FORCE_KNOBS) {
      const v = fresh[knob.key];
      valueEls.get(knob.key)!.textContent = knob.format(v);
      inputEls.get(knob.key)!.value = String(v);
    }
  });

  // ---- § 03 — Choreography Reel (the centerpiece) -------------------------
  // Six labeled gestures cycle in order: SPAWN → BIND → SWAP → IDLE →
  // IMPULSE → DISMISS → loop. Each step shows its API call live in the
  // side panel so the section reads as documentation that moves.
  //
  // Three controls:
  //   • PLAY / PAUSE — halts the loop. Click again to resume from the
  //     next step (so the visual definitively advances).
  //   • Rate slider (0.5× – 2×) — scales every step's duration. The
  //     progress bar at the top of the canvas tracks the *scaled* time
  //     remaining, which makes the slider's effect visible immediately.
  //   • Click any step in the strip to scrub.

  const CHOREO_STEPS: ReadonlyArray<ChoreoStep> = [
    {
      label: 'SPAWN',
      hint: 'particles fly in from canvas edges, bind to a disc',
      ms: 1600,
      code: `world.particles.length = 0;
world.addParticles(spawn({
  origin: { kind: 'edge', width, height },
  toward: { x: w/2, y: h/2 },
  speed: 280,
}));
scene.bindAll(world.particles);`,
      enter: (s, w, h) => {
        s.world.particles.length = 0;
        s.setScene(() => node(circle({ r: Math.min(w, h) * 0.3 })));
      },
    },
    {
      label: 'BIND',
      hint: 'rebind to a hexagon — same particles, new shape',
      ms: 1800,
      code: `scene.swapField(
  () => node(polygon({
    vertices: nGon(R, 6),
  })),
);`,
      enter: (s, w, h) => {
        s.setScene(() => node(polygon({ vertices: nGon(Math.min(w, h) * 0.32, 6) })));
      },
    },
    {
      label: 'SWAP',
      hint: 'rebind to a star — flicker-free shape transitions',
      ms: 1800,
      code: `scene.swapField(
  () => node(polygon({
    vertices: starVerts(R, 5, 0.4),
  })),
);`,
      enter: (s, w, h) => {
        s.setScene(() => node(polygon({ vertices: starVerts(Math.min(w, h) * 0.32, 5, 0.4) })));
      },
    },
    {
      label: 'IDLE',
      hint: 'shimmer + neighborRepel keep the cloud alive at rest',
      ms: 2200,
      code: `// Steady-state forces only.
spring · drag · shimmer · neighborRepel`,
      enter: (s) => {
        // No structural change — particles are already bound. The visible
        // state is the breathing motion of the existing forces.
        void s;
      },
    },
    {
      label: 'IMPULSE',
      hint: 'radialImpulse — kick out, no life decay, particles return',
      ms: 1700,
      code: `radialImpulse(world.particles, {
  origin: { x: w/2, y: h/2 },
  kick: 360,
  softness: 0.15,
});`,
      enter: (s, w, h) => {
        radialImpulse(s.world.particles, {
          origin: { x: w / 2, y: h / 2 },
          kick: 360,
          softness: 0.15,
        });
      },
    },
    {
      label: 'DISMISS',
      hint: 'radial impulse + life decay — particles disperse and die',
      ms: 1400,
      code: `dismiss(world.particles, {
  center: { x: w/2, y: h/2 },
  impulse: 320,
  life: 0.85,
  lifeJitter: 0.5,
});`,
      enter: (s, w, h) => {
        dismiss(s.world.particles, {
          center: { x: w / 2, y: h / 2 },
          impulse: 320,
          life: 0.85,
          lifeJitter: 0.5,
        });
      },
    },
  ];

  const reel = document.createElement('section');
  reel.className = 'reel';
  reel.id = 'choreography';
  reel.innerHTML = `
    <header class="section-head">
      <span class="section-num">§ 03 — CHOREOGRAPHY</span>
      <h2>Transition is state.<br/>Watch the loop.</h2>
      <p>Six primitive moves cycle in order. Each one shows the exact API call live; the progress bar tracks step time, the rate slider scales it, and any cell scrubs.</p>
    </header>
    <div class="reel-grid">
      <div class="reel-canvas-wrap surface-card">
        <div class="reel-progress" aria-hidden="true">
          <div class="reel-progress-fill"></div>
          <div class="reel-progress-marks"></div>
        </div>
        <canvas class="reel-canvas" aria-hidden="true"></canvas>
        <div class="reel-overlay">
          <span class="reel-step-counter">STEP 01 / 06</span>
          <span class="reel-step-label" data-step="0">SPAWN</span>
          <span class="reel-step-hint">particles fly in from canvas edges, bind to a disc</span>
        </div>
      </div>
      <div class="reel-strip surface-card">
        <header class="reel-strip-head">
          <span class="reel-strip-eyebrow">06 STEPS</span>
          <div class="reel-strip-controls">
            <button class="reel-toggle" type="button" data-state="play">PAUSE</button>
          </div>
        </header>
        <div class="reel-rate">
          <div class="reel-rate-head">
            <span class="reel-rate-label">RATE</span>
            <span class="reel-rate-value">1.0×</span>
          </div>
          <input class="reel-rate-slider" type="range" min="0.5" max="2" step="0.1" value="1.0" />
          <div class="reel-rate-ticks"><span>0.5×</span><span>1.0×</span><span>2.0×</span></div>
        </div>
        <ol class="reel-steps"></ol>
        <footer class="reel-code-foot">
          <header class="reel-code-head">
            <span class="reel-code-eyebrow">LIVE CALL</span>
            <span class="reel-code-tag" data-step="0">SPAWN</span>
          </header>
          <pre class="reel-code"><code></code></pre>
        </footer>
      </div>
    </div>
  `;
  root.appendChild(reel);

  const reelCanvas = reel.querySelector<HTMLCanvasElement>('.reel-canvas')!;
  // Bigger than before — this is the centerpiece of the section.
  const RL_W = 560;
  const RL_H = 420;
  reelCanvas.style.width = `${RL_W}px`;
  reelCanvas.style.height = `${RL_H}px`;

  const reelStage = new Stage({
    canvas: reelCanvas,
    width: RL_W,
    height: RL_H,
    feel: theme.feel,
    feelOverrides: theme.feelOverrides,
    palette: theme.palette,
    particleCount: 1800,
    spawnFrom: 'edge',
    spawnSpeed: 280,
    portal: false,
    particleSize: 1.0,
    trailAlpha: 0.18,
  });

  // Render fixed step ticks above the progress bar (visual reference for
  // where each step's chunk lives in the loop).
  const reelMarksEl = reel.querySelector<HTMLDivElement>('.reel-progress-marks')!;
  const totalReelMs = CHOREO_STEPS.reduce((acc, s) => acc + s.ms, 0);
  let stepStartFraction = 0;
  for (const s of CHOREO_STEPS) {
    const mark = document.createElement('span');
    mark.className = 'reel-progress-mark';
    mark.style.left = `${(stepStartFraction * 100).toFixed(2)}%`;
    reelMarksEl.appendChild(mark);
    stepStartFraction += s.ms / totalReelMs;
  }

  // Step list rendering.
  const stepsEl = reel.querySelector<HTMLOListElement>('.reel-steps')!;
  CHOREO_STEPS.forEach((s, i) => {
    const li = document.createElement('li');
    li.className = 'reel-step' + (i === 0 ? ' active' : '');
    li.dataset.idx = String(i);
    li.innerHTML = `
      <span class="reel-step-num">${String(i + 1).padStart(2, '0')}</span>
      <span class="reel-step-name">${s.label}</span>
      <span class="reel-step-meta">${s.ms}MS</span>
    `;
    li.addEventListener('click', () => {
      runStep(i);
    });
    stepsEl.appendChild(li);
  });

  const stepLabelEl = reel.querySelector<HTMLSpanElement>('.reel-step-label')!;
  const stepHintEl = reel.querySelector<HTMLSpanElement>('.reel-step-hint')!;
  const stepCounterEl = reel.querySelector<HTMLSpanElement>('.reel-step-counter')!;
  const codeTagEl = reel.querySelector<HTMLSpanElement>('.reel-code-tag')!;
  const codeEl = reel.querySelector<HTMLElement>('.reel-code code')!;
  const progressFillEl = reel.querySelector<HTMLDivElement>('.reel-progress-fill')!;

  let currentStep = 0;
  let reelTimer: ReturnType<typeof setTimeout> | null = null;
  let reelPaused = false;
  let stepStartedAt = 0;
  let stepDuration = 0;
  let progressRaf = 0;
  let rateMultiplier = 1;

  const tickProgress = () => {
    if (reelPaused || stepDuration === 0) return;
    const elapsed = performance.now() - stepStartedAt;
    const frac = Math.max(0, Math.min(1, elapsed / stepDuration));
    progressFillEl.style.transform = `scaleX(${frac.toFixed(4)})`;
    progressRaf = requestAnimationFrame(tickProgress);
  };

  const runStep = (i: number): void => {
    currentStep = i;
    const step = CHOREO_STEPS[i];
    step.enter(reelStage, RL_W, RL_H);

    // Re-trigger the label's enter animation by removing + re-adding the
    // class. classList.remove + force-reflow + classList.add is the only
    // way to restart a CSS animation reliably in vanilla DOM.
    stepLabelEl.classList.remove('reel-step-label--enter');
    void stepLabelEl.offsetWidth; // force reflow
    stepLabelEl.textContent = step.label;
    stepLabelEl.dataset.step = String(i);
    stepLabelEl.classList.add('reel-step-label--enter');

    stepHintEl.textContent = step.hint;
    stepCounterEl.textContent = `STEP ${String(i + 1).padStart(2, '0')} / ${String(CHOREO_STEPS.length).padStart(2, '0')}`;
    codeTagEl.textContent = step.label;
    codeEl.textContent = step.code;

    stepsEl.querySelectorAll<HTMLLIElement>('.reel-step').forEach((el, j) => {
      el.classList.toggle('active', j === i);
    });

    // Progress bar.
    stepDuration = step.ms / rateMultiplier;
    stepStartedAt = performance.now();
    progressFillEl.style.transform = 'scaleX(0)';
    if (progressRaf) cancelAnimationFrame(progressRaf);
    progressRaf = requestAnimationFrame(tickProgress);

    if (!reelPaused) {
      reelTimer = setTimeout(() => {
        runStep((i + 1) % CHOREO_STEPS.length);
      }, stepDuration);
    }
  };
  runStep(0);

  const reelToggle = reel.querySelector<HTMLButtonElement>('.reel-toggle')!;
  reelToggle.addEventListener('click', () => {
    reelPaused = !reelPaused;
    reelToggle.textContent = reelPaused ? 'PLAY' : 'PAUSE';
    reelToggle.dataset.state = reelPaused ? 'paused' : 'play';
    if (reelPaused) {
      if (reelTimer) { clearTimeout(reelTimer); reelTimer = null; }
      if (progressRaf) { cancelAnimationFrame(progressRaf); progressRaf = 0; }
    } else {
      runStep((currentStep + 1) % CHOREO_STEPS.length);
    }
  });

  // Rate slider — every step's duration is divided by `rateMultiplier`.
  // We update the multiplier on input, then if currently playing we restart
  // the current step's timer with the new duration so the change is felt
  // immediately rather than waiting for the next step boundary.
  const rateSlider = reel.querySelector<HTMLInputElement>('.reel-rate-slider')!;
  const rateValueEl = reel.querySelector<HTMLSpanElement>('.reel-rate-value')!;
  rateSlider.addEventListener('input', () => {
    rateMultiplier = parseFloat(rateSlider.value);
    rateValueEl.textContent = `${rateMultiplier.toFixed(1)}×`;
    if (!reelPaused) {
      // Recompute remaining time on current step. Time elapsed so far is
      // sticky; only the *remaining* portion gets re-scaled.
      const elapsed = performance.now() - stepStartedAt;
      const elapsedFrac = Math.min(1, elapsed / stepDuration);
      const newDuration = CHOREO_STEPS[currentStep].ms / rateMultiplier;
      stepDuration = newDuration;
      stepStartedAt = performance.now() - elapsedFrac * newDuration;
      if (reelTimer) clearTimeout(reelTimer);
      const remaining = Math.max(0, (1 - elapsedFrac) * newDuration);
      reelTimer = setTimeout(() => {
        runStep((currentStep + 1) % CHOREO_STEPS.length);
      }, remaining);
    }
  });

  // ---- § 04 — CTA ---------------------------------------------------------
  const cta = document.createElement('section');
  cta.className = 'cta';
  cta.id = 'storybook';
  cta.innerHTML = `
    <div class="surface-card cta-card">
      <span class="section-num">§ 04 — STORYBOOK</span>
      <h2>Every primitive.<br/>Every force.<br/>Live, labeled.</h2>
      <p>The reference plate. Click any snippet to copy.</p>
      <div class="cta-actions">
        <a href="/components" class="btn btn-primary">Browse components →</a>
        <a href="/lab.html" data-external class="btn btn-ghost">Open the lab</a>
      </div>
    </div>
  `;
  root.appendChild(cta);

  root.appendChild(renderFooter());

  // ---- Teardown ------------------------------------------------------------
  return () => {
    clearTimeout(cycleTimer);
    if (reelTimer) clearTimeout(reelTimer);
    if (progressRaf) cancelAnimationFrame(progressRaf);
    if (resizeRAF) cancelAnimationFrame(resizeRAF);
    ro.disconnect();
    heroStage.dispose();
    pgStage.dispose();
    reelStage.dispose();
  };
};
