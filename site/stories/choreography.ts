// Choreography story group — transitions on a 2.5–3.5s repeat loop so the
// gesture has time to read. Click any tile to force the next gesture
// immediately (the auto-loop resets and resumes from there).
//
// Each tile uses `runLoop` from ./types to wire timer + click handler;
// the page teardown clears them via the returned `dispose`.

import type { ThemeId } from '../themes';
import { circle, polygon, rect, node } from '@tesyl/screean';
import { dismiss } from '@tesyl/screean';
import { radialImpulse } from '@tesyl/screean';
import { nGon, starVerts } from '../embed';
import { type TileGroup, runLoop, tileStage } from './types';

export const choreographyGroup = (themeId: ThemeId): TileGroup => ({
  title: 'Choreography',
  blurb: 'Transitions as state. Repeats on a ~3s loop so you can read the gesture — click any tile to force the next one.',
  tiles: [
    {
      name: 'dismiss',
      blurb: 'Particles disperse from a point with life decay.',
      code: 'dismiss(particles, { center, impulse, life })',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, { particleCount: 900 });
        const build = () => node(circle({ r: Math.min(w, h) * 0.28 }));
        stage.setScene(build);
        // Step body: dismiss the current cloud, then re-spawn fresh on
        // the same shape. Two-phase so the disperse reads first, then
        // the re-spawn rebuilds — same flow as the original timer-only
        // version, just packaged for click-to-retrigger.
        const step = (): void => {
          dismiss(stage.world.particles, {
            center: { x: w / 2, y: h / 2 },
            impulse: 280,
            life: 0.8,
            lifeJitter: 0.5,
          });
          setTimeout(() => {
            stage.world.particles.length = 0;
            stage.setScene(build);
          }, 480);
        };
        const dispose = runLoop(c, 3000, step);
        return { stage, dispose };
      },
    },
    {
      name: 'radialImpulse',
      blurb: 'A single kick outward. No life decay — particles return.',
      code: 'radialImpulse(particles, { origin, kick })',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, {
          particleCount: 900,
          feelOverrides: { springK: 38, springC: 7 },
        });
        stage.setScene(() => node(circle({ r: Math.min(w, h) * 0.28 })));
        const dispose = runLoop(c, 2500, () => {
          radialImpulse(stage.world.particles, {
            origin: { x: w / 2, y: h / 2 },
            kick: 320,
            softness: 0.15,
          });
        });
        return { stage, dispose };
      },
    },
    {
      name: 'spawn · edge',
      blurb: 'Particles fly in from the edges and bind to the field.',
      code: 'spawn({ origin: { kind: "edge" }, toward })',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, {
          particleCount: 900,
          spawnFrom: 'edge',
        });
        const build = () => node(rect({ w: w * 0.55, h: h * 0.45, radius: Math.min(w, h) * 0.06 }));
        stage.setScene(build);
        const dispose = runLoop(c, 3500, () => {
          stage.world.particles.length = 0;
          stage.setScene(build);
        });
        return { stage, dispose };
      },
    },
    {
      name: 'shape swap',
      blurb: 'Re-bind without re-spawn — particles flow between fields.',
      code: 'scene.bindAll(particles, { kind: "bounds-area" })',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, { particleCount: 900 });
        const builders = [
          () => node(circle({ r: Math.min(w, h) * 0.32 })),
          () => node(polygon({ vertices: nGon(Math.min(w, h) * 0.34, 6) })),
          () => node(polygon({ vertices: starVerts(Math.min(w, h) * 0.34, 5, 0.4) })),
          () => node(rect({ w: w * 0.6, h: h * 0.45, radius: Math.min(w, h) * 0.05 })),
        ];
        let i = 0;
        stage.setScene(builders[i]);
        const dispose = runLoop(c, 2000, () => {
          i = (i + 1) % builders.length;
          stage.setScene(builders[i]);
        });
        return { stage, dispose };
      },
    },
  ],
});
