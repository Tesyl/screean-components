// DOM mirror layer — P13 of `docs/RFC-component-model.md` §5.
//
// One invisible <div> per component in the scene, parented to a single
// `#screean-mirror` container above the canvas. The browser handles
// everything we don't want to reimplement:
// - Screen readers (role + aria-label + aria-disabled)
// - Keyboard focus + tab order (tabindex)
// - Touch targets, long-press, double-tap
// - Forced-color / high-contrast modes
//
// Sync strategy (RFC §5.3): a single reconcile() walks the scene, diffs
// against a tracked set of mirror entries, mounts/updates/removes as needed.
// It is the SOLE writer of mirror styles — no other code touches them. Call
// it once per frame, after `scene.tick`/`world.tick`, before `renderer.draw`.
// Consumers drive the cadence; there is no hidden rAF loop.
//
// Positioning (simplified from RFC): we rely on `scene.walk((n, worldXform))`
// to give us accumulated transforms, and compute per-component bounds on the
// fly via `transformRect(intrinsic, worldXform)`. When the scene's root is a
// `camera(...)`, the camera's transform is part of worldXform, so the bounds
// we compute are already in screen coordinates — the mirror container itself
// carries an identity transform. The RFC's "inverse camera matrix on the
// container" design is an alternative; this one is simpler and has no parallel
// matrix state to drift against the scene.
//
// v0 scope — what this file DOES:
// - Mount/update/unmount mirror divs on scene-graph changes
// - Set role, aria-label, aria-disabled, tabindex, data-component-id
// - Position via `transform: translate3d(x, y, 0)` + width/height
// - Write styles only when values changed (cheap diff)
// - Dispatch `click` and `keydown(Enter|Space)` into `onClick`
// - Interactive components get `pointer-events: auto` and `tabindex="0"`;
//   non-interactive (label-only, image) get `pointer-events: none` and no tab stop
//
// v0 scope — what this file DEFERS to P14 (event system RFC §6):
// - pointermove / pointerenter / pointerleave / pointerdown / pointerup
// - focus / blur event dispatch (browser still manages focus ring)
// - keyup, non-activation keys
// - Full `ComponentEvent` {world, screen, local} coord projection
// - stopPropagation / bubbling through component tree
// - Tab-order management beyond browser default (uses tabindex=0 for all
//   interactive; focus order is DOM-insertion order)
//
// v0 scope — what this file DEFERS to P13 v1 (hardening):
// - Property-based drift tests across DPR ∈ {1, 1.5, 2, 3}
// - DPR-change media-query listener
// - Resize listener (consumer's existing resize flow must re-invoke reconcile)
// - `layoutsubtree` strategy (that's Phase 3b of html-in-canvas-interop.md)

import type { Scene, SceneNode } from 'screean';
import { boundsOf, transformRect } from 'screean';
import {
  isComponent,
  type Component,
  type ComponentHandlers,
  type AriaRole,
} from './types';

export type DomMirrorOpts = {
  // The Scene whose components we mirror. reconcile() walks this each call.
  scene: Scene;
  // DOM element to parent the `#screean-mirror` container under. Typical
  // choice: `canvas.parentElement`. Must be positioned (fixed/absolute/relative)
  // so the container's `inset: 0` resolves correctly.
  host: HTMLElement;
};

export type DomMirror = {
  // Call once per frame, after scene.tick(), before renderer.draw().
  reconcile: () => void;
  // Remove the mirror container and all mirror divs from the DOM. After
  // disposal, reconcile() is a no-op; create a fresh mirror if needed.
  dispose: () => void;
};

const hasInteractiveHandler = (h: Readonly<ComponentHandlers>): boolean =>
  !!(h.onClick || h.onPointerDown || h.onPointerUp ||
     h.onPointerEnter || h.onPointerLeave);

