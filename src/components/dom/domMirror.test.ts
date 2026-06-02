// @vitest-environment happy-dom
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { __resetNodeIds, node, rect, scene, stack } from '@tesyl/screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../../testing/offscreenCanvasStub';
import { button } from '../factories/button';
import { label } from '../factories/label';
import { __resetComponentIds, component } from '../component';
import { createDomMirror } from './domMirror';

beforeAll(installOffscreenCanvasStub);
afterAll(uninstallOffscreenCanvasStub);
beforeEach(() => {
  __resetNodeIds();
  __resetComponentIds();
  // Clean slate in the DOM between tests so stray mirror containers don't leak.
  document.body.innerHTML = '';
});

// Build a small scene with one button. `width`/`height` keep the rect intrinsic
// predictable (100×40 at origin); consumer-callers usually set these.
const sceneWithButton = (onClick: () => void = () => {}, width = 100, height = 40) => {
  const btn = button({ label: 'Save', onClick, width, height, radius: 0 });
  const root = node(null);
  root.children.push(btn);
  btn.parent = root;
  const s = scene({ particleCount: 1 }, root);
  s.tick(0);
  return { s, btn };
};

const makeHost = (): HTMLElement => {
  const host = document.createElement('div');
  host.style.position = 'relative';
  host.style.width = '800px';
  host.style.height = '600px';
  document.body.appendChild(host);
  return host;
};

describe('createDomMirror — mount', () => {
  it('creates a #screean-mirror container under host', () => {
    const { s } = sceneWithButton();
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    const container = host.querySelector('#screean-mirror');
    expect(container).not.toBeNull();
    expect(container!.getAttribute('role')).toBe('presentation');
    mirror.dispose();
  });

  it('creates one mirror div per component on first reconcile', () => {
    const { s } = sceneWithButton();
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    const divs = host.querySelectorAll('#screean-mirror > div');
    expect(divs.length).toBe(1);
    mirror.dispose();
  });

  it('sets role + aria-label + tabindex + data-component-id on interactive components', () => {
    const { s, btn } = sceneWithButton();
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    const div = host.querySelector('#screean-mirror > div') as HTMLDivElement;
    expect(div.getAttribute('role')).toBe('button');
    expect(div.getAttribute('aria-label')).toBe('Save');
    expect(div.tabIndex).toBe(0);
    expect(div.dataset.componentId).toBe(btn._component.id);
    mirror.dispose();
  });

  it('non-interactive components (label) get role but no tabindex and pointer-events: none', () => {
    const l = label({ label: 'Greeting' });
    const root = node(null);
    root.children.push(l);
    l.parent = root;
    const s = scene({ particleCount: 1 }, root);
    s.tick(0);
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    const div = host.querySelector('#screean-mirror > div') as HTMLDivElement;
    expect(div.getAttribute('role')).toBe('text');
    expect(div.getAttribute('aria-label')).toBe('Greeting');
    expect(div.hasAttribute('tabindex')).toBe(false);
    expect(div.style.pointerEvents).toBe('none');
    mirror.dispose();
  });
});

describe('createDomMirror — positioning', () => {
  it("writes transform: translate3d from the component's world bounds", () => {
    const { s, btn } = sceneWithButton(() => {}, 100, 40);
    // Shift the button to (50, 70).
    btn.transform.x = 50;
    btn.transform.y = 70;
    btn.bounds = null; // invalidate cached bounds after transform mutation
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    const div = host.querySelector('#screean-mirror > div') as HTMLDivElement;
    // Button's rect intrinsic centers on (width/2, height/2) — the
    // roundedRectField factory anchors at (0,0) with width/height dimensions,
    // so intrinsic is roughly (0..100, 0..40). After transform (+50, +70),
    // world bounds start at (50, 70).
    expect(div.style.transform).toBe('translate3d(50px, 70px, 0)');
    expect(div.style.width).toBe('100px');
    expect(div.style.height).toBe('40px');
    mirror.dispose();
  });

  it('updates transform on subsequent reconcile after bounds change', () => {
    const { s, btn } = sceneWithButton();
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    const div = host.querySelector('#screean-mirror > div') as HTMLDivElement;
    const firstTransform = div.style.transform;

    btn.transform.x = 200;
    btn.bounds = null;
    mirror.reconcile();
    expect(div.style.transform).not.toBe(firstTransform);
    expect(div.style.transform).toContain('200px');
    mirror.dispose();
  });
});

