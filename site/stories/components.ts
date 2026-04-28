// Components story group — UI primitives demoed via the Phase 3a
// dissolve-and-reform pattern (docs/RFC-html-in-canvas-interop.md).
//
// Each tile owns ONE real DOM element (the production component). On
// click or auto-loop tick, the helper rasterizes that element into a
// BitmapField, hides via opacity, spawns particles bound to the field
// targets, kicks them outward with a radial impulse, and reels them
// back via the spring. After the drift window, the DOM element fades
// back to opacity 1 and is interactive again.
//
// All visual styles are inline-set with literal values (no `var(--…)`)
// because the rasterizer's foreignObject SVG context doesn't see the
// page's CSS custom properties. The factory closure receives theme
// tokens (literals) for that reason.

import type { ThemeId } from '../themes';
import { THEMES } from '../themes';
import { componentReel } from '../lib/effects/componentReel';
import { type TileGroup } from './types';

const MONO_STACK = 'ui-monospace, "SF Mono", Menlo, Consolas, monospace';

export const componentsGroup = (themeId: ThemeId): TileGroup => ({
  title: 'Components',
  blurb: 'UI primitives that are simultaneously real DOM and particle matter. Each component stays in place — only its opacity toggles. Particles are bound to a rasterized field of the same element.',
  tiles: [
    {
      name: 'button · reel',
      blurb: 'Click the real <button>. It rasterizes into a BitmapField, dissolves into particles, springs back into shape. Same DOM element the whole time.',
      code: `componentReel({ canvas, w, h, themeId,
  buildElement: (tokens) => {
    const btn = document.createElement('button');
    btn.textContent = 'TAP TO SHATTER';
    Object.assign(btn.style, { background: tokens.accent, ... });
    return { element: btn, width: w * 0.7, height: h * 0.42 };
  },
});`,
      mount: (c, w, h) => componentReel({
        canvas: c, w, h, themeId,
        buildElement: (tokens) => {
          const btn = document.createElement('button');
          btn.type = 'button';
          btn.textContent = 'TAP TO SHATTER';
          const elW = Math.round(w * 0.7);
          const elH = Math.round(h * 0.42);
          Object.assign(btn.style, {
            width: `${elW}px`,
            height: `${elH}px`,
            background: tokens.accent,
            color: tokens.fg,
            border: `1.5px solid ${tokens.border}`,
            borderRadius: '6px',
            fontFamily: MONO_STACK,
            fontSize: '14px',
            fontWeight: '700',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
            cursor: 'pointer',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
          });
          return { element: btn, width: elW, height: elH };
        },
      }),
    },

    {
      name: 'card · reel',
      blurb: 'Non-interactive container. Title + body text in a rounded chrome. Auto-dissolves on the same cadence as the button so readers can see the same matter pattern across components.',
      code: `componentReel({ canvas, w, h, themeId,
  buildElement: (tokens) => {
    const card = document.createElement('div');
    card.innerHTML = '<h4>SCREEAN</h4><p>Particles, bound.</p>';
    return { element: card, width: ..., height: ... };
  },
});`,
      mount: (c, w, h) => componentReel({
        canvas: c, w, h, themeId,
        buildElement: (tokens) => {
          const card = document.createElement('div');
          // Inner markup as plain HTML — child elements inherit the
          // parent's inline color/font, then add their own size/weight
          // overrides for hierarchy. Inlining everything keeps the
          // rasterizer's foreignObject SVG context happy (no CSS
          // variable lookups, no class selectors needed).
          const title = document.createElement('div');
          title.textContent = 'SCREEAN';
          Object.assign(title.style, {
            fontSize: '14px',
            fontWeight: '800',
            letterSpacing: '0.18em',
            marginBottom: '6px',
            color: tokens.fg,
          });
          const body = document.createElement('div');
          body.textContent = 'Particles, bound to a rasterized DOM field.';
          Object.assign(body.style, {
            fontSize: '11px',
            fontWeight: '500',
            letterSpacing: '0.04em',
            lineHeight: '1.45',
            color: tokens.fg,
            opacity: '0.78',
          });
          card.appendChild(title);
          card.appendChild(body);

          const elW = Math.round(w * 0.78);
          const elH = Math.round(h * 0.5);
          Object.assign(card.style, {
            width: `${elW}px`,
            height: `${elH}px`,
            background: tokens.surface,
            color: tokens.fg,
            border: `1.5px solid ${tokens.border}`,
            borderRadius: '8px',
            padding: '14px 18px',
            fontFamily: MONO_STACK,
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            boxSizing: 'border-box',
          });
          return { element: card, width: elW, height: elH };
        },
      }),
    },

    {
      name: 'toggle · reel',
      blurb: 'Stateful switch. Click flips the thumb position; the dissolve carries the state change visually — particles drift away from the old position and reform at the new one.',
      code: `componentReel({ canvas, w, h, themeId,
  buildElement: (tokens) => buildToggleEl(state, tokens),
  onElementClick: () => { state = !state; rebuild(); },
});`,
      mount: (c, w, h) => {
        // ↓↓↓ Toggle ↓↓↓
        // (kept after this comment block — separating the slider entry
        // below from the toggle entry above for readability.)
        // Toggle state is owned by the closure here, not by the helper.
        // The helper is intentionally state-agnostic — it just
        // rasterizes whatever the element looks like at click-time.
        // On click we flip state, mutate the live element, then let
        // the helper proceed with the dissolve. Particles capture the
        // NEW state, so the cycle plays as old → particles → new.
        let on = false;
        const tokens = THEMES[themeId].tokens;

        const elW = Math.round(w * 0.36);
        const elH = Math.round(h * 0.32);
        const padding = 4;
        const thumbSize = elH - padding * 2;

        const positionThumb = (thumb: HTMLElement, isOn: boolean) => {
          thumb.style.left = isOn
            ? `${elW - thumbSize - padding}px`
            : `${padding}px`;
        };
        const colorTrack = (el: HTMLElement, isOn: boolean) => {
          el.style.background = isOn ? tokens.accent : tokens.subtle;
        };

        return componentReel({
          canvas: c, w, h, themeId,
          // Smaller particle count + wider kick for the toggle — its
          // rasterized footprint is small (no internal text) so the
          // burst reads cleaner with fewer, faster particles.
          particleCount: 1100,
          kick: 460,
          buildElement: () => {
            const trackEl = document.createElement('div');
            // The toggle is a position:relative track with an
            // absolutely-positioned thumb. CSS transitions on `left`
            // and `background` give a 180ms preview during the brief
            // "hooked the click, not yet dissolved" window before the
            // rasterize captures the new state.
            Object.assign(trackEl.style, {
              width: `${elW}px`,
              height: `${elH}px`,
              border: `1.5px solid ${tokens.border}`,
              borderRadius: `${elH / 2}px`,
              position: 'relative',
              cursor: 'pointer',
              boxSizing: 'border-box',
              transition: 'background 0.18s ease',
            });
            colorTrack(trackEl, on);
            const thumb = document.createElement('div');
            thumb.dataset.role = 'toggle-thumb';
            Object.assign(thumb.style, {
              position: 'absolute',
              top: `${padding - 1.5}px`,
              width: `${thumbSize}px`,
              height: `${thumbSize}px`,
              borderRadius: '50%',
              background: tokens.fg,
              border: `1.5px solid ${tokens.border}`,
              transition: 'left 0.18s cubic-bezier(0.2, 0.7, 0.2, 1)',
            });
            positionThumb(thumb, on);
            trackEl.appendChild(thumb);
            return { element: trackEl, width: elW, height: elH };
          },
          // Flip state + mutate the live element before the rasterize
          // fires. The helper's rasterize step will capture the
          // post-mutation visual.
          onElementClick: (el) => {
            on = !on;
            const thumb = el.querySelector<HTMLElement>('[data-role="toggle-thumb"]');
            if (thumb) positionThumb(thumb, on);
            colorTrack(el, on);
          },
        });
      },
    },

    // ---- Slider ------------------------------------------------------
    // Continuous-state component. Click cycles through preset stops
    // (25% → 50% → 75% → 100% → 0% → loop). Dissolve carries the
    // change visually — particles drift away from the old fill width
    // and reform at the new one.
    {
      name: 'slider · reel',
      blurb: 'Continuous state. Click to cycle through 0/25/50/75/100. The dissolve carries the value change — fill width and thumb position both flow.',
      code: `componentReel({ canvas, w, h, themeId,
  buildElement: () => buildSlider(value, tokens),
  onElementClick: () => { value = STOPS[(STOPS.indexOf(value) + 1) % STOPS.length]; rebuild(); },
});`,
      mount: (c, w, h) => {
        // Discrete stops give the demo a clear "step" feel — the user
        // sees 5 distinct positions across the loop, each with its
        // own dissolve cycle. Continuous drag would be more realistic
        // but harder to read in a tile.
        const STOPS = [0.25, 0.5, 0.75, 1.0, 0.0] as const;
        let stopIdx = 0;
        const tokens = THEMES[themeId].tokens;

        const elW = Math.round(w * 0.62);
        const elH = Math.round(h * 0.18);
        const trackPad = 2;
        const thumbSize = elH;

        const layoutSlider = (track: HTMLElement, value: number) => {
          const fill = track.querySelector<HTMLElement>('[data-role="slider-fill"]');
          const thumb = track.querySelector<HTMLElement>('[data-role="slider-thumb"]');
          // Fill width: 0..elW. Reserve a few px for the thumb to peek
          // past the edge at value=0 / value=1 so the visual identity
          // of "track + thumb" reads at extremes too.
          const fillW = Math.round(value * (elW - thumbSize));
          if (fill) fill.style.width = `${fillW + thumbSize / 2}px`;
          if (thumb) thumb.style.left = `${fillW}px`;
        };

        return componentReel({
          canvas: c, w, h, themeId,
          particleCount: 1200,
          // Slightly less kick than the button — the slider's
          // footprint is wider and lower, so a smaller burst keeps
          // particles on-canvas during the drift.
          kick: 420,
          buildElement: () => {
            const track = document.createElement('div');
            Object.assign(track.style, {
              width: `${elW}px`,
              height: `${elH}px`,
              background: tokens.subtle,
              border: `1.5px solid ${tokens.border}`,
              borderRadius: `${elH / 2}px`,
              position: 'relative',
              cursor: 'pointer',
              boxSizing: 'border-box',
            });
            const fill = document.createElement('div');
            fill.dataset.role = 'slider-fill';
            Object.assign(fill.style, {
              position: 'absolute',
              top: `${trackPad - 1.5}px`,
              left: '0',
              height: `${elH - trackPad * 2}px`,
              background: tokens.accent,
              borderRadius: `${elH / 2}px`,
              transition: 'width 0.18s cubic-bezier(0.2, 0.7, 0.2, 1)',
            });
            const thumb = document.createElement('div');
            thumb.dataset.role = 'slider-thumb';
            Object.assign(thumb.style, {
              position: 'absolute',
              top: `${-1.5}px`,
              width: `${thumbSize}px`,
              height: `${thumbSize}px`,
              background: tokens.fg,
              border: `1.5px solid ${tokens.border}`,
              borderRadius: '50%',
              transition: 'left 0.18s cubic-bezier(0.2, 0.7, 0.2, 1)',
            });
            track.appendChild(fill);
            track.appendChild(thumb);
            layoutSlider(track, STOPS[stopIdx]);
            return { element: track, width: elW, height: elH };
          },
          onElementClick: (el) => {
            stopIdx = (stopIdx + 1) % STOPS.length;
            layoutSlider(el, STOPS[stopIdx]);
          },
        });
      },
    },

    // ---- Checkbox -----------------------------------------------------
    // Boolean state, square chrome. Click flips checked. The check mark
    // is a smaller filled square inside the chrome; rasterized + reformed
    // it carries the state change visually.
    {
      name: 'checkbox · reel',
      blurb: 'Boolean state, square chrome. Click flips. The mark dissolves with the rest of the cell — particles carry the state transition.',
      code: `componentReel({ canvas, w, h, themeId,
  buildElement: () => buildCheckbox(checked, tokens),
  onElementClick: () => { checked = !checked; rebuild(); },
});`,
      mount: (c, w, h) => {
        let checked = false;
        const tokens = THEMES[themeId].tokens;
        const size = Math.round(Math.min(w, h) * 0.32);
        const inset = Math.max(4, Math.round(size * 0.22));

        return componentReel({
          canvas: c, w, h, themeId,
          particleCount: 900,
          kick: 480,
          buildElement: () => {
            const box = document.createElement('div');
            Object.assign(box.style, {
              width: `${size}px`,
              height: `${size}px`,
              background: tokens.subtle,
              border: `1.5px solid ${tokens.border}`,
              borderRadius: '4px',
              position: 'relative',
              cursor: 'pointer',
              boxSizing: 'border-box',
              transition: 'background 0.18s ease',
            });
            if (checked) {
              const mark = document.createElement('div');
              Object.assign(mark.style, {
                position: 'absolute',
                inset: `${inset}px`,
                background: tokens.accent,
                borderRadius: '2px',
              });
              box.appendChild(mark);
            }
            return { element: box, width: size, height: size };
          },
          onElementClick: () => { checked = !checked; },
        });
      },
    },

    // ---- Radio --------------------------------------------------------
    // Single radio button. Demonstrates the visual primitive; group
    // semantics (one-selected-at-a-time) are a parent concern and not
    // shown in a single-tile demo.
    {
      name: 'radio · reel',
      blurb: 'Circular ring with an inner dot when selected. Click toggles the dot. The reform cycle carries the state visually.',
      code: `componentReel({ canvas, w, h, themeId,
  buildElement: () => buildRadio(checked, tokens),
  onElementClick: () => { checked = !checked; rebuild(); },
});`,
      mount: (c, w, h) => {
        let checked = false;
        const tokens = THEMES[themeId].tokens;
        const size = Math.round(Math.min(w, h) * 0.32);
        const dotSize = Math.round(size * 0.42);

        return componentReel({
          canvas: c, w, h, themeId,
          particleCount: 900,
          kick: 480,
          buildElement: () => {
            const ring = document.createElement('div');
            Object.assign(ring.style, {
              width: `${size}px`,
              height: `${size}px`,
              background: tokens.subtle,
              border: `1.5px solid ${tokens.border}`,
              borderRadius: '50%',
              position: 'relative',
              cursor: 'pointer',
              boxSizing: 'border-box',
            });
            if (checked) {
              const dot = document.createElement('div');
              Object.assign(dot.style, {
                position: 'absolute',
                left: `${(size - dotSize) / 2}px`,
                top: `${(size - dotSize) / 2}px`,
                width: `${dotSize}px`,
                height: `${dotSize}px`,
                background: tokens.accent,
                borderRadius: '50%',
              });
              ring.appendChild(dot);
            }
            return { element: ring, width: size, height: size };
          },
          onElementClick: () => { checked = !checked; },
        });
      },
    },

    // ---- TextField ----------------------------------------------------
    // Text input chrome rendered as particles. Click cycles through
    // preset values so the dissolve has visible content change to carry.
    // The library's actual textField component creates a real <input>
    // via the DOM mirror — see /experiments for that path.
    {
      name: 'textfield · reel',
      blurb: 'Input chrome dissolved as particles. Click cycles through preset values; dissolve carries the new text into shape.',
      code: `componentReel({ canvas, w, h, themeId,
  buildElement: () => buildTextField(value, tokens),
  onElementClick: () => { value = NEXT[value]; rebuild(); },
});`,
      mount: (c, w, h) => {
        const VALUES = ['the6ix', 'matter', 'collective', 'particles'] as const;
        let idx = 0;
        const tokens = THEMES[themeId].tokens;
        const elW = Math.round(w * 0.62);
        const elH = Math.round(h * 0.22);

        return componentReel({
          canvas: c, w, h, themeId,
          particleCount: 1200,
          kick: 440,
          buildElement: () => {
            const wrap = document.createElement('div');
            Object.assign(wrap.style, {
              width: `${elW}px`,
              height: `${elH}px`,
              background: tokens.subtle,
              border: `1.5px solid ${tokens.border}`,
              borderRadius: '8px',
              boxSizing: 'border-box',
              display: 'flex',
              alignItems: 'center',
              padding: '0 14px',
              fontFamily: MONO_STACK,
              fontSize: `${Math.round(elH * 0.5)}px`,
              color: tokens.fg,
              cursor: 'pointer',
              letterSpacing: '0.06em',
            });
            wrap.textContent = VALUES[idx];
            return { element: wrap, width: elW, height: elH };
          },
          onElementClick: () => { idx = (idx + 1) % VALUES.length; },
        });
      },
    },
  ],
});