// When a component declares `ariaRole: 'none'` but has an onClick, fall back
// to 'button' so screen readers announce something useful. 'none' as the
// declared role plus no interactive handlers is treated as decoration and
// doesn't emit a role attribute at all.
const effectiveRole = (c: Component): AriaRole => {
  const declared = c._component.role;
  if (declared !== 'none') return declared;
  return hasInteractiveHandler(c._component.handlers) ? 'button' : 'none';
};

type MirrorEntry = {
  div: HTMLDivElement;
  // Last values written. We only touch the DOM when these change.
  lastX: number;
  lastY: number;
  lastW: number;
  lastH: number;
  lastDisabled: boolean;
  lastPressed: boolean | undefined;
  lastChecked: boolean | 'mixed' | undefined;
  lastFont: string | undefined;
  lastValue: number | undefined;
  lastMin: number | undefined;
  lastMax: number | undefined;
  // Listener handles so dispose() can detach them. Closure captures the
  // component by reference; handler-lookup is deferred to event time so
  // swapping handler identities Just Works (though our components freeze
  // handlers, a consumer with a custom factory might not).
  onClick: ((e: MouseEvent) => void) | null;
  onKey: ((e: KeyboardEvent) => void) | null;
};

const disposeEntry = (entry: MirrorEntry): void => {
  if (entry.onClick) entry.div.removeEventListener('click', entry.onClick);
  if (entry.onKey) entry.div.removeEventListener('keydown', entry.onKey);
  entry.div.remove();
};

// Build a mirror div for a newly-seen component. Attaches event listeners
// when the component is interactive, sets ARIA attributes, and returns the
// tracking entry. The div is NOT appended here — the reconciler does that.
const createEntry = (c: Component): MirrorEntry => {
  const div = document.createElement('div');
  const i = c._component;
  const role = effectiveRole(c);
  const interactive = hasInteractiveHandler(i.handlers);

  div.dataset.componentId = i.id;
  // Base styling. `transform` gets written by reconcile(); leaving it empty
  // here means unpositioned-at-first, but reconcile() always runs for new
  // entries before the next paint.
  //
  // NO inline `background` — consumer CSS is the source of truth for how
  // mirrors render visually. Inline styles beat external selectors, so
  // forcing `background: transparent` here would have locked out any
  // consumer-supplied accent colors.
  div.style.cssText =
    'position:absolute;top:0;left:0;will-change:transform;';

  if (role !== 'none') div.setAttribute('role', role);
  if (i.ariaLabel !== undefined) {
    div.setAttribute('aria-label', i.ariaLabel);
    // Also render as visible text content so the DOM mirror is readable,
    // not just a phantom rect over a particle cloud. Consumers who want
    // particles-only (e.g. a demo that hides the DOM chrome entirely) can
    // style `color: transparent` on `#screean-mirror > div`. The aria-label
    // is still authoritative for screen readers per WAI-ARIA naming rules.
    div.textContent = i.ariaLabel;
  }

  if (interactive) {
    div.tabIndex = i.disabled ? -1 : 0;
    div.style.pointerEvents = i.disabled ? 'none' : 'auto';
  } else {
    div.style.pointerEvents = 'none';
  }
  if (i.disabled) div.setAttribute('aria-disabled', 'true');
  // Toggle-button / checkbox / radio state. Only emit the ARIA attribute
  // when the component actually uses that state axis — undefined means
  // "not a toggle," so we leave the attr off entirely.
  if (i.pressed !== undefined) {
    div.setAttribute('aria-pressed', String(i.pressed));
  }
  if (i.checked !== undefined) {
    div.setAttribute('aria-checked', String(i.checked));
  }
  // Slider value axis. Only emitted when the component participates;
  // undefined → leave attr off entirely. We don't default min/max to 0/100
  // because that's a UI convention, not an a11y one — let the consumer be
  // explicit when the axis matters.
  if (i.value !== undefined) div.setAttribute('aria-valuenow', String(i.value));
  if (i.min !== undefined) div.setAttribute('aria-valuemin', String(i.min));
  if (i.max !== undefined) div.setAttribute('aria-valuemax', String(i.max));
  // Inline the CSS font shorthand so DOM text matches the particle text.
  // screean's `text()` field defaults to `bold 96px system-ui`; any consumer
  // CSS that disagrees produces a jarring size jump when particles reform.
  // Inline style beats external selectors → single source of truth wins.
  //
  // `line-height: 1` matters: screean rasterizes glyphs without line-leading,
  // so the field's bounds equal the glyph cell. The DOM default line-height
  // (~1.2) inflates the line-box and flex-centers the glyph below the
  // rasterized rectangle's center — visible as particles landing slightly
  // above the final text. Collapsing to 1 aligns the two.
  if (i.font !== undefined) {
    div.style.font = i.font;
    div.style.lineHeight = '1';
  }

  let onClick: MirrorEntry['onClick'] = null;
  let onKey: MirrorEntry['onKey'] = null;

  if (interactive) {
    onClick = () => {
      // Look up live — the component's handlers ref may have been frozen,
      // but we leave room for consumers to swap by mutating. Disabled gate
      // here AND via pointer-events:none; the CSS gate is the real one, but
      // the JS check guards against programmatic .click() bypassing CSS.
      const ci = c._component;
      const h = ci.handlers.onClick;
      if (!h || ci.disabled) return;
      // Minimal ComponentEvent (v0). P14 will fill in proper world/screen/local
      // coords from the live camera + pointer. For now, report the component's
      // current bounds center in world coords so handlers that need geometry
      // have something useful.
      const b = componentWorldBounds(c);
      const cx = b ? b.x + b.w / 2 : 0;
      const cy = b ? b.y + b.h / 2 : 0;
      h({
        type: 'click',
        x: cx,
        y: cy,
        world: [cx, cy],
        screen: [0, 0],
        local: [0, 0],
        component: c,
      });
    };
    onKey = (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        // Synthesize a click through the same path as mouse — single
        // dispatch. Browser would otherwise send both native-click and our
        // synthetic; preventDefault keeps Space from scrolling.
        div.click();
      }
    };
    div.addEventListener('click', onClick);
    div.addEventListener('keydown', onKey);
  }

  return {
    div,
    lastX: NaN,
    lastY: NaN,
    lastW: NaN,
    lastH: NaN,
    lastDisabled: i.disabled,
    lastPressed: i.pressed,
    lastChecked: i.checked,
    lastFont: i.font,
    lastValue: i.value,
    lastMin: i.min,
    lastMax: i.max,
    onClick,
    onKey,
  };
};

