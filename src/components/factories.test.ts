import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { __resetNodeIds } from 'screean';
import {
  installOffscreenCanvasStub,
  uninstallOffscreenCanvasStub,
} from '../testing/offscreenCanvasStub';
import { __resetComponentIds } from './component';
import { button } from './button';
import { label } from './label';
import { isComponent } from './types';

beforeAll(installOffscreenCanvasStub);
afterAll(uninstallOffscreenCanvasStub);
beforeEach(() => {
  __resetNodeIds();
  __resetComponentIds();
});

describe('label()', () => {
  it('produces a Component tagged with role=text by default', () => {
    const l = label({ label: 'Hello' });
    expect(isComponent(l)).toBe(true);
    expect(l._component.role).toBe('text');
  });

  it('accepts ariaRole=heading for h1-equivalents', () => {
    const l = label({ label: 'Big', ariaRole: 'heading' });
    expect(l._component.role).toBe('heading');
  });

  it('uses the visible text as the ariaLabel — guaranteed by construction', () => {
    const l = label({ label: 'Welcome back' });
    expect(l._component.ariaLabel).toBe('Welcome back');
  });

  it('has no onClick handler (non-interactive)', () => {
    const l = label({ label: 'X' });
    expect(l._component.handlers.onClick).toBeUndefined();
  });
});

describe('button()', () => {
  it('produces a Component tagged with role=button', () => {
    const b = button({ label: 'Start', onClick: () => {} });
    expect(isComponent(b)).toBe(true);
    expect(b._component.role).toBe('button');
  });

  it('contains BOTH a rect leaf and a text leaf as descendants', () => {
    const b = button({ label: 'Go', onClick: () => {} });
    // The button node is a `stack`; children are [rect, text].
    expect(b.children).toHaveLength(2);
    expect(b.children[0].field).toBeDefined(); // rect
    expect(b.children[1].field).toBeDefined(); // text
  });

  it('with empty label skips the text leaf (icon-only chrome)', () => {
    const b = button({
      label: '',
      onClick: () => {},
      ariaLabel: 'Close dialog',
    });
    expect(b.children).toHaveLength(1); // rect only
  });

  it('defaults ariaLabel from the visible label', () => {
    const b = button({ label: 'Save', onClick: () => {} });
    expect(b._component.ariaLabel).toBe('Save');
  });

  it('explicit ariaLabel wins when provided', () => {
    const b = button({
      label: '→',
      onClick: () => {},
      ariaLabel: 'Next page',
    });
    expect(b._component.ariaLabel).toBe('Next page');
  });

  it('stores the onClick handler on the component', () => {
    const onClick = () => {};
    const b = button({ label: 'X', onClick });
    expect(b._component.handlers.onClick).toBe(onClick);
  });

  it('honors width, height, radius opts — produces a rect with those dims', () => {
    const b = button({
      label: 'X',
      onClick: () => {},
      width: 300,
      height: 72,
      radius: 20,
    });
    // Stack's intrinsic is the max of its children's intrinsics. The rect
    // chrome is the bigger of the two, so stack.intrinsic should match the
    // explicit chrome size.
    expect(b.intrinsic?.w).toBe(300);
    expect(b.intrinsic?.h).toBe(72);
  });

  it('disabled flag flows through', () => {
    const b = button({ label: 'Z', onClick: () => {}, disabled: true });
    expect(b._component.disabled).toBe(true);
  });

  it('pressed flag flows through (for toggle-buttons)', () => {
    const b = button({ label: 'Mute', onClick: () => {}, pressed: true });
    expect(b._component.pressed).toBe(true);
  });

  it('checked flag flows through (for button-as-checkbox)', () => {
    const b = button({ label: 'Agree', onClick: () => {}, checked: 'mixed' });
    expect(b._component.checked).toBe('mixed');
  });
});