describe('createDomMirror — click bridge', () => {
  it('forwards mirror click to the component onClick handler', () => {
    const onClick = vi.fn();
    const { s } = sceneWithButton(onClick);
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    const div = host.querySelector('#screean-mirror > div') as HTMLDivElement;
    div.click();
    expect(onClick).toHaveBeenCalledTimes(1);
    // ComponentEvent shape — v0 minimum
    const evt = onClick.mock.calls[0][0];
    expect(evt.type).toBe('click');
    expect(typeof evt.x).toBe('number');
    expect(typeof evt.y).toBe('number');
    mirror.dispose();
  });

  it('Enter key on focused mirror fires onClick once', () => {
    const onClick = vi.fn();
    const { s } = sceneWithButton(onClick);
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    const div = host.querySelector('#screean-mirror > div') as HTMLDivElement;
    div.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    mirror.dispose();
  });

  it('Space key on focused mirror fires onClick once (not twice)', () => {
    const onClick = vi.fn();
    const { s } = sceneWithButton(onClick);
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    const div = host.querySelector('#screean-mirror > div') as HTMLDivElement;
    div.dispatchEvent(
      new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }),
    );
    expect(onClick).toHaveBeenCalledTimes(1);
    mirror.dispose();
  });

  it('disabled components: aria-disabled, tabindex=-1, pointer-events: none, onClick suppressed', () => {
    const onClick = vi.fn();
    // Use component() directly since button() doesn't expose `disabled`.
    const chrome = node(rect({ w: 100, h: 40, radius: 0 }), { z: 0 });
    const container = stack([chrome]);
    const btn = component(container, {
      ariaRole: 'button',
      ariaLabel: 'No',
      disabled: true,
      onClick,
    });
    const root = node(null);
    root.children.push(btn);
    btn.parent = root;
    const s = scene({ particleCount: 1 }, root);
    s.tick(0);
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    const div = host.querySelector('#screean-mirror > div') as HTMLDivElement;
    expect(div.getAttribute('aria-disabled')).toBe('true');
    expect(div.tabIndex).toBe(-1);
    expect(div.style.pointerEvents).toBe('none');
    div.click();
    expect(onClick).not.toHaveBeenCalled();
    mirror.dispose();
  });
});

describe('createDomMirror — lifecycle', () => {
  it('removes the mirror div when the component is removed from the scene', () => {
    const { s, btn } = sceneWithButton();
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    expect(host.querySelectorAll('#screean-mirror > div').length).toBe(1);

    s.remove(btn);
    mirror.reconcile();
    expect(host.querySelectorAll('#screean-mirror > div').length).toBe(0);
    mirror.dispose();
  });

  it('dispose() removes the container and all mirror divs', () => {
    const { s } = sceneWithButton();
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    expect(host.querySelector('#screean-mirror')).not.toBeNull();

    mirror.dispose();
    expect(host.querySelector('#screean-mirror')).toBeNull();
  });

  it('reconcile() after dispose is a no-op (does not throw or remount)', () => {
    const { s } = sceneWithButton();
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.dispose();
    expect(() => mirror.reconcile()).not.toThrow();
    expect(host.querySelector('#screean-mirror')).toBeNull();
  });

  it('re-reconciling the same unchanged scene does not churn the DOM', () => {
    const { s } = sceneWithButton();
    const host = makeHost();
    const mirror = createDomMirror({ scene: s, host });
    mirror.reconcile();
    const div1 = host.querySelector('#screean-mirror > div')!;
    mirror.reconcile();
    mirror.reconcile();
    const div2 = host.querySelector('#screean-mirror > div')!;
    // Same div reference, not recreated
    expect(div2).toBe(div1);
    expect(host.querySelectorAll('#screean-mirror > div').length).toBe(1);
    mirror.dispose();
  });
});
