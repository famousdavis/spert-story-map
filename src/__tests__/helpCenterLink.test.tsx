// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Adding a guide to public/? Also add it, with a one-line description, to spertsuite.com's
// src/data/help.ts (spert-landing-page). The landing page's daily "Guide list matches the app
// repos" check stays red until you do. The PDF guide house rules say the same.

// @vitest-environment jsdom

/**
 * The Help Center link (v0.56.3), in both headers: the Products page's and a product's. It opens
 * Story Map's page in the SPERT® Suite Help Center in a new tab.
 *
 * The URL is written out here, not imported: a test that reads the constant passes whatever the
 * constant says. jsdom applies no CSS, so "out of sight" is pinned as the `sr-only` class and the
 * colours as their class names; how they render was checked in a real browser, and the contrast
 * ratios measured there are in the pull request that added this file.
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
import { req } from './testHelpers';

const HELP_URL = 'https://spertsuite.com/help/storymap';
const NAME = 'Help Center (opens in a new tab)';
/** AA greys at rest and on hover, light and dark (v0.56.3). */
const SHARED_GREYS = ['text-sm', 'text-gray-500', 'hover:text-gray-600', 'dark:text-gray-400', 'dark:hover:text-gray-300'];

const driver = createLocalStorageDriver();

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/" element={<ProductList />} />
        <Route path="/product/:productId" element={<ProductLayout />}>
          <Route path="structure" element={<p>Structure page</p>} />
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

async function productsPageHeader(): Promise<HTMLElement> {
  seedOne();
  renderAt('/');
  await screen.findByRole('heading', { level: 2, name: 'Products' });
  return req(document.querySelector('header'), 'the Products page header');
}

async function productHeader(): Promise<HTMLElement> {
  renderAt(`/product/${seedOne()}/structure`);
  await screen.findByText('Structure page');
  return req(document.querySelector('header'), "a product's header");
}

const helpLink = (header: HTMLElement) => within(header).getByRole('link', { name: NAME });
const themeToggle = (header: HTMLElement) =>
  within(header).getByRole('button', { name: /^(Light mode|Dark mode|System default)$/ });
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
  ['the Products page header', productsPageHeader],
  ["a product's header", productHeader],
])('the Help Center link in %s', (_where, open) => {
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

  it('sits immediately right of the theme toggle', async () => {
    const header = await open();
    expect(helpLink(header).previousElementSibling).toBe(themeToggle(header));
  });

  it('uses the shared header-link greys, which reach AA contrast, not About\'s old ones', async () => {
    const link = helpLink(await open());
    expect(classes(link)).toEqual(expect.arrayContaining(SHARED_GREYS));
    expect(classes(link)).not.toContain('text-gray-400');
    expect(classes(link)).not.toContain('dark:text-gray-500');
  });
});

describe('on the Products page', () => {
  it('comes immediately before About', async () => {
    const header = await productsPageHeader();
    expect(helpLink(header).nextElementSibling).toBe(within(header).getByRole('link', { name: 'About' }));
  });

  it('About carries the same class string, so the pair cannot drift', async () => {
    const header = await productsPageHeader();
    const about = within(header).getByRole('link', { name: 'About' });
    expect(about.getAttribute('class')).toBe(helpLink(header).getAttribute('class'));
  });
});

describe("in a product's header", () => {
  it('comes immediately before the storage pill, where About sits on the Products page', async () => {
    const header = await productHeader();
    expect(helpLink(header).nextElementSibling).toBe(within(header).getByRole('button', { name: 'Sign in' }));
  });
});
