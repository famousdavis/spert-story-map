// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * N10 (FRAME26, v0.57.0, OP1 and D2): the Map and Sizing are canvases that run full bleed (exception X2) with no
 * footer (X5), under the product's heading row.
 *
 * Only their outer box changed: the old `-mx-6 -mt-6` (which cancelled ProductLayout's own padding) went, and the
 * height runs from the canvas's top to the window's bottom. That top is the frame's own geometry, so it is computed
 * here from the vendored stylesheet, not restated: brand row + navigation row + `main`'s top padding + the heading row +
 * the 16 px under it. `-mb-12` takes back `main`'s 48 px bottom padding, so the page itself does not scroll. Measured
 * in Chrome at 1280 × 800: the canvas 176 → 800, 624 px tall (688 before, under the old 98 px header).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: false }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { createSampleProduct } from '../lib/sampleData';
import { resetLocalCaution } from '../lib/localCaution';
import { flushPendingSaves } from '../lib/storage';
import { CANVAS_HEIGHT, CANVAS_TOP } from '../lib/framePlace';
import App from '../App';
import StoryMapView from '../pages/StoryMapView';
import SizingView from '../pages/SizingView';
import { mountHosted } from './fixtures/productHost';
import { req } from './testHelpers';

const FRAME = readFileSync(resolve(__dirname, '../styles/spert-frame.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
const px = (re: RegExp, what: string) => Number(req(re.exec(FRAME)?.[1], what));

const driver = createLocalStorageDriver();
let productId = '';

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  storage.value = { driver, mode: 'local', storageReady: true };
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('scrollTo', vi.fn());
  const p = createSampleProduct();
  productId = p.id;
  localStorage.setItem(`rp:local:product_${p.id}`, JSON.stringify(p));
  localStorage.setItem('rp:local:products_index', JSON.stringify([{ id: p.id, name: p.name }]));
});

afterEach(() => {
  cleanup();
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('the canvas views\' outer box (X2, X5)', () => {
  it('the canvas starts where the frame\'s geometry ends: 56 + 44 + 24 + 36 + 16 = 176 px', () => {
    const top = px(/--sf-bar-h:\s*(\d+)px/, '--sf-bar-h') + px(/--sf-nav-h:\s*(\d+)px/, '--sf-nav-h')
      + px(/\.sf-main \{[^}]*padding-top:\s*(\d+)px/, '.sf-main padding-top') + px(/\.sf-headrow \{[^}]*min-height:\s*(\d+)px/, '.sf-headrow min-height')
      + px(/\.sf-below \{\s*margin-top:\s*(\d+)px/, '.sf-below margin-top');
    expect(top).toBe(176);
    expect(CANVAS_TOP).toBe(top);
    expect(CANVAS_HEIGHT).toBe('calc(100vh - 176px)');
    // -mb-12 is 48 px: exactly `main`'s bottom padding.
    expect(px(/\.sf-main \{[^}]*padding-bottom:\s*(\d+)px/, '.sf-main padding-bottom')).toBe(48);
  });

  it.each([['the Map', StoryMapView], ['Sizing', SizingView]] as const)('%s: its root fills to the window\'s bottom, with no side or top cancelling', (_name, View) => {
    mountHosted(View, createSampleProduct());
    const root = req(document.body.querySelector<HTMLElement>('[data-map-container]')?.closest<HTMLElement>('.relative.-mb-12') ?? null, 'the canvas root');
    const cls = root.className.split(/\s+/);
    expect(cls).toEqual(expect.arrayContaining(['relative', '-mb-12']));
    expect(cls.filter(c => /^-m[xt]-/.test(c))).toEqual([]);
    expect(root.style.height).toBe('calc(100vh - 176px)');
  });

  it.each([['storymap', true], ['sizing', true], ['structure', false]] as const)('/product/…/%s: bleed and no footer (%s), the heading row in the column', async (tab, canvas) => {
    render(<MemoryRouter initialEntries={[`/product/${productId}/${tab}`]}><App /></MemoryRouter>);
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Billing System v2' });
    await act(async () => { await new Promise(r => setTimeout(r, 0)); });
    const main = req(document.querySelector<HTMLElement>('main'), 'main');
    const headrow = req(h1.parentElement, 'heading row');
    expect(main.classList.contains('sf-main--bleed')).toBe(canvas);
    expect(!!document.querySelector('[data-sf="footer"]')).toBe(!canvas);
    // Full bleed: the row would start at x 0, so it sits in the shared column; elsewhere `main` is the column.
    expect(headrow.parentElement?.classList.contains('sf-col')).toBe(true);
    expect(headrow.parentElement === main).toBe(!canvas);
  });
});
