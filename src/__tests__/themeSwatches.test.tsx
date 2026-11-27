// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * S5 of FRAME26 pass 3 (v0.59.0): Structure's theme colour swatches had no names. On production v0.58.0 Chrome's
 * accessibility tree gave all eight the name "" and no pressed state. Each is now named for its colour (William's words,
 * 2026-11-27: Blue, Teal, Violet, Rose, Amber, Emerald, Indigo, Orange) and is `aria-pressed` when it is the theme's
 * chosen colour: the same test that draws its ring, so a theme on its index colour (no colour chosen) has none pressed.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import StructureView from '../pages/StructureView';
import { THEME_COLOR_OPTIONS } from '../lib/themeColors';
import { mountHosted } from './fixtures/productHost';
import { makeProduct, makeRib } from './fixtures/progressIntegrity';
import { req } from './testHelpers';
import type { ColorKey } from '../types';

const NAMES = ['Blue', 'Teal', 'Violet', 'Rose', 'Amber', 'Emerald', 'Indigo', 'Orange'];

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

function openPicker(color: ColorKey | undefined) {
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  const product = makeProduct([makeRib('r1', [], [], 'M')]);
  const theme = req(product.themes[0], 'the theme');
  if (color) theme.color = color; else delete theme.color;
  const hosted = mountHosted(StructureView, product);
  const trigger = screen.getByRole('button', { name: 'Change theme color' });
  fireEvent.click(trigger);
  const picker = req(trigger.parentElement?.querySelector<HTMLElement>('div.absolute'), 'the open picker');
  return { hosted, picker, swatches: within(picker).getAllByRole('button') };
}

describe('the theme colour swatches are named and say which is chosen (S5)', () => {
  it('the palette carries the eight names, in its order', () => {
    expect(THEME_COLOR_OPTIONS.map(o => o.label)).toEqual(NAMES);
  });

  it('each swatch is named for its colour, in palette order', () => {
    const { swatches } = openPicker('teal');
    expect(swatches.map(b => b.getAttribute('aria-label'))).toEqual(NAMES);
    for (const name of NAMES) expect(screen.getByRole('button', { name })).toBeTruthy();
  });

  it('exactly the chosen colour is pressed, the one with the ring', () => {
    const { swatches } = openPicker('teal');
    expect(swatches.map(b => b.getAttribute('aria-pressed'))).toEqual(['false', 'true', 'false', 'false', 'false', 'false', 'false', 'false']);
    const pressed = screen.getByRole('button', { name: 'Teal', pressed: true });
    expect(pressed.className).toContain('ring-2');
    expect(swatches.filter(b => (b.getAttribute('class') ?? '').includes('ring-2'))).toEqual([pressed]);
  });

  it('a theme with no colour chosen (drawn in its index colour) has none pressed, as none has the ring', () => {
    const { swatches } = openPicker(undefined);
    expect(swatches.every(b => b.getAttribute('aria-pressed') === 'false')).toBe(true);
    expect(swatches.some(b => (b.getAttribute('class') ?? '').includes('ring-2'))).toBe(false);
  });

  it('choosing a swatch stores its colour; reopened, that one is pressed', () => {
    const { hosted } = openPicker('teal');
    fireEvent.click(screen.getByRole('button', { name: 'Amber' }));
    expect(hosted.product.themes[0]?.color).toBe('amber');
    fireEvent.click(screen.getByRole('button', { name: 'Change theme color' }));
    expect(screen.getByRole('button', { name: 'Amber', pressed: true })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Teal', pressed: false })).toBeTruthy();
  });
});
