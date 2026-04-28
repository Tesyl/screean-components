// Shared chrome — nav and footer. Single-theme world (Acid), so the
// previous theme-switcher chip strip is gone. The nav now offers
// section anchors on the landing page (rendered as plain links to
// #-fragments) plus the standard cross-page links.
//
// Section anchors are only meaningful on the landing route; rendering
// them on /components would 404-link to nothing. The caller decides via
// `NavOpts.sections`.

export type NavSection = { id: string; label: string };

export type NavOpts = {
  // Path of currently rendered page — used to mark the active link.
  current: string;
  // Optional hash anchors for landing-page section nav. Empty array on
  // the components page so the nav stays flat there.
  sections?: ReadonlyArray<NavSection>;
};

export const renderNav = (opts: NavOpts): HTMLElement => {
  const nav = document.createElement('nav');
  nav.className = 'site-nav';
  const sectionsHtml = (opts.sections ?? [])
    .map((s, i) => {
      const idx = String(i + 1).padStart(2, '0');
      return `<a class="nav-section" href="#${s.id}"><span class="nav-section-num">${idx}</span><span class="nav-section-label">${s.label}</span></a>`;
    })
    .join('');
  nav.innerHTML = `
    <a class="site-brand" href="/" aria-label="screean home">
      <span class="brand-mark" aria-hidden="true"></span>
      <span class="brand-word">screean</span>
    </a>
    ${sectionsHtml ? `<div class="site-nav-sections">${sectionsHtml}</div>` : '<div class="site-nav-spacer"></div>'}
    <div class="site-nav-links">
      <a href="/" data-route="/">Home</a>
      <a href="/components" data-route="/components">Components</a>
      <a href="/experiments" data-route="/experiments">Experiments</a>
      <a href="/lab" data-route="/lab">Lab</a>
      <a href="https://github.com/" data-external target="_blank" rel="noopener">GitHub</a>
    </div>
  `;
  const links = nav.querySelectorAll<HTMLAnchorElement>('.site-nav-links a[data-route]');
  links.forEach((a) => {
    if (a.dataset.route === opts.current) a.classList.add('active');
  });
  return nav;
};

export const renderFooter = (): HTMLElement => {
  const f = document.createElement('footer');
  f.className = 'site-footer';
  f.innerHTML = `
    <div class="site-footer-inner">
      <div class="footer-brand">
        <span class="brand-mark" aria-hidden="true"></span>
        <span>screean</span>
      </div>
      <div class="footer-meta">
        <span>Engine for living UI · ${new Date().getFullYear()}</span>
        <span class="dot">·</span>
        <a href="/components">Components</a>
        <span class="dot">·</span>
        <a href="/lab.html" data-external>Open lab</a>
      </div>
    </div>
  `;
  return f;
};
