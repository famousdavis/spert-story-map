// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * What the Projects dashboard's actions do to the list (v0.55.0), through the real page on the real
 * local driver: Clone's names, place and feedback; the in-place refresh after every action; the
 * welcome panel; and a double-click on a tile, through to the real Structure page.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { createSampleProduct } from '../lib/sampleData';
import { importProductFromJSON } from '../lib/importExport';
import { resetLocalCaution } from '../lib/localCaution';
import { resetGestureGuard } from '../lib/gestureGuard';
import { req } from './testHelpers';
import { installPageEnv, makeProject, renderPage, seedLocal, stored, storedOrder, tileNames, tiles } from './fixtures/projectsPage';
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
  vi.restoreAllMocks();
  vi.useRealTimers();
});

const tileOf = (name: string) => req(tiles().find(t => t.querySelector('h3')?.textContent === name), `tile ${name}`);
const control = (name: string, label: string) => within(tileOf(name)).getByRole('button', { name: `${label} ${name}` });
const indexIds = () => (JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]') as { id: string; name: string }[]);

async function show(specs: Parameters<typeof makeProject>[0][]) {
  seedLocal(specs.map(makeProject));
  renderPage();
  await screen.findByRole('list', { name: 'Products' });
  await settle();
}

describe('Clone (R8, R15, R20)', () => {
  it('two clones in a row: X | X (Copy 2) | X (Copy), each right after its source, and saved', async () => {
    await show([{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }]);
    await userEvent.click(control('X', 'Clone'));
    await waitFor(() => expect(tileNames()).toEqual(['X', 'X (Copy)', 'Y']));
    await userEvent.click(control('X', 'Clone'));
    await waitFor(() => expect(tileNames()).toEqual(['X', 'X (Copy 2)', 'X (Copy)', 'Y']));
    const byName = new Map(indexIds().map(e => [e.name, e.id]));
    expect(storedOrder()).toEqual(['X', 'X (Copy 2)', 'X (Copy)', 'Y'].map(n => byName.get(n)));
  });

  it('two clicks before the first refresh: (Copy) and (Copy 2), both right after the source, the later first, both saved', async () => {
    await show([{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }]);
    // Hold every refresh until both clones are made, as a slow cloud round trip would.
    let release: () => void = () => {};
    const gate = new Promise<void>(r => { release = r; });
    const realIndex = driver.loadProductIndex.bind(driver);
    const slow: StorageDriver = { ...driver, loadProductIndex: () => gate.then(realIndex) };
    storage.value = { driver: slow, mode: 'local', storageReady: true };
    // The page keeps its first driver's list until this one loads; render afresh on the slow one.
    cleanup();
    release();
    renderPage();
    await screen.findByRole('list', { name: 'Products' });
    let hold: () => void = () => {};
    const held = new Promise<void>(r => { hold = r; });
    slow.loadProductIndex = () => held.then(realIndex);
    const clone = control('X', 'Clone');
    fireEvent.click(clone);
    fireEvent.click(clone);
    await settle();
    await settle();
    hold();
    await waitFor(() => expect(tileNames()).toEqual(['X', 'X (Copy 2)', 'X (Copy)', 'Y']));
    const byName = new Map(indexIds().map(e => [e.name, e.id]));
    expect(storedOrder()).toEqual(['X', 'X (Copy 2)', 'X (Copy)', 'Y'].map(n => byName.get(n)));
  });

  it('a clone whose create failed does not hold its name: the next clone is "(Copy)" again', async () => {
    const realCreate = driver.createProduct.bind(driver);
    let fail = true;
    // A cloud create that failed: handleWriteError swallows it, and nothing is stored.
    const flaky: StorageDriver = { ...driver, createProduct: (p, o) => (fail ? Promise.resolve() : realCreate(p, o)) };
    storage.value = { driver: flaky, mode: 'local', storageReady: true };
    await show([{ id: 'x', name: 'X' }]);
    await userEvent.click(control('X', 'Clone'));
    await settle();
    expect(tileNames()).toEqual(['X']);
    fail = false;
    await userEvent.click(control('X', 'Clone'));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    expect(tileNames()).toEqual(['X', 'X (Copy)']);
  });

  it('keeps the changelog to the one duplicate entry', async () => {
    await show([{ id: 'x', name: 'X' }]);
    await userEvent.click(control('X', 'Clone'));
    await waitFor(() => expect(tileNames()).toContain('X (Copy)'));
    const copy = req(indexIds().find(e => e.name === 'X (Copy)'), 'copy');
    expect(req(stored(copy.id), 'copy')._changeLog?.map(e => [e.op, e.source])).toEqual([['duplicate', 'x']]);
  });

  it('a 1000-character name clones to a name of at most 1000, and the clone imports', async () => {
    const long = 'L'.repeat(1000);
    await show([{ id: 'x', name: long }]);
    await userEvent.click(within(tiles()[0]!).getByRole('button', { name: `Clone ${long}` }));
    await waitFor(() => expect(tiles()).toHaveLength(2));
    const copy = req(indexIds().find(e => e.id !== 'x'), 'copy');
    const product = req(stored(copy.id), 'copy');
    expect(product.name).toBe(`${'L'.repeat(993)} (Copy)`);
    expect(() => importProductFromJSON(JSON.stringify(product))).not.toThrow();
  });

  it('says what it did in a polite live region, and leaves focus on Clone', async () => {
    await show([{ id: 'x', name: 'X' }, { id: 'y', name: 'Y' }]);
    const clone = control('X', 'Clone');
    await userEvent.click(clone);
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Cloned "X" as "X (Copy)".'));
    expect(document.activeElement).toBe(clone);
  });

  it('scrolls the new tile into view', async () => {
    const scrolled: Element[] = [];
    vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(function (this: Element) { scrolled.push(this); });
    await show([{ id: 'x', name: 'X' }]);
    await userEvent.click(control('X', 'Clone'));
    await waitFor(() => expect(scrolled).toContain(tileOf('X (Copy)')));
  });
});

