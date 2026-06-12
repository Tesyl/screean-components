// mountLabStory — boots ONE shared transition core per lab page and hands
// it to the active story.
//
// Pattern A rewrite (DECISION-component-rendering-pattern.md). The previous
// version of this file (git history) was the lab's Pattern B engine room:
// a Stage with a force stack, a 12k-particle edge spawn, a camera column it
// recentered by mutating transforms, a DOM mirror reconciled per frame, and
// a choreography runner bursting the bound pool — ~460 lines, all of it the
// machinery `createScreenController` now owns. What remains is the lab's
// actual job: create the controller over the overlay canvas, mount the
// story's real DOM, and wire the kick-mode play gesture.
//
// Layering (same as the button-grid exemplar, scoped to the lab stage):
//   .lab-stage             — gradient backdrop + click surface
//     .lab-content-host    — REAL DOM components (the steady-state UI)
//     .lab-canvas          — particle overlay ABOVE content, pointer-events
//                            none; only paints during a transition cycle
//
// The canvas is stage-sized, not viewport-sized, so the controller gets a
// canvas-local `originOf` — rasterize anchors and spawn centers must land
// in the canvas's own coordinate space or every dissolve re-forms offset
// by the site nav's height.

import { createScreenController } from '../../src/components';
import type { LabStory } from './types';

export type LabHandle = {
  // Kick mode toggle. When `true`, stage clicks thwack live particles away
  // from the cursor — a play gesture for watching the force stack recover.
  // Thwack only acts on a cycle's live particles (the pool is empty at
  // idle), so it's most fun mid-dissolve. When `false` (default) clicks
  // reach the components normally and nothing else happens.
  setKickMode: (on: boolean) => void;
  dispose: () => void;
};

export type LabMountOpts = {
  // The particle overlay canvas (above content, pointer-events: none).
  canvas: HTMLCanvasElement;
  // Where the story appends its real DOM.
  host: HTMLElement;
  // The click surface for kick mode (the stage wrapping host + canvas).
  stage: HTMLElement;
  story: LabStory;
};

export const mountLabStory = (opts: LabMountOpts): LabHandle => {
  const { canvas, host, stage, story } = opts;

  // ONE controller per lab page: world + forces + renderer + rAF + the
  // four-frame machine. Every component the story builds shares it.
  const screen = createScreenController({
    canvas,
    // Canvas-local deployment: anchor elements relative to the canvas, not
    // the viewport (the lab stage sits below the site nav).
    originOf: (el) => {
      const c = canvas.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - c.left, y: r.top - c.top };
    },
    // Don't let the controller inflate the stage canvas to the
    // ScreenProvider's 320×360 viewport floor.
    minView: { w: 60, h: 60 },
  });

  const unmount = story.mount(host, screen);

  let kickMode = false;
  const onStageClick = (e: MouseEvent): void => {
    if (!kickMode) return;
    const r = canvas.getBoundingClientRect();
    screen.thwack(e.clientX - r.left, e.clientY - r.top);
  };
  stage.addEventListener('click', onStageClick);

  return {
    setKickMode: (on) => {
      kickMode = on;
    },
    dispose: () => {
      stage.removeEventListener('click', onStageClick);
      unmount();
      screen.dispose();
    },
  };
};
