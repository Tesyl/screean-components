// Lab page — sidebar of stories on the left, live canvas + tabbed
// controls panel on the right. The lab is for designing the choreography,
// forces, and per-component props of each component in the library.
//
// /lab           → index (lists stories, redirects to first)
// /lab/<name>    → mounts that story with controls
//
// State across stories is preserved (Forces, Globals, Choreography knobs
// shared via module-scoped objects). Per-story props reset to the story's
// defaults when you switch — props are component-specific, so persisting
// them across stories doesn't make sense.

import { renderNav, renderFooter } from '../layout';
import { mountLabStory, type LabHandle } from '../lab/mount';
import {
  DEFAULT_CHOREO_STATE,
  DEFAULT_FORCE_STATE,
  DEFAULT_GLOBAL_STATE,
  type ChoreoState,
  type ForceState,
  type GlobalState,
  type PropDef,
} from '../lab/types';
import { STORIES, findStory } from '../lab/registry';

// ─── Persistent panel state ─────────────────────────────────────────────────
// Module-scoped so navigation between stories doesn't lose tuning. Reset
// via the panel's "Reset" button (added in Pass B polish).
const forceState: ForceState = { ...DEFAULT_FORCE_STATE };
const globalState: GlobalState = { ...DEFAULT_GLOBAL_STATE };
const choreoState: ChoreoState = { ...DEFAULT_CHOREO_STATE };

// ─── Index — redirect to first story ───────────────────────────────────────
export const renderLabIndex = (): (() => void) => {
  // The lab makes most sense pinned to a specific story. The bare /lab URL
  // redirects to the first registered story so the user always lands on
  // something interactive.
  if (STORIES.length > 0) {
    window.history.replaceState({}, '', `/lab/${STORIES[0].name}`);
    return renderLabStory(STORIES[0].name);
  }
  // No stories registered — render an empty shell so the page doesn't 404.
  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app mount');
  root.innerHTML = '';
  root.appendChild(renderNav({ current: '/lab' }));
  const empty = document.createElement('section');
  empty.className = 'doc-head';
  empty.innerHTML = `<h1>Lab</h1><p>No stories registered yet.</p>`;
  root.appendChild(empty);
  root.appendChild(renderFooter());
  return () => {};
};