describe('the list updates in place (O4)', () => {
  const watchLoading = () => {
    const seen = { loading: false };
    const observer = new MutationObserver(() => {
      if ((document.body.textContent ?? '').includes('Loading products...')) seen.loading = true;
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    return { seen, stop: () => observer.disconnect() };
  };

  it.each(['Load Sample', 'Clone', 'Edit', 'Delete', 'an import'])('after %s, an untouched tile is the same node, and "Loading projects..." never shows', async (action) => {
    // The list arrives a task later, as a cloud read does: a page that showed "Loading projects..."
    // for every refresh would render it in between. On a same-task read it would never paint.
    const realIndex = driver.loadProductIndex.bind(driver);
    const slow: StorageDriver = { ...driver, loadProductIndex: () => new Promise(r => setTimeout(r, 0)).then(realIndex) };
    storage.value = { driver: slow, mode: 'local', storageReady: true };
    await show([{ id: 'keep', name: 'Keep' }, { id: 'work', name: 'Work' }]);
    const keep = tileOf('Keep');
    const keepOpen = control('Keep', 'Open Structure for');
    const { seen, stop } = watchLoading();
    try {
      if (action === 'Load Sample') {
        await userEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
        await waitFor(() => expect(tiles()).toHaveLength(3));
      } else if (action === 'Clone') {
        await userEvent.click(control('Work', 'Clone'));
        await waitFor(() => expect(tiles()).toHaveLength(3));
      } else if (action === 'Edit') {
        await userEvent.click(control('Work', 'Edit'));
        await userEvent.type(screen.getByLabelText('Product Name'), '!');
        await userEvent.click(screen.getByRole('button', { name: 'Update' }));
        await waitFor(() => expect(tileNames()).toContain('Work!'));
      } else if (action === 'Delete') {
        await userEvent.click(control('Work', 'Delete'));
        await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
        await waitFor(() => expect(tiles()).toHaveLength(1));
      } else {
        const file = new File([JSON.stringify(createSampleProduct())], 'p.json', { type: 'application/json' });
        await userEvent.upload(req(document.querySelector<HTMLInputElement>('input[type="file"]'), 'file input'), file);
        await userEvent.click(await screen.findByRole('button', { name: 'Confirm Import' }));
        await waitFor(() => expect(tiles()).toHaveLength(3));
      }
      await settle();
    } finally {
      stop();
    }
    expect(seen.loading).toBe(false);
    expect(keep.isConnected).toBe(true);
    expect(tileOf('Keep')).toBe(keep);
    expect(control('Keep', 'Open Structure for')).toBe(keepOpen);
  });

  it('"Loading projects..." still shows for the first load on a driver (unchanged)', async () => {
    const pending: StorageDriver = { ...driver, loadProductIndex: () => new Promise<never>(() => {}) };
    storage.value = { driver: pending, mode: 'local', storageReady: true };
    renderPage();
    expect(await screen.findByText('Loading products...')).toBeTruthy();
  });
});

describe('Load Sample', () => {
  it('from the toolbar: says so, adds the sample at the end, focus stays on Load Sample', async () => {
    await show([{ id: 'x', name: 'X' }]);
    const button = screen.getByRole('button', { name: 'Load Sample' });
    await userEvent.click(button);
    await waitFor(() => expect(tiles()).toHaveLength(2));
    expect(tileNames()[1]).toBe(createSampleProduct().name);
    expect(screen.getByRole('status').textContent).toBe('Loaded the sample product.');
    expect(document.activeElement).toBe(button);
  });

  it('says so again the second time: the region is emptied, then set, so the same words are heard twice', async () => {
    await show([{ id: 'x', name: 'X' }]);
    const region = screen.getByRole('status');
    let heard = 0;
    const observer = new MutationObserver(() => { if (region.textContent === 'Loaded the sample product.') heard += 1; });
    observer.observe(region, { childList: true, subtree: true, characterData: true });
    try {
      await userEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
      await waitFor(() => expect(heard).toBe(1));
      await userEvent.click(screen.getByRole('button', { name: 'Load Sample' }));
      await waitFor(() => expect(tiles()).toHaveLength(3));
      await waitFor(() => expect(heard).toBe(2));
    } finally {
      observer.disconnect();
    }
  });

  it('from the welcome panel, which goes: focus to the sample tile\'s open button', async () => {
    seedLocal([]);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Load Sample Product' }));
    await waitFor(() => expect(tiles()).toHaveLength(1));
    await settle();
    expect(document.activeElement).toBe(within(tiles()[0]!).getByRole('button', { name: /^Open Structure for / }));
  });
});

describe('the welcome panel (R22)', () => {
  it('reads the mock-up\'s words, and its counts are the sample\'s', async () => {
    seedLocal([]);
    renderPage();
    const panel = req((await screen.findByRole('heading', { name: 'Welcome to SPERT® Story Map' })).parentElement, 'panel');
    expect(panel.getAttribute('role')).toBe('region');
    const texts = [...panel.querySelectorAll('p')].map(p => (p.textContent ?? '').replace(/\s+/g, ' ').trim());
    expect(texts).toEqual([
      'Plan releases on a story map: themes, backbones and rib items, sized in story points, allocated to releases and tracked sprint by sprint.',
      'A product can be an application, a service, an internal capability or any other initiative.',
      'The sample product is a working example with four releases and four sprints of progress. You can explore it, edit it, or delete it at any time.',
    ]);
    const sample = createSampleProduct();
    const words = ['zero', 'one', 'two', 'three', 'four', 'five', 'six'];
    const withProgress = sample.sprints.filter(s =>
      sample.themes.some(t => t.backboneItems.some(b => b.ribItems.some(r => r.progressHistory.some(e => e.sprintId === s.id))))).length;
    expect(texts[2]).toContain(`with ${words[sample.releases.length]} releases and ${words[withProgress]} sprints of progress`);
    expect(sample.sprints).toHaveLength(withProgress);
  });

  it('Create New Project opens the New Project dialog', async () => {
    seedLocal([]);
    renderPage();
    await userEvent.click(await screen.findByRole('button', { name: 'Create New Product' }));
    expect(screen.getByRole('dialog', { name: 'New Product' })).toBeTruthy();
  });
});

describe('a double-click on a tile opens the project once (O16)', () => {
  // ⚠️ The guard's clock is the test's. It lives GESTURE_MS from the first click, so a test that
  // waited in real time, from after the real Structure page had rendered, failed whenever that
  // render was slow (CI's shipgate on 9db0668; 6 of 6 runs under CPU load). Only setTimeout and
  // clearTimeout are faked, from just before the first click: the local driver's reads are
  // promises, and React schedules its renders without either.
  const fakeGestureClock = () => vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });

  /** Flush promises and renders, with the clock stopped, until Structure's names are on the page. */
  async function structureNames() {
    for (let i = 0; i < 50; i++) {
      const names = screen.queryAllByRole('button', { name: /^Edit / });
      if (names.length > 0) return names;
      await act(async () => { await Promise.resolve(); });
    }
    throw new Error('Structure never rendered');
  }

  it('Structure renders, no text field opens, and typing then Enter changes nothing stored', async () => {
    const sample = createSampleProduct();
    seedLocal([sample]);
    renderPage('real');
    await screen.findByRole('list', { name: 'Products' });
    const before = localStorage.getItem(`rp:local:product_${sample.id}`);
    fakeGestureClock();
    // The first click opens the project at once.
    fireEvent.click(screen.getByRole('button', { name: `Open Structure for ${sample.name}` }), { detail: 1 });
    // The second click of the gesture, 120 ms on, lands on the first theme's name on Structure.
    const themeName = (await structureNames())[0]!;
    act(() => { vi.advanceTimersByTime(120); });
    fireEvent.mouseDown(themeName, { detail: 2 });
    fireEvent.mouseUp(themeName, { detail: 2 });
    fireEvent.click(themeName, { detail: 2 });
    fireEvent.dblClick(themeName, { detail: 2 });
    expect(document.querySelectorAll('input[name="inlineEdit"]')).toHaveLength(0);
    vi.useRealTimers();
    // Someone renaming the project as they used to types the new name and presses Enter.
    await userEvent.keyboard('Renamed{Enter}');
    flushPendingSaves();
    expect(localStorage.getItem(`rp:local:product_${sample.id}`)).toBe(before);
    expect(screen.getAllByRole('button', { name: /^Edit / }).length).toBeGreaterThan(0);
  });

  it('a click after the gesture is over is not swallowed', async () => {
    const sample = createSampleProduct();
    seedLocal([sample]);
    renderPage('real');
    await screen.findByRole('list', { name: 'Products' });
    fakeGestureClock();
    fireEvent.click(screen.getByRole('button', { name: `Open Structure for ${sample.name}` }), { detail: 1 });
    const themeName = (await structureNames())[0]!;
    act(() => { vi.advanceTimersByTime(550); });
    fireEvent.click(themeName, { detail: 1 });
    expect(document.querySelectorAll('input[name="inlineEdit"]')).toHaveLength(1);
  });

  it('the guard ends at its dblclick: a click right after a double-click is not swallowed', async () => {
    const { swallowRestOfGesture } = await import('../lib/gestureGuard');
    fakeGestureClock(); // so only the dblclick, never the timeout, can end it
    const seen: string[] = [];
    const button = document.createElement('button');
    document.body.appendChild(button);
    button.addEventListener('click', () => seen.push('click'));
    try {
      swallowRestOfGesture();
      fireEvent.mouseDown(button, { detail: 2 });
      fireEvent.click(button, { detail: 2 });
      fireEvent.dblClick(button, { detail: 2 });
      expect(seen).toEqual([]);
      fireEvent.click(button, { detail: 1 });
      expect(seen).toEqual(['click']);
    } finally {
      button.remove();
    }
  });

  it('a keyboard open (detail 0) swallows nothing', async () => {
    const sample = createSampleProduct();
    seedLocal([sample]);
    renderPage('real');
    await screen.findByRole('list', { name: 'Products' });
    fireEvent.click(screen.getByRole('button', { name: `Open Structure for ${sample.name}` }), { detail: 0 });
    const themeName = (await screen.findAllByRole('button', { name: /^Edit / }))[0]!;
    fireEvent.click(themeName, { detail: 1 });
    expect(document.querySelectorAll('input[name="inlineEdit"]')).toHaveLength(1);
  });
});
