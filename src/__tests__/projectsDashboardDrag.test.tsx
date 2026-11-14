// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * Reordering the Projects dashboard (v0.55.0, O15): a project dropped on a tile takes that tile's
 * place, in both directions, and the order is saved (since v0.55.14 as the one field
 * `projectOrder`, `writePreferences`). Through the real page on the real local driver.
 *
 * Until v0.55.0 a drop inserted BEFORE the hovered card: with a box drawn round a whole tile that
 * broke every downward drag by one place, a drop on the next tile did nothing, nothing could reach
 * the last place, and a drop on one's own tile sent the project to the end.
 *
 * jsdom implements no DragEvent, so testing-library falls back to a plain Event with
 * `dataTransfer` attached; the page touches four of its members on dragstart.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, createEvent, act } from '@testing-library/react';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { resetLocalCaution } from '../lib/localCaution';
import { req } from './testHelpers';
import { installPageEnv, makeProject, renderPage, seedLocal, storedOrder, tileNames, tiles } from './fixtures/projectsPage';

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
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
});

const NAMES = ['A', 'B', 'C', 'D'];

async function showFour(order?: string[]) {
  seedLocal(NAMES.map(n => makeProject({ id: `p-${n}`, name: n })), order);
  renderPage();
  await screen.findByRole('list', { name: 'Products' });
  await settle(); // the saved order arrives from the preferences
}

function dataTransfer() {
  return { setData: vi.fn(), setDragImage: vi.fn(), dropEffect: '', effectAllowed: '' };
}

function fire(type: 'dragStart' | 'dragOver' | 'drop' | 'dragEnd', el: Element, dt = dataTransfer()) {
  fireEvent(el, createEvent[type](el, { dataTransfer: dt }));
  return dt;
}

/** Drag the tile named `from` by its grip onto the tile named `onto`. */
async function dragOnto(from: string, onto: string) {
  const byName = (n: string) => req(tiles().find(t => t.querySelector('h3')?.textContent === n), `tile ${n}`);
  fire('dragStart', req(byName(from).querySelector('[draggable="true"]'), 'grip'));
  fire('dragOver', byName(onto));
  fire('drop', byName(onto));
  await settle();
}

describe('a dropped project takes the boxed tile\'s place, and the order is saved', () => {
  it.each([
    ['A', 'C', ['B', 'C', 'A', 'D']],
    ['D', 'B', ['A', 'D', 'B', 'C']],
    ['A', 'D', ['B', 'C', 'D', 'A']],
  ])('%s dropped on %s gives %j', async (from, onto, want) => {
    await showFour();
    await dragOnto(from, onto);
    expect(tileNames()).toEqual(want);
    expect(storedOrder()).toEqual(want.map(n => `p-${n}`));
  });

  it('A dropped on A changes nothing, and saves nothing', async () => {
    await showFour();
    await dragOnto('A', 'A');
    expect(tileNames()).toEqual(NAMES);
    expect(storedOrder()).toBeUndefined();
  });

  // Forecaster's two direction tests and their invariant
  // (src/features/projects/components/ProjectList.test.tsx:89-130 at 38f1a63).
  it('dragging DOWN puts the project in the boxed slot, not one past it', async () => {
    await showFour();
    await dragOnto('A', 'C');
    expect(tileNames().indexOf('A')).toBe(2);
  });

  it('dragging UP puts the project in the boxed slot', async () => {
    await showFour();
    await dragOnto('D', 'B');
    expect(tileNames().indexOf('D')).toBe(1);
  });

  it('lands in the boxed slot from every start position, in both directions', async () => {
    for (let from = 0; from < 4; from += 1) {
      for (let onto = 0; onto < 4; onto += 1) {
        if (from === onto) continue;
        cleanup();
        // A page load starts with nothing pending; since v0.55.14 a read applies this tab's
        // pending settings (R-4), so the previous round's order must land before the clear.
        flushPendingSaves();
        localStorage.clear();
        await showFour();
        await dragOnto(NAMES[from]!, NAMES[onto]!);
        expect(tileNames().indexOf(NAMES[from]!), `dragging slot ${from} onto slot ${onto}`).toBe(onto);
      }
    }
  });
});

describe('the drag itself', () => {
  it('starts from the grip with data and the whole tile as its image', async () => {
    await showFour();
    const tile = req(tiles()[1], 'tile B');
    const dt = fire('dragStart', req(tile.querySelector('[draggable="true"]'), 'grip'));
    expect(dt.setData).toHaveBeenCalledWith('text/plain', '1');
    expect(dt.setDragImage.mock.calls[0]?.[0]).toBe(tile);
    expect(dt.effectAllowed).toBe('move');
  });

  it('the drop target shows the box in place of its border; the dragged tile is half opaque', async () => {
    await showFour();
    fire('dragStart', req(tiles()[0]?.querySelector('[draggable="true"]'), 'grip'));
    fire('dragOver', req(tiles()[2], 'tile C'));
    await settle();
    const cls = (el: Element | undefined) => (el?.getAttribute('class') ?? '').split(/\s+/);
    expect(cls(tiles()[2])).toContain('border-[#0070f3]');
    expect(tiles().filter(t => cls(t).includes('border-[#0070f3]'))).toHaveLength(1);
    // The box REPLACES the border colour and its hover, in both themes.
    expect(cls(tiles()[2]).filter(c => /^(dark:)?(hover:)?border-\[#(eee|2d3748|93c5fd|3b82f6)\]$/.test(c))).toEqual([]);
    expect(cls(tiles()[0])).toContain('opacity-50');
  });

  it('a drop with nothing dragged (a file from the desktop) moves nothing', async () => {
    await showFour();
    fire('dragOver', req(tiles()[2], 'tile C'));
    fire('drop', req(tiles()[2], 'tile C'));
    await settle();
    expect(tileNames()).toEqual(NAMES);
    expect(storedOrder()).toBeUndefined();
  });
});

describe('the saved order (unchanged)', () => {
  // Read by heading, as both versions of the page render a project's name.
  const headings = () => [...document.querySelectorAll('h3')].map(h => h.textContent);
  const shown = async (order: string[]) => {
    seedLocal(NAMES.map(n => makeProject({ id: `p-${n}`, name: n })), order);
    renderPage();
    await screen.findByText('A');
    await settle();
  };

  it('a saved order is what the page shows, on load', async () => {
    await shown(['p-C', 'p-A', 'p-D', 'p-B']);
    expect(headings()).toEqual(['C', 'A', 'D', 'B']);
  });

  it('a project the saved order does not hold shows after those it does', async () => {
    await shown(['p-D', 'p-B']);
    expect(headings()).toEqual(['D', 'B', 'A', 'C']);
  });
});
