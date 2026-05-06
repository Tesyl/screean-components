// HORIZON — the hero. The wordmark "screean" sits at the visual center of
// a particle universe. It cycles every HERO_CYCLE_MS through three forms:
//
//     screean (display serif) →  ⬡ horizon mark  →  ✶ sigil  →  screean
//
// Two CTAs sit beneath: a primary that goes to /moonshot/atlas and a ghost
// that goes to /moonshot/signal. Hovering either bumps a `pulse` value
// that thickens the rect's corner radius via revisioning.
//
// The DOM mirror is just <Link> elements positioned at the canvas-projected
// CTA bounds + a tiny screen-reader-only headline. All visible "text" lives
// in the canvas.

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useScene } from '../engine/scene';
import { useCanvas } from '../engine/canvas';
import { Link } from '../engine/router';
import { HERO_CYCLE_MS } from '../constant';
import {
  body,
  column,
  cta,
  horizonMark,
  row,
  sigil,
  wordmark,
} from '../components/builders';
import type { SceneNode } from 'screean';

type Phase = 0 | 1 | 2;
type CtaId = 'primary' | 'ghost';

const PRIMARY_W = 320;
const GHOST_W = 290;
const CTA_H = 72;

const buildHero = (
  w: number,
  h: number,
  state: { phase: Phase; hovered: CtaId | null },
): SceneNode => {
  // Underscore-prefix the unused param so TS-strict is happy without
  // changing the signature contract (every screen builder receives w, h).
  void w; void h;
  const R = Math.min(w, h);

  // Centerpiece swaps with phase. Sized similarly so the dispersal +
  // re-coalesce reads as transformation, not replacement.
  const center: SceneNode =
    state.phase === 0
      ? wordmark({ text: 'screean', size: Math.round(R * 0.16), weight: 400 })
      : state.phase === 1
        ? horizonMark(R * 0.13)
        : sigil(R * 0.14);

  // Sub at 38px — small enough to subordinate to the wordmark, big enough
  // that particle rasterization preserves letterform separation. Below
  // ~32px, glyph stems collapse into solid bars with this particle size.
  const sub = body({ text: 'UI made of matter — not divs.', size: 38 });

  const primary = cta({
    label: 'CHART THE ATLAS →',
    variant: 'primary',
    pulse: state.hovered === 'primary' ? 1 : 0,
    width: PRIMARY_W,
    height: CTA_H,
  });
  const ghost = cta({
    label: 'OPEN A CHANNEL',
    variant: 'ghost',
    pulse: state.hovered === 'ghost' ? 0.6 : 0,
    width: GHOST_W,
    height: CTA_H,
  });

  const buttons = row({ gap: 18, align: 'center' }, [primary, ghost]);

  // The hero's canvas content — three leaves only. Chrome (tag, coords,
  // hint) lives in DOM, where it can be hairline mono without competing
  // for particle budget. Pool / 3 leaves = ~7000 particles per leaf →
  // crisp typography, even on the small tagline.
  return column({ gap: 36, align: 'center' }, [center, sub, buttons]);
};

// CTA mirror — invisible click target sized & positioned to the rendered
// CTA. Hover updates the React state which revisions the scene. Click is
// the <Link> wrapper which navigates via the React router.
type CtaMirrorProps = {
  readonly to: 'atlas' | 'signal';
  readonly id: CtaId;
  readonly width: number;
  readonly y: number;          // y from viewport center
  readonly x: number;          // x from viewport center
  readonly label: string;
  readonly onHover: (id: CtaId | null) => void;
  readonly variant: 'primary' | 'ghost';
};

const CtaMirror = ({ to, id, width, x, y, label, onHover, variant }: CtaMirrorProps): ReactNode => {
  const { viewport, impulse } = useCanvas();
  const left = viewport.w / 2 + x - width / 2;
  const top = viewport.h / 2 + y - CTA_H / 2;
  return (
    <Link
      to={to}
      className={`moonshot-cta ${variant === 'ghost' ? 'moonshot-cta--ghost' : ''}`}
      style={{ left, top, width, height: CTA_H }}
      aria-label={label}
      onMouseEnter={() => onHover(id)}
      onMouseLeave={() => onHover(null)}
      onFocus={() => onHover(id)}
      onBlur={() => onHover(null)}
    >
      {/* Click triggers a thwack at the button's center for tactile feedback.
          The Link's own onClick fires first (preventDefault + navigate) so we
          piggyback on a separate handler. */}
      <span
        className="moonshot-vh"
        onMouseDown={(e) => {
          const r = (e.currentTarget.parentElement as HTMLElement).getBoundingClientRect();
          impulse(r.left + r.width / 2, r.top + r.height / 2, 540);
        }}
      >
        {label}
      </span>
    </Link>
  );
};

export const Horizon = (): ReactNode => {
  const [phase, setPhase] = useState<Phase>(0);
  const [hovered, setHovered] = useState<CtaId | null>(null);

  // Idle cycle — three forms. Pause the cycle when a CTA is hovered so the
  // user reading a button doesn't see the wordmark teleport mid-decision.
  useEffect(() => {
    if (hovered !== null) return;
    const id = window.setInterval(() => {
      setPhase((p) => ((p + 1) % 3) as Phase);
    }, HERO_CYCLE_MS);
    return () => window.clearInterval(id);
  }, [hovered]);

  // Memoize the builder so its identity is stable across renders without
  // the state changing — useScene re-runs on the deps array, not on the
  // builder's reference identity.
  const buildFn = useMemo(
    () => (w: number, h: number) => buildHero(w, h, { phase, hovered }),
    [phase, hovered],
  );
  useScene('horizon', buildFn, [phase, hovered]);

  // CTA layout in the scene matches what we render in DOM. Coordinates are
  // relative to viewport center to mirror what the column layout produces.
  // The CTA y-offset is approximated; the small mismatch is fine because
  // the mirror is invisible — hover area just needs to overlap the visual.
  return (
    <>
      <CtaMirror
        to="atlas"
        id="primary"
        x={-((PRIMARY_W + 18 + GHOST_W) / 2 - PRIMARY_W / 2)}
        y={86}
        width={PRIMARY_W}
        label="Chart the atlas"
        variant="primary"
        onHover={setHovered}
      />
      <CtaMirror
        to="signal"
        id="ghost"
        x={(PRIMARY_W + 18 + GHOST_W) / 2 - GHOST_W / 2}
        y={86}
        width={GHOST_W}
        label="Open a channel"
        variant="ghost"
        onHover={setHovered}
      />
      <h1 className="moonshot-vh">screean — UI made of matter, not divs.</h1>
    </>
  );
};
