// Storybook-style component browser. Sidebar nav on the left + a single
// group's tiles mounted in the content pane on the right.
//
// Why a tabbed view instead of one long scroll: the components page mounts
// many particle stages, each owning a canvas + force stack + bound scene.
// Mounting all groups at once meant ~26 simultaneous stages — beyond the
// browser's per-page WebGL context limit (~16) and a steady drag on the
// shared RAF ticker even with Canvas2D. With sidebar tabs, only one group
// (~3–7 tiles) is ever active. Switching disposes the previous group's
// stages cleanly via the existing teardown contract.
//
// URL state: `/components` defaults to the first group; `/components#<slug>`
// jumps directly to that group. Slugs are derived from group titles.
//
// Adding a group: write `site/stories/<group>.ts`, import + append to
// GROUPS below. Order in GROUPS is the order in the sidebar.

import { DEFAULT_THEME, type ThemeId } from '../themes';
import { renderNav, renderFooter } from '../layout';
import { fieldsGroup } from '../stories/fields';
import { compositionGroup } from '../stories/composition';
import { layoutGroup } from '../stories/layout';
import { forcesGroup } from '../stories/forces';
import { presetsGroup } from '../stories/presets';
import { choreographyGroup } from '../stories/choreography';
import { componentsGroup } from '../stories/components';
import { easingGroup } from '../stories/easing';
import { typeGroup } from '../stories/type';
import { TILE_W, TILE_H, type TileGroup, type TileSetup } from '../stories/types';
import { mountScreeanNav, type ScreeanNavHandle } from '../lib/transitions/screeanNav';
import { mountScreeanWipe, type ScreeanWipeHandle } from '../lib/transitions/screeanWipe';

// Slug derivation. Mono-cased, hyphens for spaces — keeps URL-safe and
// matches what `window.location.hash` returns (minus the leading #).
const slugOf = (title: string): string =>
  title.toLowerCase().replace(/\s+/g, '-');

