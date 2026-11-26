// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Adding a guide to public/? Also add it, with a one-line description, to spertsuite.com's
// src/data/help.ts (spert-landing-page). The landing page's daily "Guide list matches the app
// repos" check stays red until you do. The PDF guide house rules say the same.

// @vitest-environment jsdom

/**
 * The Help Center link (v0.56.3). Since v0.57.0 (FRAME26) it is the last element of the app
 * frame's navigation row, after Settings and About, on every page: the Products page and a
 * product's. It opens Story Map's page in the SPERT® Suite Help Center in a new tab.
 *
 * The URL is written out here, not imported: a test that reads the constant passes whatever the
 * constant says. jsdom applies no CSS, so "out of sight" is pinned as the `sr-only` class and the
 * look as the frame's `.sf-help` class, whose colour, size and hover underline are the vendored
 * stylesheet's; frame-check measures how they render.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: false }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { createSampleProduct } from '../lib/sampleData';
import { resetLocalCaution } from '../lib/localCaution';
import { flushPendingSaves } from '../lib/storage';
import ProductList from '../pages/ProductList';
import ProductLayout from '../components/layout/ProductLayout';
import AppShell from '../components/layout/AppShell';
import { req } from './testHelpers';

const HELP_URL = 'https://spertsuite.com/help/storymap';
const NAME = 'Help Center (opens in a new tab)';

const driver = createLocalStorageDriver();

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<ProductList />} />
          <Route path="/product/:productId" element={<ProductLayout />}>
            <Route path="structure" element={<p>Structure page</p>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

function seedOne(): string {
  const p = createSampleProduct();
  localStorage.setItem(`rp:local:product_${p.id}`, JSON.stringify(p));
  localStorage.setItem('rp:local:products_index', JSON.stringify([{ id: p.id, name: p.name }]));
  return p.id;
}

/** The navigation row's app zone (Settings · About · Help Center) on the Products page. */
async function productsPageZone(): Promise<HTMLElement> {
  seedOne();
  renderAt('/');
  await screen.findByRole('heading', { level: 1, name: 'Products' });
  return req(document.querySelector<HTMLElement>('[data-sf="nav-app"]'), 'the Products page\'s app zone');
}

/** The same zone inside a product. */
async function productZone(): Promise<HTMLElement> {
  renderAt(`/product/${seedOne()}/structure`);
  await screen.findByText('Structure page');
  return req(document.querySelector<HTMLElement>('[data-sf="nav-app"]'), "a product's app zone");
}

const helpLink = (zone: HTMLElement) => within(zone).getByRole('link', { name: NAME });
const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  storage.value = { driver, mode: 'local', storageReady: true };
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe.each([
  ['the Products page', productsPageZone],
  ['a product', productZone],
])('the Help Center link on %s', (_where, open) => {
  it('links to Story Map\'s Help Center page, the whole URL', async () => {
    const link = helpLink(await open());
    expect(link.getAttribute('href')).toBe(HELP_URL);
  });

  it('opens in a new tab, without the opener or the referrer', async () => {
    const link = helpLink(await open());
    expect(link.getAttribute('target')).toBe('_blank');
    const rel = (link.getAttribute('rel') ?? '').split(/\s+/);
    expect(rel).toContain('noopener');
    expect(rel).toContain('noreferrer');
  });

  it('is named "Help Center (opens in a new tab)": the arrow is hidden from screen readers, the new tab said in words', async () => {
    const link = helpLink(await open());
    const spans = [...link.querySelectorAll('span')];
    const arrow = req(spans.find(s => s.textContent?.includes('↗')), 'the arrow');
    expect(arrow.getAttribute('aria-hidden')).toBe('true');
    const said = req(spans.find(s => s.textContent?.includes('opens in a new tab')), 'the new-tab words');
    expect(said.textContent).toBe('(opens in a new tab)');
  });

  it('keeps the new-tab words out of sight: what shows is "Help Center ↗"', async () => {
    const link = helpLink(await open());
    const said = req([...link.querySelectorAll('span')].find(s => s.textContent?.includes('opens in a new tab')), 'the new-tab words');
    expect(classes(said)).toContain('sr-only');
    const shown = [...link.childNodes].filter(n => n !== said).map(n => n.textContent).join('');
    expect(shown.trim()).toBe('Help Center ↗');
  });

  it('is the navigation row\'s last element, right after About (contract §3: Settings · About · Help Center)', async () => {
    const zone = await open();
    expect(zone.lastElementChild).toBe(helpLink(zone));
    expect(helpLink(zone).previousElementSibling).toBe(within(zone).getByRole('link', { name: 'About' }));
  });

  it('wears the frame\'s `.sf-help` and nothing else: no utility colour or size to fight the stylesheet', async () => {
    const link = helpLink(await open());
    expect(classes(link)).toEqual(['sf-help']);
    expect(link.getAttribute('aria-current')).toBeNull();
  });
});
