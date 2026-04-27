// Experiments index page. Lists every experiment registered in
// site/experiments/registry.ts; clicking a card navigates to
// /experiments/<name>.
//
// Why a separate page (vs a section on the landing): experiments are
// in-progress prototypes. Mounting them all at once would be expensive,
// and surfacing them on the landing pollutes the marketing surface with
// half-finished demos. The index gives them a home that's discoverable
// without being center-stage.

import { renderNav, renderFooter } from '../layout';
import { EXPERIMENTS, findExperiment, type Experiment } from '../experiments/registry';

export const renderExperimentsIndex = (): (() => void) => {
  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app mount');
  root.innerHTML = '';

  const worldBehind = document.createElement('div');
  worldBehind.className = 'world-behind';
  worldBehind.setAttribute('aria-hidden', 'true');
  root.appendChild(worldBehind);

  root.appendChild(renderNav({ current: '/experiments' }));

  const head = document.createElement('section');
  head.className = 'doc-head';
  head.innerHTML = `
    <span class="doc-eyebrow">SANDBOX</span>
    <h1>Experiments</h1>
    <p>In-progress component prototypes. Each experiment is a self-contained mount() that demonstrates one or more screean primitives wired through the component layer (button, label, pointerTracker, routePointerEvent).</p>
  `;
  root.appendChild(head);

  const grid = document.createElement('section');
  grid.className = 'experiment-index';
  grid.innerHTML = `<div class="experiment-index-grid"></div>`;
  const gridEl = grid.querySelector<HTMLDivElement>('.experiment-index-grid')!;

  EXPERIMENTS.forEach((e, i) => {
    const card = document.createElement('a');
    card.className = 'surface-card experiment-card';
    card.href = `/experiments/${e.name}`;
    card.innerHTML = `
      <div class="experiment-card-num">${String(i + 1).padStart(2, '0')}</div>
      <h3 class="experiment-card-title">${e.title}</h3>
      <p class="experiment-card-blurb">${e.blurb}</p>
      <div class="experiment-card-topics">
        ${e.topics.map((t) => `<code>${t}</code>`).join('')}
      </div>
      <span class="experiment-card-cta">OPEN →</span>
    `;
    gridEl.appendChild(card);
  });

  root.appendChild(grid);
  root.appendChild(renderFooter());

  return () => {
    // No live state; nothing to dispose.
  };
};

// Render a specific experiment by name. The router invokes this for
// /experiments/<name>. Async because experiments are dynamically imported —
// this keeps the bundle small and the experiments lazy-loaded.
export const renderExperiment = async (name: string): Promise<() => void> => {
  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app mount');

  const experiment: Experiment | undefined = findExperiment(name);
  if (!experiment) {
    root.innerHTML = '';
    root.appendChild(renderNav({ current: '/experiments' }));
    const notFound = document.createElement('section');
    notFound.className = 'doc-head';
    notFound.innerHTML = `
      <span class="doc-eyebrow">404</span>
      <h1>Experiment not found</h1>
      <p>No experiment registered as <code>${name}</code>. See <a href="/experiments">/experiments</a> for the list.</p>
    `;
    root.appendChild(notFound);
    root.appendChild(renderFooter());
    return () => {};
  }

  // Lazy-import the experiment module + mount.
  const mod = await experiment.load();
  return mod.mount(root);
};