export const renderComponents = (themeId: ThemeId = DEFAULT_THEME): (() => void) => {
  const root = document.getElementById('app');
  if (!root) throw new Error('missing #app mount');
  root.innerHTML = '';

  const worldBehind = document.createElement('div');
  worldBehind.className = 'world-behind components-bg';
  worldBehind.setAttribute('aria-hidden', 'true');
  root.appendChild(worldBehind);

  root.appendChild(renderNav({ current: '/components' }));

  const head = document.createElement('section');
  head.className = 'doc-head';
  head.innerHTML = `
    <span class="doc-eyebrow">storybook</span>
    <h1>Components</h1>
    <p>Every primitive screean ships, in isolation. Pick a category in the sidebar; click any snippet to copy.</p>
  `;
  root.appendChild(head);

  // Order matters — readers expect the engine vocabulary to flow primitive →
  // composed → arranged → animated → composed-into-UI. Editing this list is
  // how you reorder the sidebar; group builders themselves are order-agnostic.
  const groups: TileGroup[] = [
    componentsGroup(themeId),
    fieldsGroup(themeId),
    compositionGroup(themeId),
    layoutGroup(themeId),
    forcesGroup(themeId),
    presetsGroup(themeId),
    typeGroup(themeId),
    choreographyGroup(themeId),
    easingGroup(themeId),
  ];

  // Layout: sidebar + content pane.
  //
  // The sidebar's <ol> is wrapped in a positioning container so the
  // screean nav helper can mount its canvas overlay as a sibling of
  // the items, sized to match the list. The DOM <button>s remain the
  // a11y / source-of-truth layer; the canvas paints the chartreuse
  // active highlight as a particle cloud bound to the active item's
  // rect, flying between items on click.
  const main = document.createElement('section');
  main.className = 'doc-main';
  main.innerHTML = `
    <aside class="doc-sidebar" aria-label="Component groups">
      <div class="doc-nav-wrap">
        <ol class="doc-nav"></ol>
      </div>
    </aside>
    <div class="doc-content"></div>
  `;
  root.appendChild(main);

  const navWrapEl = main.querySelector<HTMLDivElement>('.doc-nav-wrap')!;
  const navEl = main.querySelector<HTMLOListElement>('.doc-nav')!;
  const contentEl = main.querySelector<HTMLDivElement>('.doc-content')!;

  // Build sidebar items.
  groups.forEach((g, i) => {
    const li = document.createElement('li');
    li.className = 'doc-nav-item';
    li.dataset.idx = String(i);
    li.dataset.slug = slugOf(g.title);
    li.innerHTML = `
      <button class="doc-nav-btn" type="button">
        <span class="doc-nav-num">${String(i + 1).padStart(2, '0')}</span>
        <span class="doc-nav-name">${g.title}</span>
        <span class="doc-nav-count">${String(g.tiles.length).padStart(2, '0')}</span>
      </button>
    `;
    navEl.appendChild(li);
  });

  // Currently mounted setups — disposed on group switch + page teardown.
  let currentSetups: TileSetup[] = [];
  let currentIdx = -1;
  // The screean nav handle is mounted lazily AFTER the first
  // renderGroup call — we need the DOM buttons to exist in layout
  // before the helper can measure their rects.
  let navHandle: ScreeanNavHandle | null = null;
  // The wipe handle is mounted once and reused across every group
  // switch. Owns its own canvas + Stage; calling .run() plays a
  // single ~600ms particle pass that masks the DOM swap underneath.
  let wipeHandle: ScreeanWipeHandle | null = null;

  const disposeCurrent = (): void => {
    for (const s of currentSetups) {
      if (s.timer) clearInterval(s.timer);
      s.dispose?.();
      s.stage.dispose();
    }
    currentSetups = [];
  };

  // The actual DOM swap + tile mount logic. Called either directly
  // (initial render — no wipe needed) or via the wipe-bridged path
  // (subsequent group switches). Kept separate so the wipe timing
  // can call it at the wipe's midpoint.
  const swapGroup = (idx: number): void => {
    disposeCurrent();
    const g = groups[idx];

    contentEl.innerHTML = `
      <header class="doc-group-head">
        <span class="doc-group-num">${String(idx + 1).padStart(2, '0')} / ${String(groups.length).padStart(2, '0')}</span>
        <h2>${g.title}</h2>
        <p>${g.blurb}</p>
      </header>
      <div class="doc-grid"></div>
    `;
    const grid = contentEl.querySelector<HTMLDivElement>('.doc-grid')!;

    for (const tile of g.tiles) {
      const card = document.createElement('article');
      card.className = 'surface-card story-card';
      card.innerHTML = `
        <div class="story-canvas-wrap">
          <canvas class="story-canvas"></canvas>
        </div>
        <div class="story-meta">
          <h3>${tile.name}</h3>
          <p>${tile.blurb}</p>
          <button class="story-code" type="button" title="Click to copy">${escapeHtml(tile.code)}</button>
        </div>
      `;
      grid.appendChild(card);

      const canvas = card.querySelector<HTMLCanvasElement>('.story-canvas')!;
      canvas.style.width = `${TILE_W}px`;
      canvas.style.height = `${TILE_H}px`;

      const setup = tile.mount(canvas, TILE_W, TILE_H);
      currentSetups.push(setup);

      const codeBtn = card.querySelector<HTMLButtonElement>('.story-code')!;
      codeBtn.addEventListener('click', () => {
        navigator.clipboard?.writeText(tile.code).then(
          () => {
            codeBtn.classList.add('copied');
            setTimeout(() => codeBtn.classList.remove('copied'), 900);
          },
          () => { /* clipboard denied — non-fatal */ },
        );
      });
    }

    // Update sidebar active state. The class is still toggled (CSS
    // can use it for non-particle hint state — focus rings, dim/bright
    // text), but the chartreuse fill itself is now painted by the
    // screean nav's particle cloud, not by the .active class's
    // background-color. The CSS rules were updated accordingly.
    navEl.querySelectorAll<HTMLLIElement>('.doc-nav-item').forEach((el, i) => {
      el.classList.toggle('active', i === idx);
    });
    currentIdx = idx;
    // Tell the particle nav to fly the highlight to the new item.
    navHandle?.setActive(idx);
  };

  // Outer renderGroup — no-op if already on idx; otherwise plays the
  // wipe + swaps at midpoint. Initial render bypasses the wipe so
  // first-paint isn't preceded by a 600ms wipe of empty content.
  const renderGroup = (idx: number): void => {
    if (idx === currentIdx) return;
    if (currentIdx === -1 || !wipeHandle) {
      // First render or wipe not yet mounted — straight swap.
      swapGroup(idx);
      return;
    }
    // Subsequent render — bridge with a wipe. The DOM swap runs at
    // the wipe's midpoint (300ms in) so the chartreuse bar masks the
    // moment of change. New tiles spawn while the bar exits stage-
    // right, giving the impression of "the new content emerging from
    // the wipe."
    void wipeHandle.run();
    setTimeout(() => swapGroup(idx), 300);
  };

  // Sidebar click → switch group + sync hash.
  navEl.addEventListener('click', (e) => {
    const btn = (e.target as HTMLElement).closest('.doc-nav-btn');
    if (!btn) return;
    const item = btn.closest<HTMLLIElement>('.doc-nav-item');
    if (!item) return;
    const idx = Number(item.dataset.idx);
    if (Number.isNaN(idx)) return;
    renderGroup(idx);
    // Use replaceState so back/forward doesn't track every tab click as
    // a separate history entry — only the first /components visit + any
    // direct deep-links should be in history.
    const slug = item.dataset.slug;
    if (slug) {
      const url = `/components#${slug}`;
      if (window.location.pathname + window.location.hash !== url) {
        window.history.replaceState({}, '', url);
      }
    }
  });

  // Hash-driven deep-link support. Listen for hashchange (e.g. user
  // pastes /components#layout) and switch to the matching group.
  const onHashChange = (): void => {
    const slug = window.location.hash.slice(1);
    if (!slug) return;
    const idx = groups.findIndex((g) => slugOf(g.title) === slug);
    if (idx >= 0) renderGroup(idx);
  };
  window.addEventListener('hashchange', onHashChange);

  // Initial group selection.
  const initialSlug = window.location.hash.slice(1);
  const initialIdx = initialSlug
    ? Math.max(0, groups.findIndex((g) => slugOf(g.title) === initialSlug))
    : 0;
  const startIdx = initialIdx >= 0 ? initialIdx : 0;
  renderGroup(startIdx);

  // Mount the screean nav AFTER the first renderGroup call (sidebar
  // <button>s exist in layout now, so getBoundingClientRect returns
  // real coords). The helper takes over painting the chartreuse
  // active fill; CSS only paints inactive states + hover hints.
  navHandle = mountScreeanNav({
    container: navWrapEl,
    itemSelector: '.doc-nav-btn',
    initialActive: startIdx,
    themeId,
  });

  // Mount the wipe overlay on the content pane. Reused for every
  // subsequent group switch. The first switch picks it up because
  // renderGroup checks `wipeHandle` before deciding to bridge.
  wipeHandle = mountScreeanWipe({
    container: contentEl,
    themeId,
  });

  root.appendChild(renderFooter());

  return () => {
    window.removeEventListener('hashchange', onHashChange);
    navHandle?.dispose();
    navHandle = null;
    wipeHandle?.dispose();
    wipeHandle = null;
    disposeCurrent();
  };
};


// Tiny HTML escape — only used for code snippets. Avoids a DOM parser just
// to render a few characters.
const escapeHtml = (s: string): string =>
  s.replace(/[&<>"']/g, (c) => {
    switch (c) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      case "'": return '&#39;';
      default: return c;
    }
  });
