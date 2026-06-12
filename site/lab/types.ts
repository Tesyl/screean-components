// Lab framework — types shared across the per-component stories, the
// mount helper, and the page renderer.
//
// Pattern A rewrite (DECISION-component-rendering-pattern.md). The previous
// contract (git history) was Pattern B shaped: stories returned a scene-graph
// `Component` rebuilt on every prop change, and this file carried the knob
// metadata (PropDef) plus the Stage's force/global/choreo state types. All of
// that was the World/forces/DOM-mirror stack's surface area — the shared
// transition core owns that machinery now, so the contract collapses to the
// one thing a story actually is: a function that mounts REAL DOM into the
// story area and demonstrates its component's interactions.
//
// A `LabStory` exposes:
//   - `name` / `title` / `blurb`: routing slug + sidebar chrome (unchanged —
//     site/router.ts still matches /lab/<name>)
//   - `mount(host, screen)`: append real elements to `host`, wire them to the
//     shared ScreenController, return a teardown
//   - `code`: the usage snippet shown in the Code panel. Static now — the
//     headless factories are interacted with live, not rebuilt from knobs.

import type { ScreenController } from '../../src/components';

export type LabStory = {
  // Slug for the URL: /lab/<name>. Must match `/^[a-z0-9-]+$/`.
  name: string;
  // Display title shown in the sidebar nav.
  title: string;
  // One-line description shown under the title.
  blurb: string;
  // Mount the story's real DOM into `host`. ONE ScreenController per lab
  // page (created by mountLabStory) is shared by everything the story
  // builds — same single-engine layering as the button-grid exemplar.
  // Returns the teardown: dispose components, remove appended nodes.
  mount: (host: HTMLElement, screen: ScreenController) => () => void;
  // Usage snippet for the Code panel (highlighted as TypeScript).
  code: string;
};
