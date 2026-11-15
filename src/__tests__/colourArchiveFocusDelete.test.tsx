// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.56.0 R-4, R-5, R86: where focus goes when a tile leaves or a product is deleted with archived
 * tiles about, and a delete's removal of the entry, through the real ProductList on the real local
 * driver. Split from colourArchivePage.test.tsx, which shares this harness.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, act, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { resetLocalCaution } from '../lib/localCaution';
import { resetGestureGuard } from '../lib/gestureGuard';
import { sanitizeProjectPrefs } from '../lib/projectPrefs';
import { req } from './testHelpers';
import { installPageEnv, makeProject, renderPage, seedLocal, tiles } from './fixtures/projectsPage';

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
const box = () => screen.queryByRole('checkbox', { name: /^Show archived/ });

describe('Delete (R-5) and focus (R-4, R86)', () => {
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

  it('R-4: Archive moves focus past a hidden tile to the next shown one', async () => {
    await show(['A', 'H', 'B'], { 'p-H': { archived: true } });
    await userEvent.click(button('A', 'Archive A'));
    await settle();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Open Structure for B');
  });

  it('R-4: a delete moves focus past a hidden tile to the previous shown one', async () => {
    await show(['A', 'H', 'B'], { 'p-H': { archived: true } });
    await userEvent.click(button('B', 'Delete B'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    await settle();
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Open Structure for A');
  });
});
