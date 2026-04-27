// Choreography story group — transitions on a 2.5–3.5s repeat loop so the
// gesture has time to read.
//
// Each tile owns its own setInterval that drives the gesture; the page
// teardown clears them. The big landing-page Choreography Reel is more
// elaborate; this group is the bite-sized reference card.

import type { ThemeId } from '../themes';
import { circle, polygon, rect, node } from 'screean';
import { dismiss } from 'screean';
import { radialImpulse } from 'screean';
import { nGon, starVerts } from '../embed';
import { type TileGroup, tileStage } from './types';

export const choreographyGroup = (themeId: ThemeId): TileGroup => ({
  title: 'Choreography',
  blurb: 'Transitions as state. Repeats on a ~3s loop so you can read the gesture.',
  tiles: [
    {
      name: 'dismiss',
      blurb: 'Particles disperse from a point with life decay.',
      code: 'dismiss(particles, { center, impulse, life })',
      mount: (c, w, h) => {
        const stage = tileStage(c, w, h, themeId, { particleCount: 900 });
        const build = () => node(circle({ r: Math.min(w, h) * 0.28 }));
        stage.setScene(build);
        const timer = setInterval(() => {
          dismiss(stage.world.particles, {
            center: { x: w / 2, y: h / 2 },
            impulse: 280,
            life: 0.8,
            lifeJitter: 0.5,
          });
          // Dismiss kills particles by life-decay; clear the array so the
          // next setScene fresh-spawns. Without this, surviving particles
          // (life > 0 at the timeout boundary) would soft-swap and the
          // demo would read as a flicker rather than a clean re-spawn.
          setTimeout(() => {
            stage.world.particles.length = 0;
            stage.setScene(build);
          }, 480);
        }, 3000);
        return { stage, timer };
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
        const timer = setInterval(() => {
          radialImpulse(stage.world.particles, {
            origin: { x: w / 2, y: h / 2 },
            kick: 320,
            softness: 0.15,
          });
        }, 2500);
        return { stage, timer };
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
        const timer = setInterval(() => {
          stage.world.particles.length = 0;
          stage.setScene(build);
        }, 3500);
        return { stage, timer };
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
        const timer = setInterval(() => {
          i = (i + 1) % builders.length;
          stage.setScene(builders[i]);
        }, 2000);
        return { stage, timer };
      },
    },
  ],
});
