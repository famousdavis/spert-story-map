// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.56.0 R84: an import that writes a product this person has archived keeps it archived and says
 * so, on both import surfaces: the Products page's import banner (the real ProductList) and
 * Settings → Data (the real DataSection), each on the real local driver.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, act, render, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { resetLocalCaution } from '../lib/localCaution';
import { resetGestureGuard } from '../lib/gestureGuard';
import DataSection from '../components/settings/DataSection';
import { req } from './testHelpers';
import { installPageEnv, makeProject, renderPage, seedLocal, tileNames } from './fixtures/projectsPage';
import type { Product } from '../types';

const driver = createLocalStorageDriver();
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
type Prefs = Record<string, { color?: string; archived?: boolean }>;
const setPrefs = (projectPrefs: Prefs) => localStorage.setItem('rp:local:preferences', JSON.stringify({ projectPrefs }));
function storedPrefs(): Prefs {
  flushPendingSaves();
  // Read raw (no import of the normaliser), so the file also runs on a tree without it.
  return (JSON.parse(localStorage.getItem('rp:local:preferences') ?? '{}') as { projectPrefs?: Prefs }).projectPrefs ?? {};
}
const fileOf = (content: unknown) => new File([JSON.stringify(content)], 'p.json', { type: 'application/json' });
const fileInput = () => req(document.querySelector<HTMLInputElement>('input[type="file"]'), 'file input');

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

describe('R84 on the Products page', () => {
  async function importOver(stored: Product[], prefs: Prefs, file: unknown, replace: string[], done = /replaced/) {
    seedLocal(stored);
    setPrefs(prefs);
    renderPage();
    await screen.findByText('Products');
    await settle();
    await userEvent.upload(fileInput(), fileOf(file));
    for (const name of replace) {
      await userEvent.click(within(await screen.findByRole('radiogroup', { name: `Decision for ${name}` })).getByLabelText('Replace existing'));
    }
    await userEvent.click(await screen.findByRole('button', { name: 'Confirm Import' }));
    await screen.findByText(done);
    await settle();
  }

  // PR #245 review -04 (KB14): an entry can outlive its product (removed elsewhere, no delete here),
  // and an import that ADDS that product back writes an archived product too.
  it('an added product that is archived stays archived, and the banner says so', async () => {
    const a = makeProject({ id: 'p-A', name: 'Alpha' });
    await importOver([makeProject({ id: 'p-B', name: 'B' })], { 'p-A': { archived: true } }, a, [], /1 added/);
    expect(screen.getByText('“Alpha” is archived: Show archived lists it.')).toBeTruthy();
    expect(tileNames()).toEqual(['B']);
  });

  it('a replaced product that is archived stays archived, and the banner says so', async () => {
    const a = makeProject({ id: 'p-A', name: 'Alpha' });
    await importOver([a, makeProject({ id: 'p-B', name: 'B' })], { 'p-A': { archived: true } }, { ...a, description: 'new' }, ['Alpha']);
    expect(screen.getByText('“Alpha” is archived: Show archived lists it.')).toBeTruthy();
    expect(storedPrefs()).toEqual({ 'p-A': { archived: true } });
    expect(tileNames()).toEqual(['B']);
  });

  it('several: one line naming them', async () => {
    const a = makeProject({ id: 'p-A', name: 'Alpha' });
    const b = makeProject({ id: 'p-B', name: 'Beta' });
    await importOver([a, b, makeProject({ id: 'p-C', name: 'C' })], { 'p-A': { archived: true }, 'p-B': { archived: true } }, [a, b], ['Alpha', 'Beta']);
    expect(screen.getByText('“Alpha” and “Beta” are archived: Show archived lists them.')).toBeTruthy();
  });

  it('a replace by name names the product it wrote over, by that product\'s id', async () => {
    const a = makeProject({ id: 'p-A', name: 'Alpha' });
    await importOver([a, makeProject({ id: 'p-B', name: 'B' })], { 'p-A': { archived: true } }, { ...a, id: 'other-id' }, ['Alpha']);
    expect(screen.getByText('“Alpha” is archived: Show archived lists it.')).toBeTruthy();
    expect(tileNames()).toEqual(['B']);
  });

  it('control: a replaced product that is not archived gets no line', async () => {
    const a = makeProject({ id: 'p-A', name: 'Alpha' });
    await importOver([a], { 'p-A': { color: 'teal' } }, a, ['Alpha']);
    expect(screen.queryByText(/is archived/)).toBeNull();
    expect(tileNames()).toEqual(['Alpha']);
  });
});

describe('R84 on Settings → Data', () => {
  async function replaceOpen(prefs: Prefs, fileId?: string, beforeUpload: () => void = () => {}) {
    seedLocal([makeProject({ id: 'p-A', name: 'Alpha' })]);
    setPrefs(prefs);
    const product = req(await driver.loadProduct('p-A'), 'product');
    render(<DataSection product={product} driver={driver} updateProduct={() => {}} />);
    beforeUpload();
    await userEvent.upload(fileInput(), fileOf({ ...product, id: fileId ?? product.id, name: 'Alpha 2' }));
    await userEvent.click(await screen.findByRole('button', { name: /replace all data/i }));
    await waitFor(() => expect(screen.queryByRole('button', { name: /replace all data/i })).toBeNull());
    await settle();
  }

  it('after replacing an archived product, a line says it is archived', async () => {
    await replaceOpen({ 'p-A': { archived: true } });
    expect(screen.getByRole('status').textContent).toBe('“Alpha 2” is archived: Show archived on the Products page lists it.');
    expect(storedPrefs()).toEqual({ 'p-A': { archived: true } });
  });

  // PR #245 review -07: a live region inserted already holding its text may not be announced.
  it('the line\'s live region is on the page, empty, before its text arrives', async () => {
    let region: HTMLElement | null = null;
    await replaceOpen({ 'p-A': { archived: true } }, undefined, () => {
      region = screen.getByRole('status');
      expect(region.textContent).toBe('');
    });
    expect(screen.getByRole('status')).toBe(region);
    expect(req(region as HTMLElement | null, 'region').textContent).toBe('“Alpha 2” is archived: Show archived on the Products page lists it.');
  });

  it('control: not archived, no line', async () => {
    await replaceOpen({ 'p-A': { color: 'pink' } });
    expect(screen.queryByText(/is archived/)).toBeNull();
  });

  // PR #245 review -04 (KB50): the replace writes over the OPEN product, so its id decides, never
  // the file's.
  it('a file with another id: the open product\'s archive decides', async () => {
    await replaceOpen({ 'p-A': { archived: true } }, 'p-file');
    expect(screen.getByText('“Alpha 2” is archived: Show archived on the Products page lists it.')).toBeTruthy();
  });

  it('a file with another id that is archived: the open product is not, so no line', async () => {
    await replaceOpen({ 'p-file': { archived: true } }, 'p-file');
    expect(screen.queryByText(/is archived/)).toBeNull();
  });
});
