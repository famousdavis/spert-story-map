// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * Load Sample (v0.58.0, contract §7) through the real Products page, frame and local driver: which names it treats as
 * taken, and the two guards on its click. The basic open-and-announce cases are in `projectsDashboardActions.test.tsx`;
 * the naming rule itself is `sampleName.test.ts`.
 * - Every product counts, an archived one included, and the names are read fresh at the click: a sample another tab
 *   added after this page loaded its list is taken too.
 * - A second click while one load is in flight is ignored: one product, never two of one name.
 * - A mouse click swallows the rest of its gesture (500 ms): a double-click's second click would otherwise land on the
 *   Map it opens, where a click on a rib card opens its editor. A keyboard activation swallows nothing.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import ProductList from '../pages/ProductList';
import ProductLayout from '../components/layout/ProductLayout';
import AppShell from '../components/layout/AppShell';
import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { resetLocalCaution } from '../lib/localCaution';
import { resetGestureGuard } from '../lib/gestureGuard';
import { resetAppAnnouncer } from '../lib/appAnnouncer';
import { installPageEnv, makeProject, seedLocal } from './fixtures/projectsPage';
import type { Product, StorageDriver } from '../types';

const driver = createLocalStorageDriver();
const names = () => (JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]') as { name: string }[]).map(e => e.name).sort();
const flush = () => act(async () => { for (let i = 0; i < 30; i += 1) await Promise.resolve(); });

/** The page, with a Map that counts the clicks it gets. */
function renderWithMap(onMapClick: () => void = () => {}) {
  return render(
    <MemoryRouter>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<ProductList />} />
          <Route path="/product/:productId" element={<ProductLayout />}>
            <Route path="storymap" element={<button type="button" onClick={onMapClick}>A rib card on the Map</button>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
}

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  storage.value = { driver, mode: 'local', storageReady: true };
  installPageEnv(vi);
});

afterEach(() => {
  cleanup();
  resetGestureGuard();
  resetAppAnnouncer();
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('the names Load Sample treats as taken', () => {
  it('an archived "Sample: Billing System v2" is taken: the new one is "(2)"', async () => {
    const archived = makeProject({ id: 'old', name: 'Sample: Billing System v2' });
    seedLocal([archived]);
    localStorage.setItem('rp:local:preferences', JSON.stringify({ projectPrefs: { old: { archived: true } } }));
    renderWithMap();
    await screen.findByText(/All products are archived/);
    await userEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sample: Billing System v2 (2)' })).toBeTruthy();
    expect(names()).toEqual(['Sample: Billing System v2', 'Sample: Billing System v2 (2)']);
  });

  it('a person\'s own product named like the sample is taken too', async () => {
    seedLocal([makeProject({ id: 'mine', name: 'Sample: Billing System v2', description: 'my own work' })]);
    renderWithMap();
    await screen.findByRole('list', { name: 'Products' });
    await userEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sample: Billing System v2 (2)' })).toBeTruthy();
  });

  it('read fresh at the click: a sample another tab added after this page loaded is taken', async () => {
    seedLocal([makeProject({ id: 'x', name: 'X' })]);
    renderWithMap();
    await screen.findByRole('list', { name: 'Products' });
    // Another tab adds a sample: this page's list on screen does not know.
    const other = makeProject({ id: 'other-tab', name: 'Sample: Billing System v2' });
    localStorage.setItem(`rp:local:product_${other.id}`, JSON.stringify(other));
    const index = JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]') as unknown[];
    localStorage.setItem('rp:local:products_index', JSON.stringify([...index, { id: other.id, name: other.name }]));
    await userEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
    expect(await screen.findByRole('heading', { level: 1, name: 'Sample: Billing System v2 (2)' })).toBeTruthy();
    expect(names()).toEqual(['Sample: Billing System v2', 'Sample: Billing System v2 (2)', 'X']);
  });
});

describe('the guards on the click', () => {
  it('a second click while the first load is in flight is ignored: one product', async () => {
    let release: () => void = () => {};
    const gate = new Promise<void>(r => { release = r; });
    const created: Product[] = [];
    const slow: StorageDriver = { ...driver, createProduct: async (p: Product, o?: { throwOnError?: boolean }) => { created.push(p); await gate; return driver.createProduct(p, o); } };
    storage.value = { driver: slow, mode: 'local', storageReady: true };
    seedLocal([makeProject({ id: 'x', name: 'X' })]);
    renderWithMap();
    await screen.findByRole('list', { name: 'Products' });
    const button = screen.getByRole('button', { name: 'Load Sample' });
    // Keyboard-style activations (detail 0) arm no gesture guard, so only the in-flight guard can stop the second.
    fireEvent.click(button, { detail: 0 });
    await flush();
    fireEvent.click(button, { detail: 0 });
    await flush();
    release();
    expect(await screen.findByRole('heading', { level: 1, name: 'Sample: Billing System v2' })).toBeTruthy();
    expect(created.map(p => p.name)).toEqual(['Sample: Billing System v2']);
    expect(names()).toEqual(['Sample: Billing System v2', 'X']);
  });

  it('a mouse click swallows the rest of its gesture: the Map it opens does not get the second click', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onMapClick = vi.fn();
    seedLocal([]);
    renderWithMap(onMapClick);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample Product' }), { detail: 1 });
    await flush();
    const card = screen.getByRole('button', { name: 'A rib card on the Map' });
    fireEvent.click(card, { detail: 2 });
    expect(onMapClick).not.toHaveBeenCalled();
    // Must-find control: the same click, once the gesture's 500 ms are over, reaches the card.
    act(() => { vi.advanceTimersByTime(500); });
    fireEvent.click(card, { detail: 1 });
    expect(onMapClick).toHaveBeenCalledTimes(1);
  });

  it('a keyboard activation (detail 0) swallows nothing: the next click reaches the Map', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const onMapClick = vi.fn();
    seedLocal([]);
    renderWithMap(onMapClick);
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'Load Sample Product' }), { detail: 0 });
    await flush();
    fireEvent.click(screen.getByRole('button', { name: 'A rib card on the Map' }), { detail: 1 });
    expect(onMapClick).toHaveBeenCalledTimes(1);
  });
});

describe('what is saved', () => {
  it('the sample is the sample, only renamed: its releases, sprints and items are all there', async () => {
    seedLocal([]);
    renderWithMap();
    await userEvent.click(await screen.findByRole('button', { name: 'Load Sample Product' }));
    await screen.findByRole('heading', { level: 1, name: 'Sample: Billing System v2' });
    const index = JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]') as { id: string }[];
    flushPendingSaves();
    const saved = JSON.parse(localStorage.getItem(`rp:local:product_${index[0]?.id}`) ?? 'null') as Product;
    expect(saved.name).toBe('Sample: Billing System v2');
    expect(saved.releases).toHaveLength(4);
    expect(saved.sprints).toHaveLength(4);
    expect(saved.themes.length).toBeGreaterThan(0);
  });
});
