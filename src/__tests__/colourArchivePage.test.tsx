// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.56.0: tile colour and archive on the Products page, through the real ProductList, ProjectTile,
 * useProjectOrder and useProductArchive on the real local driver (R-1 to R-5, R61 with R86, R84, R88).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, act, within, waitFor, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { resetLocalCaution } from '../lib/localCaution';
import { resetGestureGuard } from '../lib/gestureGuard';
import { findTileControl } from '../components/product/tile-focus';
import { sanitizeProjectPrefs } from '../lib/projectPrefs';
import { req } from './testHelpers';
import { installPageEnv, makeProject, renderPage, seedLocal, tileNames, tiles } from './fixtures/projectsPage';
import type { StorageDriver } from '../types';

const driver = createLocalStorageDriver();
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  storage.value = { driver, mode: 'local', storageReady: true };
  installPageEnv(vi);
});
afterEach(() => {
  cleanup();
  resetGestureGuard();
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
});

type Prefs = Record<string, { color?: string; archived?: boolean }>;
function seed(names: string[], projectPrefs: Prefs = {}) {
  seedLocal(names.map(n => makeProject({ id: `p-${n}`, name: n })));
  localStorage.setItem('rp:local:preferences', JSON.stringify({ projectPrefs }));
}
/** The stored map as the page reads it: a field removal leaves an empty entry, which reads as none. */
function storedPrefs(): Prefs {
  flushPendingSaves();
  return sanitizeProjectPrefs((JSON.parse(localStorage.getItem('rp:local:preferences') ?? '{}') as { projectPrefs?: unknown }).projectPrefs);
}
async function show(names: string[], projectPrefs: Prefs = {}) {
  seed(names, projectPrefs);
  renderPage();
  await screen.findByText('Products');
  await settle();
}
const tileOf = (name: string) => req(tiles().find(t => t.querySelector('h3')?.textContent === name), `tile ${name}`);
const button = (name: string, label: string) => within(tileOf(name)).getByRole('button', { name: label });
const status = () => document.querySelector('main [role="status"].sr-only')?.textContent ?? '';
const box = () => screen.queryByRole('checkbox', { name: /^Show archived/ });

describe('Archive (R-3)', () => {
  it('an archived tile leaves the grid; the box counts it; focus goes to the next tile; it is said', async () => {
    await show(['A', 'B', 'C']);
    expect(box()).toBeNull();
    await userEvent.click(button('A', 'Archive A'));
    await settle();
    expect(tileNames()).toEqual(['B', 'C']);
    expect(req(box(), 'box').parentElement?.textContent).toBe('Show archived (1)');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Open Structure for B');
    expect(status()).toBe('Archived "A". Show archived (1) lists it.');
    expect(storedPrefs()).toEqual({ 'p-A': { archived: true } });
  });

  it('ticked, an archived tile shows in its place with the archived look; Unarchive only unarchives', async () => {
    await show(['A', 'B'], { 'p-A': { archived: true, color: 'teal' } });
    expect(tileNames()).toEqual(['B']);
    await userEvent.click(req(box(), 'box'));
    expect(tileNames()).toEqual(['A', 'B']);
    const a = tileOf('A');
    expect(a.dataset.archived).toBe('true');
    expect(a.className).toContain('border-dashed');
    expect(a.className).toContain('bg-[color-mix(in_srgb,#d9f4f1_50%,#f9f9f9)]');
    expect(within(a).getByText('Archived')).toBeTruthy();
    expect(findTileControl(document.body, 'p-A', 'open')?.getAttribute('aria-label')).toBe('Unarchive and open Structure for A');
    await userEvent.click(button('A', 'Unarchive A'));
    await settle();
    expect(storedPrefs()).toEqual({ 'p-A': { color: 'teal' } });
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Archive A');
    expect(status()).toBe('Unarchived "A".');
    expect(box()).toBeNull();
  });

  it('R86: the archived tile\'s open button unarchives it and opens Structure', async () => {
    await show(['A', 'B'], { 'p-A': { archived: true } });
    await userEvent.click(req(box(), 'box'));
    await userEvent.click(button('A', 'Unarchive and open Structure for A'));
    expect(await screen.findByText('Structure page')).toBeTruthy();
    expect(storedPrefs()).toEqual({});
  });

  it('every product archived and the box off: the line, not the welcome panel', async () => {
    await show(['A'], { 'p-A': { archived: true } });
    expect(screen.getByText('All products are archived. Select "Show archived (1)" to see them.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Load Sample Product' })).toBeNull();
  });

  it('the box counts listed products, never map entries', async () => {
    await show(['A'], { 'p-A': { archived: true }, gone: { archived: true } });
    expect(req(box(), 'box').parentElement?.textContent).toBe('Show archived (1)');
  });

  it('a drop with an archived tile hidden between keeps it in its slot (R-4)', async () => {
    seed(['A', 'H', 'B', 'C'], { 'p-H': { archived: true } });
    const prefs = JSON.parse(localStorage.getItem('rp:local:preferences')!);
    localStorage.setItem('rp:local:preferences', JSON.stringify({ ...prefs, projectOrder: ['p-A', 'p-H', 'p-B', 'p-C'] }));
    renderPage();
    await screen.findByRole('list', { name: 'Products' });
    await settle();
    const dt = { setData: vi.fn(), setDragImage: vi.fn(), dropEffect: '', effectAllowed: '' };
    fireEvent.dragStart(req(tileOf('A').querySelector('[draggable="true"]'), 'grip'), { dataTransfer: dt });
    fireEvent.dragOver(tileOf('B'), { dataTransfer: dt });
    fireEvent.drop(tileOf('B'), { dataTransfer: dt });
    await settle();
    flushPendingSaves();
    expect(JSON.parse(localStorage.getItem('rp:local:preferences')!).projectOrder).toEqual(['p-B', 'p-H', 'p-A', 'p-C']);
  });
});

