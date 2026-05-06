// Pure builders that turn UI-shaped props into screean SceneNodes.
//
// These are NOT React components. They're the "compiled output" that React
// screen components produce on each render. Keeping them pure means the
// scene tree is reproducible from props alone — easy to memoize.
//
// Composition uses the engine's layout primitives (`stack`, `row`, `column`)
// rather than direct child attachment, since layout primitives also compute
// `intrinsic` for the parent — required by `boundsOf` and the camera fit.

import {
  circle,
  column,
  node,
  polygon,
  rect,
  row,
  spacer,
  stack,
  text,
  type SceneNode,
  type Vec2,
} from 'screean';
import { COLOR, FONT } from '../constant';

// ---- Geometry helpers -----------------------------------------------------

export const starVerts = (
  r: number,
  points: number,
  inset = 0.5,
  rot = -Math.PI / 2,
): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i < points * 2; i++) {
    const rad = i % 2 === 0 ? r : r * inset;
    const a = rot + (i / (points * 2)) * Math.PI * 2;
    out.push([Math.cos(a) * rad, Math.sin(a) * rad]);
  }
  return out;
};

export const ngonVerts = (r: number, sides: number, rot = 0): Vec2[] => {
  const out: Vec2[] = [];
  for (let i = 0; i < sides; i++) {
    const a = rot + (i / sides) * Math.PI * 2;
    out.push([Math.cos(a) * r, Math.sin(a) * r]);
  }
  return out;
};

// ---- Atomic leaf builders -------------------------------------------------
// Text rasterization is browser-only; tests + SSR get a circle fallback.
const safeText = (body: string, font: string, fallbackR: number): SceneNode => {
  if (typeof OffscreenCanvas === 'undefined' || !body) {
    return node(circle({ r: fallbackR }));
  }
  return node(text({ text: body, font }));
};

type WordmarkOpts = {
  readonly text: string;
  readonly size: number;
  readonly weight?: number;
  readonly family?: string;
};

export const wordmark = (o: WordmarkOpts): SceneNode =>
  safeText(
    o.text,
    `${o.weight ?? 400} ${o.size}px ${o.family ?? FONT.display}`,
    o.size * 0.5,
  );

type CaptionOpts = {
  readonly text: string;
  readonly size?: number;
  readonly family?: string;
};

export const caption = (o: CaptionOpts): SceneNode => {
  const size = o.size ?? 12;
  return safeText(o.text, `500 ${size}px ${o.family ?? FONT.mono}`, size * 0.4);
};

type BodyOpts = {
  readonly text: string;
  readonly size?: number;
  readonly family?: string;
};

export const body = (o: BodyOpts): SceneNode => {
  const size = o.size ?? 18;
  return safeText(o.text, `400 ${size}px ${o.family ?? FONT.body}`, size * 0.4);
};

// ---- Composite builders ---------------------------------------------------

// CTA — rect frame with a centered label. `stack` centers label on frame.
type CtaOpts = {
  readonly label: string;
  readonly variant: 'primary' | 'ghost';
  readonly pulse?: number;     // 0..1 — bumped on hover
  readonly width: number;
  readonly height: number;
};

export const cta = (o: CtaOpts): SceneNode => {
  // The button IS the label (in particles). No filled rect — it'd eat the
  // particle budget and bury the type. Hover adds a thin underline rule
  // beneath the label as the visual affordance; the click target is the
  // DOM mirror sitting on top.
  //
  // Font sized at 0.42 of height — at button height 72 that's 30px, the
  // floor below which mono letterforms collapse into solid bars when
  // rasterized as particles.
  const pulse = o.pulse ?? 0;
  const label = safeText(o.label, `500 ${Math.round(o.height * 0.42)}px ${FONT.mono}`, 6);
  label.z = 0;
  if (pulse <= 0) return stack([label]);
  const underlineW = Math.round(o.width * 0.7 * pulse);
  const rule = node(rect({ w: underlineW, h: 2, radius: 0 }), { z: 1 });
  return column({ gap: 12, align: 'center' }, [label, rule]);
};

// Atlas world — labeled disc.
type WorldOpts = {
  readonly title: string;
  readonly radius: number;
  readonly active?: boolean;
};

export const world = (o: WorldOpts): SceneNode => {
  // Ring (filled disc, z=0) with the title centered on top (z=1). Inner
  // glyph removed — it lived at the same center as the title and visually
  // melted into it. The disc + title alone reads cleaner as "named world".
  const ring = node(circle({ r: o.radius }), { z: 0 });
  const title = safeText(o.title, `400 ${Math.round(o.radius * 0.42)}px ${FONT.display}`, 8);
  title.z = 1;
  return stack([ring, title]);
};

// Form field — label / value / hairline-rule, top-down.
type FieldOpts = {
  readonly label: string;
  readonly value: string;
  readonly placeholder: string;
  readonly width: number;
  readonly focused: boolean;
};

export const fieldNode = (o: FieldOpts): SceneNode => {
  void o.label;  // label is DOM-rendered (see FieldMirror) for legibility
  const RULE_H = o.focused ? 3 : 2;
  // Value at 36px display sans — big enough that letterforms survive
  // particle rasterization. Placeholder uses muted alpha via empty-string
  // detection at the call site.
  const display = o.value.length > 0 ? o.value : o.placeholder;
  const valueN = safeText(display, `400 36px ${FONT.body}`, 8);
  const ruleN = node(rect({ w: o.width, h: RULE_H, radius: 0 }), { z: 0 });
  return column({ gap: 14, align: 'start' }, [valueN, ruleN]);
};

// Sigil — a 6-point star inscribed in a hex. Used as the hero's idle midpoint.
export const sigil = (radius: number): SceneNode =>
  node(polygon({ vertices: starVerts(radius, 6, 0.5) }));

// Horizon mark — a hexagon. Used as the hero's third idle frame.
export const horizonMark = (radius: number): SceneNode =>
  node(polygon({ vertices: ngonVerts(radius, 6, Math.PI / 6) }));

// Re-exports so screens can import from one place.
export { circle, column, node, polygon, rect, row, spacer, stack };
export const COLORS = COLOR;
export const FONTS = FONT;