// Update the static ARIA bits when a component's internals have drifted from
// what we last wrote. In practice the internals are frozen and this never
// fires after initial mount — but a consumer who clones + re-tags components
// during routing (P16) will appreciate not having to re-create the mirror.
const syncAriaIfChanged = (entry: MirrorEntry, c: Component): void => {
  const i = c._component;
  if (entry.lastDisabled !== i.disabled) {
    entry.lastDisabled = i.disabled;
    if (i.disabled) {
      entry.div.setAttribute('aria-disabled', 'true');
      entry.div.tabIndex = -1;
      entry.div.style.pointerEvents = 'none';
    } else {
      entry.div.removeAttribute('aria-disabled');
      if (hasInteractiveHandler(i.handlers)) {
        entry.div.tabIndex = 0;
        entry.div.style.pointerEvents = 'auto';
      }
    }
  }
  if (entry.lastPressed !== i.pressed) {
    entry.lastPressed = i.pressed;
    if (i.pressed === undefined) entry.div.removeAttribute('aria-pressed');
    else entry.div.setAttribute('aria-pressed', String(i.pressed));
  }
  if (entry.lastChecked !== i.checked) {
    entry.lastChecked = i.checked;
    if (i.checked === undefined) entry.div.removeAttribute('aria-checked');
    else entry.div.setAttribute('aria-checked', String(i.checked));
  }
  if (entry.lastFont !== i.font) {
    entry.lastFont = i.font;
    entry.div.style.font = i.font ?? '';
    entry.div.style.lineHeight = i.font !== undefined ? '1' : '';
  }
  if (entry.lastValue !== i.value) {
    entry.lastValue = i.value;
    if (i.value === undefined) entry.div.removeAttribute('aria-valuenow');
    else entry.div.setAttribute('aria-valuenow', String(i.value));
  }
  if (entry.lastMin !== i.min) {
    entry.lastMin = i.min;
    if (i.min === undefined) entry.div.removeAttribute('aria-valuemin');
    else entry.div.setAttribute('aria-valuemin', String(i.min));
  }
  if (entry.lastMax !== i.max) {
    entry.lastMax = i.max;
    if (i.max === undefined) entry.div.removeAttribute('aria-valuemax');
    else entry.div.setAttribute('aria-valuemax', String(i.max));
  }
};

