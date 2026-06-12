// Lab page — sidebar of stories on the left, live story area + Code panel
// on the right. The lab is the per-component playground for the headless
// (Pattern A) library: each story mounts REAL DOM components and
// demonstrates their interactions through the shared transition core.
//
// /lab           → index (redirects to first story)
// /lab/<name>    → mounts that story
//
// Pattern A rewrite. The previous version (git history) carried a five-tab
// controls panel (Props / Forces / Choreo / Globals / Code) whose knobs
// drove scene rebuilds and live Stage overrides — the Pattern B surface.
// With real DOM components there is nothing to rebuild: you interact with
// the component itself. What stays is the chrome contract — sidebar nav
// (router still matches /lab/<name>), kick toggle (now screen.thwack), and
// the Code panel (a static usage snippet per story, Prism-highlighted).

import { renderNav, renderFooter } from '../layout';
import { mountLabStory, type LabHandle } from '../lab/mount';
import { STORIES, findStory } from '../lab/registry';
// prism for the Code panel. Imports are side-effecty — the grammar
// registers itself onto the Prism global, the theme CSS injects styles for
// `.token.*` classes that highlightElement assigns.
import Prism from 'prismjs';
import 'prismjs/components/prism-typescript';
import 'prismjs/themes/prism-tomorrow.css';

// Inline SVG icons for the kick-mode toggle. Pointer icon = default state
// (clicks reach the components normally). Hammer icon = active state
// (stage clicks thwack live particles away from the cursor — only visible
// mid-cycle, since the particle pool is empty at idle).
const POINTER_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M5 3l3.5 16 2.7-6.3L18 11.5z"/>
</svg>`;
const HAMMER_ICON_SVG = `<svg viewBox="0 0 24 24" width="16" height="16" stroke="currentColor" stroke-width="1.6" fill="none" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
  <path d="M14 4l6 6-3 3-6-6z"/>
  <path d="M11 7L3.5 14.5a2.12 2.12 0 003 3L14 10"/>
</svg>`;

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
  // Workhorse layout: fullscreen stage + floating glass overlays. Pattern A
  // layering inside the stage (see mount.ts): the content host holds REAL
  // components below; the particle canvas overlays ABOVE with
  // pointer-events: none — it only paints during a transition cycle.
  const layout = document.createElement('section');
  layout.className = 'lab-layout';
  layout.innerHTML = `
    <div class="lab-stage">
      <div class="lab-content-host" data-role="lab-content-host"></div>
      <canvas class="lab-canvas" aria-hidden="true"></canvas>
    </div>

    <aside class="lab-sidebar lab-overlay" aria-label="Stories">
      <header class="lab-sidebar-head">
        <span class="lab-sidebar-eyebrow">LAB</span>
        <h1 class="lab-sidebar-title">${story.title}</h1>
        <p class="lab-sidebar-blurb">${story.blurb}</p>
      </header>
      <nav class="lab-stories" aria-label="Story list">
        ${STORIES
          .map(
            (s) => `<a href="/lab/${s.name}" data-lab-story="${s.name}" class="lab-story-link${s.name === name ? ' active' : ''}">${s.title}</a>`,
          )
          .join('')}
      </nav>
    </aside>

    <button class="lab-kick-toggle lab-overlay" type="button"
      data-role="kick-toggle"
      aria-pressed="false"
      aria-label="Toggle kick mode (click the stage to thwack live particles)"
      title="Thwack live particles on click (off — clicks behave normally)">
      ${POINTER_ICON_SVG}
    </button>

    <section class="lab-controls lab-overlay">
      <div class="lab-tabs" role="tablist">
        <button class="lab-tab active" role="tab" data-tab="code" aria-selected="true">Code</button>
      </div>
      <div class="lab-tab-panels">
        <div class="lab-tab-panel active" data-panel="code">
          <pre class="lab-code"><code data-role="code"></code></pre>
        </div>
      </div>
    </section>
  `;
  root.appendChild(layout);

  const stage = layout.querySelector<HTMLDivElement>('.lab-stage')!;
  const canvas = layout.querySelector<HTMLCanvasElement>('.lab-canvas')!;
  const host = layout.querySelector<HTMLDivElement>('[data-role="lab-content-host"]')!;
  const kickToggle = layout.querySelector<HTMLButtonElement>('[data-role="kick-toggle"]')!;
  const codeEl = layout.querySelector<HTMLElement>('[data-role="code"]')!;

  // Mount: ONE shared ScreenController + the story's real DOM.
  const handle: LabHandle = mountLabStory({ canvas, host, stage, story });

  // ─── Code panel ──────────────────────────────────────────────────────────
  // Static per story — the headless factories are interacted with live, so
  // there are no knob substitutions to re-render. The Prism CSS theme
  // styles tokens via class selectors; the language class on the <code>
  // element is what highlightElement keys off.
  codeEl.className = 'language-typescript';
  codeEl.textContent = story.code;
  Prism.highlightElement(codeEl);

  // ─── Kick-mode toggle ────────────────────────────────────────────────────
  let kickModeOn = false;
  kickToggle.addEventListener('click', () => {
    kickModeOn = !kickModeOn;
    handle.setKickMode(kickModeOn);
    kickToggle.setAttribute('aria-pressed', String(kickModeOn));
    kickToggle.classList.toggle('active', kickModeOn);
    kickToggle.innerHTML = kickModeOn ? HAMMER_ICON_SVG : POINTER_ICON_SVG;
    kickToggle.title = kickModeOn
      ? 'Kick mode ON — stage clicks thwack live particles. Click to disable.'
      : 'Thwack live particles on click (off — clicks behave normally)';
  });

  return () => {
    handle.dispose();
  };
};