describe('Tile colour (R-2)', () => {
  it('a pick is stored as one field and tints the tile; No color removes it', async () => {
    await show(['A']);
    await userEvent.click(button('A', 'Tile color for A: No color'));
    await userEvent.click(screen.getByRole('radio', { name: 'Blue' }));
    expect(tileOf('A').dataset.color).toBe('blue');
    expect(storedPrefs()).toEqual({ 'p-A': { color: 'blue' } });
    await userEvent.click(button('A', 'Tile color for A: Blue'));
    await userEvent.click(screen.getByRole('radio', { name: 'No color' }));
    expect(storedPrefs()).toEqual({});
  });

  it('Escape in the colour panel goes no further (the import preview would cancel on it)', async () => {
    await show(['A']);
    const seen = vi.fn();
    document.addEventListener('keydown', seen);
    try {
      await userEvent.click(button('A', 'Tile color for A: No color'));
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog', { name: 'Tile color' })).toBeNull();
      expect(seen).not.toHaveBeenCalled();
    } finally {
      document.removeEventListener('keydown', seen);
    }
  });

  it('a clone takes its source\'s colour, never its archive (R-5)', async () => {
    await show(['A'], { 'p-A': { color: 'pink', archived: true } });
    await userEvent.click(req(box(), 'box'));
    await userEvent.click(button('A', 'Clone A'));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    const clone = req(tiles().find(t => t.dataset.projectId !== 'p-A'), 'clone');
    expect(clone.dataset.color).toBe('pink');
    expect(clone.dataset.archived).toBeUndefined();
    expect(storedPrefs()[clone.dataset.projectId!]).toEqual({ color: 'pink' });
  });
});