// ─── Per-story renderer ─────────────────────────────────────────────────────
export const renderLabStory = (name: string): (() => void) => {
  const story = findStory(name);
  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app mount');
  root.innerHTML = '';
  root.appendChild(renderNav({ current: '/lab' }));

  if (!story) {
    const notFound = document.createElement('section');
    notFound.className = 'doc-head';
    notFound.innerHTML = `<h1>Story not found</h1><p>No story registered as <code>${name}</code>.</p>`;
    root.appendChild(notFound);
    root.appendChild(renderFooter());
    return () => {};
  }

  // ─── Layout shell ────────────────────────────────────────────────────────
  const layout = document.createElement('section');
  layout.className = 'lab-layout';
  layout.innerHTML = `
    <aside class="lab-sidebar surface-card" aria-label="Stories">
      <header class="lab-sidebar-head">
        <span class="lab-sidebar-eyebrow">STORIES</span>
      </header>
      <nav class="lab-stories">
        ${STORIES
          .map(
            (s) => `<a href="/lab/${s.name}" data-lab-story="${s.name}" class="lab-story-link${s.name === name ? ' active' : ''}">${s.title}</a>`,
          )
          .join('')}
      </nav>
    </aside>
    <main class="lab-main">
      <header class="lab-doc-head">
        <span class="doc-eyebrow">LAB</span>
        <h1>${story.title}</h1>
        <p>${story.blurb}</p>
      </header>
      <div class="lab-stage surface-card">
        <canvas class="lab-canvas" aria-hidden="true"></canvas>
        <div class="lab-mirror-host" data-role="lab-mirror-host"></div>
      </div>
      <section class="lab-controls surface-card">
        <div class="lab-tabs" role="tablist">
          <button class="lab-tab active" role="tab" data-tab="props">Props</button>
          <button class="lab-tab" role="tab" data-tab="forces">Forces</button>
          <button class="lab-tab" role="tab" data-tab="choreo">Choreography</button>
          <button class="lab-tab" role="tab" data-tab="globals">Globals</button>
          <button class="lab-tab" role="tab" data-tab="code">Code</button>
        </div>
        <div class="lab-tab-panels">
          <div class="lab-tab-panel active" data-panel="props"></div>
          <div class="lab-tab-panel" data-panel="forces"></div>
          <div class="lab-tab-panel" data-panel="choreo">
            <p class="lab-coming-soon">Choreography knobs land in Pass B.</p>
          </div>
          <div class="lab-tab-panel" data-panel="globals"></div>
          <div class="lab-tab-panel" data-panel="code">
            <pre class="lab-code"><code data-role="code"></code></pre>
          </div>
        </div>
      </section>
    </main>
  `;
  root.appendChild(layout);
  root.appendChild(renderFooter());

  const canvas = layout.querySelector<HTMLCanvasElement>('.lab-canvas')!;
  const mirrorHost = layout.querySelector<HTMLDivElement>('.lab-mirror-host')!;
  const propsPanel = layout.querySelector<HTMLDivElement>('[data-panel="props"]')!;
  const forcesPanel = layout.querySelector<HTMLDivElement>('[data-panel="forces"]')!;
  const globalsPanel = layout.querySelector<HTMLDivElement>('[data-panel="globals"]')!;
  const codeEl = layout.querySelector<HTMLElement>('[data-role="code"]')!;

  // Per-story props (reset to story defaults — they're component-specific).
  const propValues: Record<string, unknown> = { ...story.defaultProps };

  // Mount the live story. The handle exposes setters the panels write to.
  const handle: LabHandle = mountLabStory({
    canvas,
    mirrorHost,
    story,
    initialProps: propValues,
    initialForces: forceState,
    initialGlobals: globalState,
    initialChoreo: choreoState,
  });

  // ─── Props panel ────────────────────────────────────────────────────────
  story.propDefs.forEach((def) => {
    propsPanel.appendChild(renderKnob(def, propValues, (key, val) => {
      propValues[key] = val;
      handle.setProps({ [key]: val });
      refreshCode();
    }));
  });

  // ─── Forces panel ───────────────────────────────────────────────────────
  const FORCE_DEFS: PropDef[] = [
    { kind: 'number', key: 'springK',       label: 'spring K',       min: 4,    max: 140,  step: 1,    format: (v) => v.toFixed(0) },
    { kind: 'number', key: 'springC',       label: 'spring C',       min: 0.5,  max: 30,   step: 0.1,  format: (v) => v.toFixed(1) },
    { kind: 'number', key: 'drag',          label: 'drag',           min: 0.05, max: 1.5,  step: 0.05, format: (v) => v.toFixed(2) },
    { kind: 'number', key: 'shimmerAmp',    label: 'shimmer amp',    min: 0,    max: 24,   step: 0.5,  format: (v) => v.toFixed(1) },
    { kind: 'number', key: 'shimmerFreq',   label: 'shimmer freq',   min: 0,    max: 6,    step: 0.1,  format: (v) => v.toFixed(1) },
    { kind: 'number', key: 'repelRadius',   label: 'repel radius',   min: 0,    max: 40,   step: 1,    format: (v) => v.toFixed(0) },
    { kind: 'number', key: 'repelStrength', label: 'repel strength', min: 0,    max: 2000, step: 25,   format: (v) => v.toFixed(0) },
  ];
  FORCE_DEFS.forEach((def) => {
    forcesPanel.appendChild(renderKnob(def, forceState as unknown as Record<string, unknown>, (key, val) => {
      (forceState as unknown as Record<string, unknown>)[key] = val;
      handle.setForces({ ...forceState, [key]: val as number });
    }));
  });

  // ─── Globals panel ──────────────────────────────────────────────────────
  const GLOBAL_DEFS: PropDef[] = [
    { kind: 'number', key: 'particleCount', label: 'particle count', min: 500,  max: 20000, step: 250,  format: (v) => v.toFixed(0) },
    { kind: 'number', key: 'particleSize',  label: 'particle size',  min: 0.4,  max: 4,     step: 0.1,  format: (v) => `${v.toFixed(1)}px` },
    { kind: 'number', key: 'trailAlpha',    label: 'trail alpha',    min: 0.01, max: 0.6,   step: 0.01, format: (v) => v.toFixed(2) },
    { kind: 'number', key: 'spawnSpeed',    label: 'spawn speed',    min: 50,   max: 600,   step: 10,   format: (v) => v.toFixed(0) },
    { kind: 'number', key: 'hueCenter',     label: 'hue center',     min: 0,    max: 360,   step: 1,    format: (v) => `${v.toFixed(0)}°` },
    { kind: 'number', key: 'hueRange',      label: 'hue range',      min: 0,    max: 180,   step: 1,    format: (v) => `${v.toFixed(0)}°` },
    { kind: 'number', key: 'saturation',    label: 'saturation',     min: 0,    max: 1,     step: 0.02, format: (v) => v.toFixed(2) },
    { kind: 'number', key: 'lightness',     label: 'lightness',      min: 0,    max: 1,     step: 0.02, format: (v) => v.toFixed(2) },
  ];
  GLOBAL_DEFS.forEach((def) => {
    globalsPanel.appendChild(renderKnob(def, globalState as unknown as Record<string, unknown>, (key, val) => {
      (globalState as unknown as Record<string, unknown>)[key] = val;
      handle.setGlobals({ [key]: val } as Partial<GlobalState> as GlobalState);
    }));
  });

  // ─── Code tab ───────────────────────────────────────────────────────────
  const refreshCode = (): void => {
    codeEl.textContent = renderTemplate(story.codeTemplate, handle.getProps());
  };
  refreshCode();

  // ─── Tabs ───────────────────────────────────────────────────────────────
  const tabs = layout.querySelectorAll<HTMLButtonElement>('.lab-tab');
  const panels = layout.querySelectorAll<HTMLDivElement>('.lab-tab-panel');
  tabs.forEach((t) => {
    t.addEventListener('click', () => {
      const target = t.dataset.tab!;
      tabs.forEach((b) => b.classList.toggle('active', b === t));
      panels.forEach((p) => p.classList.toggle('active', p.dataset.panel === target));
    });
  });

  return () => {
    handle.dispose();
  };
};

