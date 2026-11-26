// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * N8 (FRAME26, v0.57.0): the Products page inside the frame (contract §3, §7; D12, CFD's order):
 * heading row → filter row → the page's own notices → the grid or the empty panel.
 * - The heading row is the page's `h1` "Products" and the frame's toolbar of four `.sf-btn` buttons.
 * - The filter row is ONE row hooked `data-sf="filters"`, 16 px under the heading row, shown while a listed product is
 *   archived or while a status line about the tiles' own controls shows (R88's failed read, or the cap's line); it
 *   holds "Show archived (N)" and that one line. frame-check measures the grid from it.
 * - The page's own notices come after it, so the filter row stays where §3 puts it whenever one shows.
 * - The grid is `.sf-tiles`; the welcome panel and the all-archived line stand in for it, hooked `data-sf="empty"`,
 *   and never beside it.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { resetLocalCaution } from '../lib/localCaution';
import { resetGestureGuard } from '../lib/gestureGuard';
import { SETTINGS_UNREAD_NOTICE } from '../components/product/archive-text';
import { installPageEnv, makeProject, renderPage, seedLocal } from './fixtures/projectsPage';
import { req } from './testHelpers';
import type { StorageDriver } from '../types';

const driver = createLocalStorageDriver();
const settle = () => act(async () => { await new Promise(r => setTimeout(r, 0)); });
const follows = (a: Node, b: Node) => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;

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

async function show(names: string[], projectPrefs: Record<string, { archived?: boolean }> = {}) {
  seedLocal(names.map(n => makeProject({ id: `p-${n}`, name: n })));
  localStorage.setItem('rp:local:preferences', JSON.stringify({ projectPrefs }));
  renderPage();
  await screen.findByRole('heading', { level: 1, name: 'Products' });
  await settle();
  const main = req(document.querySelector<HTMLElement>('main'), 'main');
  return {
    main,
    row: req(main.querySelector<HTMLElement>('[data-sf="headrow"]'), 'heading row'),
    filters: () => main.querySelectorAll<HTMLElement>('[data-sf="filters"]'),
    tiles: () => main.querySelector<HTMLElement>('[data-sf="tiles"]'),
    empty: () => main.querySelectorAll<HTMLElement>('[data-sf="empty"]'),
  };
}

describe('the Products page in the frame', () => {
  it('the heading row: the h1 "Products" and four `.sf-btn` buttons in the toolbar, in the suite\'s order', async () => {
    const { row } = await show(['A']);
    expect(req(row.querySelector('h1'), 'h1').textContent).toBe('Products');
    const toolbar = req(row.querySelector<HTMLElement>('[data-sf="toolbar"]'), 'toolbar');
    const buttons = Array.from(toolbar.children);
    expect(buttons.map(b => b.textContent)).toEqual(['Export All', 'Import', 'Load Sample', 'New Product']);
    for (const b of buttons) expect(b.className.split(/\s+/), b.textContent ?? '').toContain('sf-btn');
  });

  it('no filter row while nothing is archived and nothing is wrong; the grid follows the heading row', async () => {
    const { row, filters, tiles, empty } = await show(['A', 'B']);
    expect(filters()).toHaveLength(0);
    const grid = req(tiles(), 'grid');
    expect(grid.className).toBe('sf-tiles');
    expect(follows(row, grid)).toBe(true);
    expect(empty()).toHaveLength(0);
  });

  it('with a product archived: one filter row with "Show archived (1)", directly after the heading row, then the grid', async () => {
    const { row, filters, tiles } = await show(['A', 'B'], { 'p-A': { archived: true } });
    expect(filters()).toHaveLength(1);
    const f = req(filters()[0], 'filters');
    expect(f.classList.contains('sf-below')).toBe(true);
    expect(row.nextElementSibling).toBe(f);
    expect(within(f).getByRole('checkbox', { name: 'Show archived (1)' })).toBeTruthy();
    expect(follows(f, req(tiles(), 'grid'))).toBe(true);
  });

  it('when the settings read fails (R88): the status line is the filter row\'s, not a note above the grid', async () => {
    storage.value = {
      driver: { ...driver, loadPreferences: (o?: { throwOnError?: boolean }) => (o?.throwOnError ? Promise.reject(new Error('offline')) : driver.loadPreferences()) } as StorageDriver,
      mode: 'local', storageReady: true,
    };
    const { filters, tiles } = await show(['A']);
    expect(filters()).toHaveLength(1);
    const line = screen.getByText(SETTINGS_UNREAD_NOTICE);
    expect(req(filters()[0], 'filters').contains(line)).toBe(true);
    expect(follows(line, req(tiles(), 'grid'))).toBe(true);
  });

  it('every product archived, box off: the all-archived line is the empty panel, under the filter row, with no grid', async () => {
    const { filters, tiles, empty } = await show(['A'], { 'p-A': { archived: true } });
    expect(tiles()).toBeNull();
    expect(empty()).toHaveLength(1);
    const panel = req(empty()[0], 'empty');
    expect(panel.textContent).toMatch(/^All products are archived/);
    expect(follows(req(filters()[0], 'filters'), panel)).toBe(true);
  });

  it('a first visit: the welcome panel is the empty panel, with no grid and no filter row', async () => {
    const { filters, tiles, empty } = await show([]);
    await screen.findByRole('heading', { name: 'Welcome to SPERT® Story Map' });
    expect(tiles()).toBeNull();
    expect(filters()).toHaveLength(0);
    expect(empty()).toHaveLength(1);
    expect(req(empty()[0], 'empty').getAttribute('role')).toBe('region');
  });

  it('the page\'s own notices come after the filter row (CFD\'s order), before the grid', async () => {
    const { filters, tiles } = await show(['A', 'B'], { 'p-A': { archived: true } });
    const input = req(document.querySelector<HTMLInputElement>('input[type="file"]'), 'file input');
    await userEvent.upload(input, new File(['not json'], 'bad.json', { type: 'application/json' }));
    const alert = await screen.findByRole('alert');
    expect(follows(req(filters()[0], 'filters'), alert)).toBe(true);
    expect(follows(alert, req(tiles(), 'grid'))).toBe(true);
  });
});