describe('Delete (R-5)', () => {
  it('removes the entry once the product is gone', async () => {
    await show(['A', 'B'], { 'p-A': { color: 'blue' }, 'p-B': { color: 'teal' } });
    await userEvent.click(button('A', 'Delete A'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    await settle();
    expect(storedPrefs()).toEqual({ 'p-B': { color: 'teal' } });
  });

  it('a refused delete keeps the entry', async () => {
    storage.value = { driver: { ...driver, deleteProduct: () => Promise.resolve() } as StorageDriver, mode: 'local', storageReady: true };
    await show(['A', 'B'], { 'p-A': { color: 'blue' } });
    await userEvent.click(button('A', 'Delete A'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settle();
    expect(tiles()).toHaveLength(2);
    expect(storedPrefs()).toEqual({ 'p-A': { color: 'blue' } });
  });

  it('removes an entry another tab set after this one loaded (no listener)', async () => {
    await show(['A', 'B']);
    localStorage.setItem('rp:local:preferences', JSON.stringify({ projectPrefs: { 'p-A': { color: 'pink' } } }));
    await userEvent.click(button('A', 'Delete A'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    await settle();
    expect(storedPrefs()).toEqual({});
  });

  it('R86: focus that moves to an archived tile reaches its open button', async () => {
    await show(['A', 'B'], { 'p-A': { archived: true } });
    await userEvent.click(req(box(), 'box'));
    await userEvent.click(button('B', 'Delete B'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    await settle();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Unarchive and open Structure for A');
  });
});

describe('Refused ids and the cap (R-1)', () => {
  it('a product whose id the settings cannot hold has colour and archive off, with the reason', async () => {
    seedLocal([makeProject({ id: 'toString', name: 'T' })]);
    renderPage();
    await screen.findByRole('list', { name: 'Products' });
    await settle();
    const archive = button('T', 'Archive T') as HTMLButtonElement;
    const color = button('T', 'Tile color for T: No color') as HTMLButtonElement;
    for (const b of [archive, color]) {
      expect(b.disabled).toBe(true);
      expect(b.title).toBe("This product's id cannot hold a tile color or archive.");
      expect(document.getElementById(req(b.getAttribute('aria-describedby'), 'describedby'))?.textContent).toBe(b.title);
    }
  });

  it('at the cap a new entry is not stored, and the page says so', async () => {
    const full: Prefs = {};
    for (let i = 0; i < 1000; i++) full[`x${i}`] = { color: 'blue' };
    await show(['A'], full);
    await userEvent.click(button('A', 'Archive A'));
    const cap = 'Not saved: tile colors and archive can be kept for at most 1000 products.';
    expect(screen.getAllByText(cap).filter(p => !p.closest('[role="status"]'))).toHaveLength(1);
    expect(tileNames()).toEqual(['A']);
    expect(storedPrefs()['p-A']).toBeUndefined();
  });
});

describe('The first settings read (R-3, R88)', () => {
  it('the grid waits for it, so an archived tile never shows', async () => {
    let release: () => void = () => {};
    const held = new Promise<void>(r => { release = r; });
    storage.value = {
      driver: { ...driver, loadPreferences: async (o?: { throwOnError?: boolean }) => { await held; return driver.loadPreferences(o); } } as StorageDriver,
      mode: 'local', storageReady: true,
    };
    await show(['A', 'B'], { 'p-A': { archived: true } });
    expect(screen.getByText('Loading products...')).toBeTruthy();
    expect(tiles()).toHaveLength(0);
    await act(async () => { release(); await held; });
    await settle();
    expect(tileNames()).toEqual(['B']);
  });

  it('when it fails: every tile, the notice, and colour, archive and drag off with the reason', async () => {
    storage.value = {
      driver: {
        ...driver,
        loadPreferences: (o?: { throwOnError?: boolean }) => (o?.throwOnError ? Promise.reject(new Error('offline')) : driver.loadPreferences()),
      } as StorageDriver,
      mode: 'local', storageReady: true,
    };
    await show(['A', 'B'], { 'p-A': { archived: true } });
    expect(tileNames()).toEqual(['A', 'B']);
    expect(screen.getByText('Tile colors, archive and order could not be loaded, so they are turned off for now. Reload the page to try again.')).toBeTruthy();
    const reason = 'Tile colors, archive and order could not be loaded.';
    expect((button('A', 'Archive A') as HTMLButtonElement).disabled).toBe(true);
    expect(button('A', 'Archive A').title).toBe(reason);
    expect((button('A', 'Tile color for A: No color') as HTMLButtonElement).disabled).toBe(true);
    const grip = req(tileOf('A').querySelector('span[title]'), 'grip');
    expect(grip.getAttribute('draggable')).toBe('false');
    expect(grip.getAttribute('title')).toBe(reason);
  });
});