// ─── Knob renderer ──────────────────────────────────────────────────────────
const renderKnob = (
  def: PropDef,
  state: Record<string, unknown>,
  onChange: (key: string, value: unknown) => void,
): HTMLElement => {
  const wrap = document.createElement('div');
  wrap.className = 'pg-knob';
  if (def.kind === 'number') {
    const initial = Number(state[def.key]);
    const fmt = def.format ?? ((v: number) => String(v));
    wrap.innerHTML = `
      <div class="pg-knob-head">
        <span class="pg-knob-label">${def.label}</span>
        <span class="pg-knob-value">${fmt(initial)}</span>
      </div>
      <input class="pg-knob-slider" type="range"
        min="${def.min}" max="${def.max}" step="${def.step}" value="${initial}" />
    `;
    const input = wrap.querySelector<HTMLInputElement>('input')!;
    const valEl = wrap.querySelector<HTMLSpanElement>('.pg-knob-value')!;
    input.addEventListener('input', () => {
      const v = parseFloat(input.value);
      valEl.textContent = fmt(v);
      onChange(def.key, v);
    });
  } else if (def.kind === 'string') {
    wrap.innerHTML = `
      <div class="pg-knob-head">
        <span class="pg-knob-label">${def.label}</span>
      </div>
      <input class="pg-knob-text" type="text" value="${escapeHtml(String(state[def.key] ?? ''))}" />
    `;
    const input = wrap.querySelector<HTMLInputElement>('input')!;
    input.addEventListener('input', () => onChange(def.key, input.value));
  } else if (def.kind === 'boolean') {
    const checked = Boolean(state[def.key]);
    wrap.innerHTML = `
      <label class="pg-knob-bool">
        <input type="checkbox" ${checked ? 'checked' : ''} />
        <span class="pg-knob-label">${def.label}</span>
      </label>
    `;
    const input = wrap.querySelector<HTMLInputElement>('input')!;
    input.addEventListener('change', () => onChange(def.key, input.checked));
  } else if (def.kind === 'enum') {
    wrap.innerHTML = `
      <div class="pg-knob-head">
        <span class="pg-knob-label">${def.label}</span>
      </div>
      <select class="pg-knob-select">
        ${def.options.map((o) => `<option ${state[def.key] === o ? 'selected' : ''} value="${o}">${o}</option>`).join('')}
      </select>
    `;
    const select = wrap.querySelector<HTMLSelectElement>('select')!;
    select.addEventListener('change', () => onChange(def.key, select.value));
  }
  return wrap;
};

const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

const renderTemplate = (tpl: string, props: Record<string, unknown>): string =>
  tpl.replace(/\{\{(\w+)\}\}/g, (_, key) => formatVal(props[key]));

const formatVal = (v: unknown): string => {
  if (typeof v === 'string') return v;
  if (typeof v === 'number') return String(v);
  if (typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
};