// Scene-graph walk to pull the world-space bounds of a component. Needs a
// second helper because reconcile() wants bounds during its walk, but the
// click handler also needs them on demand (outside of a walk).
const componentWorldBounds = (
  c: Component,
): { x: number; y: number; w: number; h: number } | null => {
  // If the node's bounds cache is populated (scene.tick triggered worldBounds
  // somewhere in the pipeline), trust it — it's the single source of truth.
  if (c.bounds) return c.bounds;
  // Fallback: the component has an intrinsic rect and no transform chain has
  // touched it. This is the common case for a newly-added component whose
  // scene hasn't yet ticked.
  return c.intrinsic ?? boundsOf(c.field);
};

export const createDomMirror = (opts: DomMirrorOpts): DomMirror => {
  const { scene, host } = opts;

  const container = document.createElement('div');
  container.id = 'screean-mirror';
  container.setAttribute('role', 'presentation');
  container.setAttribute('aria-hidden', 'false');
  container.style.cssText =
    'position:absolute;inset:0;pointer-events:none;z-index:1;';
  host.appendChild(container);

  // componentId → tracked mirror entry. Keyed on id (stable across scene
  // mutations) rather than node ref (which a consumer could rebuild).
  const entries = new Map<string, MirrorEntry>();

  let disposed = false;

  const reconcile = (): void => {
    if (disposed) return;
    const seen = new Set<string>();

    scene.walk((n: SceneNode, worldXform) => {
      if (!isComponent(n)) return;
      const c = n;
      const id = c._component.id;
      seen.add(id);

      let entry = entries.get(id);
      if (!entry) {
        entry = createEntry(c);
        container.appendChild(entry.div);
        entries.set(id, entry);
      }

      syncAriaIfChanged(entry, c);

      // Compute world-space (post-camera, if camera is root) bounds from the
      // node's intrinsic + accumulated transform. Skip the mirror positioning
      // if we can't — unpositioned div is harmless; it's at 0,0 with no size.
      const local = c.intrinsic ?? boundsOf(c.field);
      if (!local) return;
      const b = transformRect(local, worldXform);

      if (entry.lastX !== b.x || entry.lastY !== b.y) {
        entry.div.style.transform = `translate3d(${b.x}px, ${b.y}px, 0)`;
        entry.lastX = b.x;
        entry.lastY = b.y;
      }
      if (entry.lastW !== b.w || entry.lastH !== b.h) {
        entry.div.style.width = `${b.w}px`;
        entry.div.style.height = `${b.h}px`;
        entry.lastW = b.w;
        entry.lastH = b.h;
      }
    });

    // Unmount entries whose components left the scene this frame.
    for (const [id, entry] of entries) {
      if (!seen.has(id)) {
        disposeEntry(entry);
        entries.delete(id);
      }
    }
  };

  const dispose = (): void => {
    if (disposed) return;
    disposed = true;
    for (const entry of entries.values()) disposeEntry(entry);
    entries.clear();
    container.remove();
  };

  return { reconcile, dispose };
};
