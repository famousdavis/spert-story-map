// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * The project page's two ways back to the project list (v0.53.33): "← Projects"
 * in the header and "Back to projects" on the "Project not found" screen. Both
 * are router links, so leaving a project keeps the page loaded.
 *
 * jsdom cannot show a page load: a plain `<a href="/">` neither reloads nor
 * routes there, it only logs "Not implemented: navigation". So what these
 * tests can see is the router's half: after the click, the project list is on
 * screen. A plain link leaves the project page in place and fails that. The
 * "no page load" half was checked in a real browser, with a marker on `window`
 * that a page load would clear; the pull request that added this file records it.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
import type { StorageDriver } from '../types';

const CAUTION = /Your data exists only in this browser/;
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

const listHeading = () => screen.findByRole('heading', { level: 2, name: 'Projects' });
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

let scrollTo: ReturnType<typeof vi.fn>;

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  storage.value = { driver, mode: 'local', storageReady: true };
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  scrollTo = vi.fn();
  vi.stubGlobal('scrollTo', scrollTo);
});

afterEach(() => {
  cleanup();
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('"← Projects" on a project page', () => {
  it('opens the project list in the app, at the top, with a dismissed caution still dismissed', async () => {
    const p = createSampleProduct();
    localStorage.setItem(`rp:local:product_${p.id}`, JSON.stringify(p));
    localStorage.setItem('rp:local:products_index', JSON.stringify([{ id: p.id, name: p.name }]));
    renderAt(`/product/${p.id}/structure`);
    await screen.findByText('Structure page');
    const caution = await screen.findByText(CAUTION);
    await userEvent.click(caution.closest('div')!.querySelector('button')!);

    await userEvent.click(screen.getByRole('link', { name: '← Projects' }));

    expect(await listHeading()).toBeTruthy();
    expect(screen.queryByText('Structure page')).toBeNull();
    expect(scrollTo).toHaveBeenCalledWith(0, 0);
    await screen.findByText(p.name);
    await settle();
    expect(screen.queryByText(CAUTION)).toBeNull();
  });
});

describe('"Back to projects" on "Project not found"', () => {
  it('opens the project list in the app', async () => {
    // Only a cloud project can reach this screen: local mode goes home by itself.
    const missing: StorageDriver = {
      ...driver,
      loadProduct: () => Promise.resolve(null),
      loadProductIndex: () => Promise.resolve([]),
      onProductChange: () => () => {},
      onProductSaved: () => () => {},
    };
    storage.value = { driver: missing, mode: 'cloud', storageReady: true };
    renderAt('/product/gone/structure');
    await screen.findByText('Project not found');

    await userEvent.click(screen.getByRole('link', { name: 'Back to projects' }));

    expect(await listHeading()).toBeTruthy();
    expect(screen.queryByText('Project not found')).toBeNull();
  });
});
