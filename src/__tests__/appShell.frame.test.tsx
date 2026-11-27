// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * N3 (FRAME26, v0.57.0): the SPERT® Suite app frame around every route, through the real `App`, on the real local
 * driver. What each screen must have (contract §3, §6, §7, §8):
 * - exactly one `h1`, in `main`'s heading row; no heading in the header (the brand title is not one);
 * - the skip link first, pointing at `main`;
 * - the brand: one `<a href="/">` with no `aria-label`, named by its visible title, both favicons decorative, each with
 *   its theme class; the tagline;
 * - the notices slot outside `main` and before it;
 * - `main` capped on About and the changelog only (X4), its heading row a direct child there; full bleed on the Map and
 *   Sizing only (X2); the footer everywhere but the Map and Sizing (X5).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: false }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { createSampleProduct } from '../lib/sampleData';
import { resetLocalCaution } from '../lib/localCaution';
import { flushPendingSaves } from '../lib/storage';
import App from '../App';
import { req } from './testHelpers';

const driver = createLocalStorageDriver();
let productId = '';

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  storage.value = { driver, mode: 'local', storageReady: true };
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('fetch', () => Promise.resolve(new Response('## Version 0.0.1 (2026-01-01)')));
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

/** The route, rendered, once its h1 shows. */
async function at(path: string, h1: string | RegExp) {
  render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
  await screen.findByRole('heading', { level: 1, name: h1 });
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  const app = req(document.querySelector<HTMLElement>('[data-sf="app"]'), 'the frame');
  const main = req(document.querySelector<HTMLElement>('main'), 'main');
  return { app, main };
}

const ROUTES = () => [
  ['/', 'Products', 'standard', true],
  ['/about', 'About SPERT® Story Map', 'capped', true],
  ['/changelog', 'Changelog', 'capped', true],
  [`/product/${productId}/structure`, 'Billing System v2', 'standard', true],
  [`/product/${productId}/progress`, 'Billing System v2', 'standard', true],
  [`/product/${productId}/settings`, 'Billing System v2', 'standard', true],
  [`/product/${productId}/storymap`, 'Billing System v2', 'bleed', false],
  [`/product/${productId}/sizing`, 'Billing System v2', 'bleed', false],
  ['/no-such-page', 'Page not found', 'standard', true],
] as const;

describe('the frame on every route (contract §3, §6, §7, §8)', () => {
  it('has one h1, in main\'s heading row, and no heading in the header; the skip link comes first', async () => {
    for (const [path, h1] of ROUTES()) {
      const { app, main } = await at(path, h1);
      const h1s = document.querySelectorAll('h1');
      expect(h1s, path).toHaveLength(1);
      const heading = req(h1s[0], 'h1');
      expect(main.contains(heading), path).toBe(true);
      expect(heading.getAttribute('data-sf'), path).toBe('heading');
      expect(heading.parentElement?.getAttribute('data-sf'), path).toBe('headrow');
      expect(within(req(document.querySelector<HTMLElement>('header'), 'header')).queryByRole('heading'), path).toBeNull();
      const skip = req(app.firstElementChild, 'the first element');
      expect(skip.getAttribute('data-sf'), path).toBe('skip');
      expect(skip.getAttribute('href'), path).toBe('#main');
      expect(skip.textContent).toBe('Skip to main content');
      expect(main.id).toBe('main');
      cleanup();
    }
  }, 60_000);

  it('the brand is one link home, named by its visible title, with both favicons decorative; the tagline', async () => {
    await at('/', 'Products');
    const brand = req(document.querySelector<HTMLElement>('[data-sf="brand"]'), 'brand');
    expect(brand.tagName).toBe('A');
    expect(brand.getAttribute('href')).toBe('/');
    expect(brand.getAttribute('aria-label')).toBeNull();
    expect(screen.getByRole('link', { name: 'SPERT® Story Map' })).toBe(brand);
    const icons = Array.from(brand.querySelectorAll('img'));
    expect(icons.map(i => [i.getAttribute('alt'), i.getAttribute('src'), i.getAttribute('data-sf')])).toEqual([
      ['', '/spert-favicon-storymap.png', 'favicon'], ['', '/spert-favicon-storymap-dark.png', 'favicon'],
    ]);
    expect(icons.map(i => i.className.includes('sf-icon--light') ? 'light' : i.className.includes('sf-icon--dark') ? 'dark' : '?')).toEqual(['light', 'dark']);
    expect(req(document.querySelector('[data-sf="tagline"]'), 'tagline').textContent).toBe('Plan and track agile product releases');
  });

  it('the notices slot sits outside main and before it, holding the app-wide notices in the suite\'s order', async () => {
    const { main } = await at('/', 'Products');
    const slot = req(document.querySelector<HTMLElement>('[data-sf="notices"]'), 'slot');
    expect(main.contains(slot)).toBe(false);
    expect(slot.compareDocumentPosition(main) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(slot.compareDocumentPosition(req(document.querySelector('[data-sf="nav"]'), 'nav')) & Node.DOCUMENT_POSITION_PRECEDING).toBeTruthy();
    await screen.findByText(/Your data exists only in this browser/);
    expect(Array.from(slot.children).map(c => c.className)).toEqual(['sf-notice sf-notice--info', 'sf-notice sf-notice--caution']);
  });

  it('main is capped on About and the changelog only, full bleed on the Map and Sizing only; no footer on those two', async () => {
    for (const [path, h1, kind, footer] of ROUTES()) {
      const { main } = await at(path, h1);
      const cls = main.className.split(/\s+/);
      expect(cls, path).toEqual(expect.arrayContaining(['sf-col', 'sf-main']));
      expect(cls.includes('sf-main--capped'), path).toBe(kind === 'capped');
      expect(cls.includes('sf-main--bleed'), path).toBe(kind === 'bleed');
      if (kind === 'capped') expect(req(main.firstElementChild, 'first child').getAttribute('data-sf'), path).toBe('headrow');
      expect(!!document.querySelector('[data-sf="footer"]'), path).toBe(footer);
      cleanup();
    }
  }, 60_000);
});
