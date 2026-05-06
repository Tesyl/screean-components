// ATLAS — three "worlds" arranged in space. Each is a labeled disc;
// hovering one zooms the camera in (via screean's camera.zoomTo). Clicking
// a world doesn't navigate elsewhere in v1 — it's the destination.
//
// The worlds correspond to screean's three load-bearing primitives:
//   • BIND   — particles snap to a field's contour
//   • SWAP   — same pool transitions between fields without re-spawning
//   • DRIFT  — pure forces, no field — the calm of unowned matter
//
// Hover triggers a soft camera nudge toward that world. We don't call
// camera.zoomTo (that fully fits) — instead we modulate `pulse` which
// scales the world's radius. Camera fits work cleanly when there's a
// dedicated "active" world; here the trio reads better with a gentle
// rebreathe.

import { useMemo, useState, type ReactNode } from 'react';
import { useScene } from '../engine/scene';
import { useCanvas } from '../engine/canvas';
import { Link } from '../engine/router';
import { row, world } from '../components/builders';
import type { SceneNode } from 'screean';

const WORLDS = [
  { id: 'bind',  title: 'BIND',  caption: 'CONTOUR / RECRUITED MATTER' },
  { id: 'swap',  title: 'SWAP',  caption: 'POOLED / IDENTITY ACROSS FORM' },
  { id: 'drift', title: 'DRIFT', caption: 'UNBOUND / FORCES, NO FIELD' },
] as const;

type WorldId = (typeof WORLDS)[number]['id'];

const WORLD_R_BASE = 110;
const HOVER_BUMP = 18;

const buildAtlas = (
  w: number,
  h: number,
  state: { hovered: WorldId | null },
): SceneNode => {
  const tiles = WORLDS.map((wd) =>
    world({
      title: wd.title,
      radius: state.hovered === wd.id ? WORLD_R_BASE + HOVER_BUMP : WORLD_R_BASE,
      active: state.hovered === wd.id,
    }),
  );

  // Three planets in a line. Generous gap — the negative space between
  // them carries as much weight as the discs themselves.
  void w; void h;
  return row({ gap: 88, align: 'center' }, tiles);
};

// Mirror tile — invisible disc that catches hover + click.
type MirrorProps = {
  readonly id: WorldId;
  readonly index: number;       // 0..2 left-to-right
  readonly hovered: boolean;
  readonly onHover: (id: WorldId | null) => void;
};

const TILE_GAP = 88;

const WorldMirror = ({ id, index, hovered, onHover }: MirrorProps): ReactNode => {
  const { viewport } = useCanvas();
  const r = hovered ? WORLD_R_BASE + HOVER_BUMP : WORLD_R_BASE;
  // Lay the three tiles horizontally to mirror the scene's row layout.
  const sumW = WORLD_R_BASE * 2 * 3 + TILE_GAP * 2;
  const left0 = viewport.w / 2 - sumW / 2;
  const cx = left0 + index * (WORLD_R_BASE * 2 + TILE_GAP) + WORLD_R_BASE;
  const cy = viewport.h / 2;
  const caption = WORLDS.find((w) => w.id === id)!.caption;
  return (
    <>
      <Link
        to="horizon"
        className="moonshot-world"
        style={{
          left: cx - r,
          top: cy - r,
          width: r * 2,
          height: r * 2,
        }}
        aria-label={`World ${id}`}
        onMouseEnter={() => onHover(id)}
        onMouseLeave={() => onHover(null)}
        onFocus={() => onHover(id)}
        onBlur={() => onHover(null)}
      >
        <span className="moonshot-vh">{id}</span>
      </Link>
      {/* DOM caption — only shows when hovered. Below the disc, mono caps,
          tracking-spaced — matches the cosmographic chrome voice. */}
      <span
        className="moonshot-world-caption"
        data-active={hovered ? 'true' : undefined}
        style={{
          left: cx - 180,
          top: cy + WORLD_R_BASE + HOVER_BUMP + 24,
          width: 360,
        }}
      >
        {caption}
      </span>
    </>
  );
};

export const Atlas = (): ReactNode => {
  const [hovered, setHovered] = useState<WorldId | null>(null);
  const buildFn = useMemo(
    () => (w: number, h: number) => buildAtlas(w, h, { hovered }),
    [hovered],
  );
  useScene('atlas', buildFn, [hovered]);

  return (
    <>
      {WORLDS.map((wd, i) => (
        <WorldMirror
          key={wd.id}
          id={wd.id}
          index={i}
          hovered={hovered === wd.id}
          onHover={setHovered}
        />
      ))}
      <h1 className="moonshot-vh">Atlas — three worlds: bind, swap, drift</h1>
    </>
  );
};
