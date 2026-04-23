// Phase-1 validation button — deliberately plain HTML with inline styles.
//
// We initially rendered shadcn/ui's <Button> here, but the foreignObject
// rasterization fallback (the one we hit without the Chromium flag set up
// with a layoutsubtree canvas) doesn't play well with Tailwind v4's
// generated stylesheet: CSS `&` nesting requires CDATA, and `url(...)`
// references in the emitted CSS taint the canvas. See
// docs/RFC-html-in-canvas-interop.md for the full analysis.
//
// This plain button proves the pipeline works end-to-end with ZERO external
// CSS dependencies. Every pixel is defined by `style={...}` on the element
// itself, so the serialized SVG is fully self-contained — no stylesheet to
// inline, no sub-resources to fetch.
//
// The shadcn button + Tailwind stack stays in-repo (see src/components/ui/
// button.tsx and src/html-interop/index.css). Path B in the RFC reintroduces
// it via a <canvas layoutsubtree> + React portal so `drawElementImage` is
// the rasterization path — native, pixel-perfect, no foreignObject drama.

type AppProps = {
  label: string;
  onButtonClick?: (e: React.MouseEvent<HTMLButtonElement>) => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
  // Accepted for interface compatibility with main.tsx; ignored in the
  // plain variant. Kept so we can swap back to shadcn without touching
  // callers.
  variant?: string;
  size?: string;
};

// Visually mirrors shadcn's default dark variant at `size="lg"`: black
// chrome, white foreground, rounded corners, subtle inset highlight.
// Deliberately hand-rolled so the rasterizer sees a flat element with
// no CSS cascade dependencies.
const buttonStyle: React.CSSProperties = {
  // Layout
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  gap: 8,
  height: 40,
  paddingLeft: 24,
  paddingRight: 24,
  // Surface
  background: '#0a0a0a',
  color: '#fafafa',
  border: '1px solid rgba(255, 255, 255, 0.08)',
  borderRadius: 8,
  // Typography — system stack, no webfont fetch
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 14,
  fontWeight: 500,
  letterSpacing: 0,
  whiteSpace: 'nowrap',
  // Interaction
  cursor: 'pointer',
  outline: 'none',
  // Slight depth so the particle cloud has visible edge contrast
  boxShadow: '0 1px 2px rgba(0, 0, 0, 0.4), inset 0 1px 0 rgba(255, 255, 255, 0.06)',
};

export function App({
  label,
  onButtonClick,
  buttonRef,
}: AppProps) {
  return (
    <button
      ref={buttonRef}
      type="button"
      style={buttonStyle}
      onClick={onButtonClick}
    >
      {label}
    </button>
  );
}
