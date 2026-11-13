// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * The Projects dashboard (v0.55.0) through the real page on the real local driver, or, where an
 * item needs roles, the driver's cloud shape: the header, the grid's class pairs, each tile line
 * and its branches, the open, the names, and who may Edit, Delete and Share.
 *
 * ⚠️ jsdom applies no CSS. These tests pin the CLASS PAIRS a look depends on (a group and the
 * classes that read it, a container and the queries that need it); whether they render is the
 * release's browser check.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
const auth = vi.hoisted(() => ({ value: { user: null } as { user: { uid: string } | null } }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => auth.value }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { resetLocalCaution } from '../lib/localCaution';
import { resetGestureGuard } from '../lib/gestureGuard';
import { req } from './testHelpers';
import {
  describedText, installPageEnv, makeProject, renderPage, seedLocal, tileLines, tiles,
} from './fixtures/projectsPage';
import type { Product, StorageDriver } from '../types';

const driver = createLocalStorageDriver();

const OWNER_ONLY = "Only the project's owner can delete it. To remove it from your list, ask the owner to stop sharing it with you.";
const VIEW_ONLY = 'View only — this project is shared with you as a viewer.';

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  auth.value = { user: null };
  storage.value = { driver, mode: 'local', storageReady: true };
  installPageEnv(vi);
});

afterEach(() => {
  cleanup();
  resetGestureGuard();
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const classes = (el: Element | null) => (el?.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

async function showProjects(products: Product[]) {
  seedLocal(products);
  renderPage();
  await screen.findByRole('list', { name: 'Projects' });
  return tiles();
}

/** The cloud shape: the local driver's reads, as a signed-in member sees them. */
function cloudAs(uid: string, products: Product[]) {
  const cloud: StorageDriver = { ...driver, loadProductIndex: () => Promise.resolve(products) };
  storage.value = { driver: cloud, mode: 'cloud', storageReady: true };
  auth.value = { user: { uid } };
}

describe('the header and the page', () => {
  it('is a header over a main: the title in three runs, the tagline without the storage sentence', async () => {
    await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    const header = req(document.querySelector('header'), 'header');
    const h1 = within(header).getByRole('heading', { level: 1 });
    expect([...h1.querySelectorAll('span')].map(s => s.textContent)).toEqual(['SPERT', '®', ' Story Map']);
    expect(req(header.querySelector('p'), 'tagline').textContent).toBe('Plan and track agile project releases');
    expect(document.body.textContent).not.toMatch(/Data is stored (locally|in your cloud)/);
    const main = req(document.querySelector('main'), 'main');
    expect(within(main).getByRole('heading', { level: 2, name: 'Projects' })).toBeTruthy();
    expect(within(main).getByRole('list', { name: 'Projects' })).toBeTruthy();
  });

  it('keeps the logo\'s link home, the gear, About and the theme toggle', async () => {
    seedLocal([]);
    renderPage();
    await screen.findByText('Welcome to SPERT® Story Map');
    const header = req(document.querySelector('header'), 'header');
    expect(within(header).getByRole('link', { name: 'Go to projects home' }).getAttribute('href')).toBe('/');
    expect(within(header).getByTitle('App Settings')).toBeTruthy();
    expect(within(header).getByRole('link', { name: 'About' })).toBeTruthy();
  });
});

describe('the grid: the class pairs a look depends on', () => {
  it('the grid\'s column queries are answered by an ANCESTOR carrying @container, never by the grid itself', async () => {
    await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    const grid = screen.getByRole('list', { name: 'Projects' });
    expect(classes(grid)).toEqual(expect.arrayContaining(['grid', 'grid-cols-1', '@min-[560px]:grid-cols-2', '@min-[860px]:grid-cols-3', 'gap-4']));
    expect(classes(grid)).not.toContain('@container');
    expect(classes(grid.parentElement)).toContain('@container');
  });

  it('the revealed row shows on tile hover, on focus inside the tile, and always without hover, and the tile root is the group it reads', async () => {
    const [tile] = await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    const t = req(tile, 'tile');
    expect(classes(t)).toContain('group/tile');
    const row = req(within(t).getByRole('button', { name: 'Export Alpha' }).parentElement, 'revealed row');
    expect(classes(row)).toEqual(expect.arrayContaining([
      'opacity-0', 'group-hover/tile:opacity-100', 'group-focus-within/tile:opacity-100', '[@media(hover:none)]:opacity-100',
    ]));
  });

  it('the open button\'s ::after covers the tile (the root is relative), and the grip, Delete and the revealed row sit above it', async () => {
    const [tile] = await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    const t = req(tile, 'tile');
    expect(classes(t)).toContain('relative');
    const open = within(t).getByRole('button', { name: 'Open Structure for Alpha' });
    expect(classes(open)).toEqual(expect.arrayContaining(['after:absolute', 'after:inset-0', "after:content-['']", 'focus-visible:outline-hidden']));
    expect(classes(open)).not.toContain('focus-visible:outline-none');
    const grip = req(t.querySelector('[draggable="true"]'), 'grip');
    const del = req(within(t).getByRole('button', { name: 'Delete Alpha' }).parentElement, 'delete holder');
    const row = req(within(t).getByRole('button', { name: 'Export Alpha' }).parentElement, 'revealed row');
    for (const el of [grip, del, row]) expect(classes(el)).toEqual(expect.arrayContaining(['relative', 'z-[1]']));
  });

  it('no copied class names a colour Story Map\'s theme lacks', async () => {
    await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    const all = [...document.querySelectorAll('[class]')].flatMap(el => classes(el));
    expect(all.filter(c => /(^|:)(bg|border|text|from|to|accent)-(spert-|card$|border$)/.test(c))).toEqual([]);
  });

  it('only the grip is draggable: the tile root carries no drag and no click handler of its own', async () => {
    const [tile] = await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    const t = req(tile, 'tile');
    expect([...t.querySelectorAll('[draggable="true"]')]).toHaveLength(1);
    expect(t.getAttribute('draggable')).toBeNull();
    expect(req(t.querySelector('[draggable="true"]'), 'grip').getAttribute('title')).toBe('Drag to reorder');
  });
});

describe('a tile\'s lines', () => {
  const linesOf = async (spec: Parameters<typeof makeProject>[0]) => {
    const [tile] = await showProjects([makeProject(spec)]);
    return tileLines(req(tile, 'tile'));
  };

  it('no items, no releases, no sprints', async () => {
    expect(await linesOf({ id: 'p', name: 'Empty' })).toEqual(['No items yet', 'No releases or sprints yet']);
  });

  it('one item: singular, its points, a whole percent; one release, no sprints', async () => {
    expect(await linesOf({ id: 'p', name: 'One', items: 1 })).toEqual(['1 item · 20 pts · 0% complete', '1 release · no sprints yet']);
  });

  it('several items; several releases and sprints', async () => {
    expect(await linesOf({ id: 'p', name: 'Many', items: 3, releases: 2, sprints: 3 }))
      .toEqual(['3 items · 60 pts · 0% complete', '2 releases · 3 sprints']);
  });

  it('no releases, one sprint', async () => {
    expect(await linesOf({ id: 'p', name: 'S', sprints: 1 })).toEqual(['No items yet', 'No releases yet · 1 sprint']);
  });

  it('the percent is a whole number', async () => {
    const p = makeProject({ id: 'p', name: 'Pct', items: 3, sprints: 1 });
    const rib0 = req(p.themes[0]?.backboneItems[0]?.ribItems[0], 'rib');
    rib0.progressHistory = [{ sprintId: 'p-S1', releaseId: 'p-R1', percentComplete: 50 }];
    const [tile] = await showProjects([p]);
    // 20 of 60 points at 50% = 10 of 60 = 16.67%.
    expect(tileLines(req(tile, 'tile'))[0]).toBe('3 items · 60 pts · 17% complete');
  });

  it('a warning line only when something needs attention: unsized, singular', async () => {
    expect(await linesOf({ id: 'p', name: 'U', items: 2, unsizedItems: 1 }))
      .toEqual(['2 items · 20 pts · 0% complete', '1 release · no sprints yet', '⚠ 1 item unsized']);
  });

  it('unsized, plural', async () => {
    expect((await linesOf({ id: 'p', name: 'U', items: 3, unsizedItems: 2 }))[2]).toBe('⚠ 2 items unsized');
  });

  it('progress not counting, alone, with Insights\' words and count', async () => {
    expect((await linesOf({ id: 'p', name: 'X', stranded: 2 }))).toEqual([
      '2 items · 40 pts · 0% complete', '2 releases · 1 sprint', '⚠ Progress not counting: 2',
    ]);
  });

  it('both, joined by a middle dot; the ⚠ hidden from assistive tech', async () => {
    const [tile] = await showProjects([makeProject({ id: 'p', name: 'B', items: 4, unsizedItems: 4, stranded: 2 })]);
    const t = req(tile, 'tile');
    expect(tileLines(t)[2]).toBe('⚠ 4 items unsized · Progress not counting: 2');
    const warn = [...t.querySelectorAll('p')][2]!;
    expect(warn.querySelector('[aria-hidden="true"]')?.textContent).toBe('⚠ ');
    expect(classes(warn)).toEqual(expect.arrayContaining(['text-[#b45309]', 'dark:text-[#fbbf24]']));
    expect(classes(warn)).not.toContain('text-[#666]');
  });

  it('no updated date, in any form', async () => {
    const lines = await linesOf({ id: 'p', name: 'D', items: 1 });
    expect(lines.join(' ')).not.toMatch(/Updated|\d{1,2}\/\d{1,2}\/\d{4}/);
  });

  it('the open button is described by the lines, through ids that hold no project id', async () => {
    const [tile] = await showProjects([makeProject({ id: 'id with "quote"', name: 'Q', items: 2, unsizedItems: 1 })]);
    const open = within(req(tile, 'tile')).getByRole('button', { name: 'Open Structure for Q' });
    expect(describedText(open)).toBe('2 items · 20 pts · 0% complete | 1 release · no sprints yet | ⚠ 1 item unsized');
    expect(open.getAttribute('aria-describedby')).not.toMatch(/quote/);
  });
});

describe('the open', () => {
  it('a click on the open button renders Structure with no timer advanced', async () => {
    await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Open Structure for Alpha' }), { detail: 1 });
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByText('Structure page')).not.toBeNull();
  });

  it('neither the tile nor its name has a double-click handler: a dblclick alone opens nothing', async () => {
    const [tile] = await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    const t = req(tile, 'tile');
    fireEvent.dblClick(within(t).getByRole('button', { name: 'Open Structure for Alpha' }));
    fireEvent.dblClick(t);
    await act(async () => { await Promise.resolve(); });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.querySelector('input')).toBe(document.querySelector('input[type="file"]'));
    expect(screen.queryByText('Structure page')).toBeNull();
  });

  it.each(['Delete', 'Export', 'Edit', 'Clone'])('a click on %s does not open the project (no click handler on the tile root)', async (label) => {
    vi.spyOn(driver, 'loadProduct').mockResolvedValue(null);
    const [tile] = await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    const list = screen.getByRole('list', { name: 'Projects' });
    fireEvent.click(within(req(tile, 'tile')).getByRole('button', { name: `${label} Alpha` }), { detail: 1 });
    await act(async () => { await Promise.resolve(); });
    // The same list, never unmounted: with the project stubbed out, a navigation would come
    // straight back home (local mode does), so "the list is there" alone cannot tell.
    expect(list.isConnected).toBe(true);
    expect(screen.queryByText('Structure page')).toBeNull();
  });

  it('a double-click on the name opens no text field on the list', async () => {
    await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    await userEvent.dblClick(screen.getByRole('button', { name: 'Open Structure for Alpha' }));
    expect(document.querySelector('input[name="projectName"]')).toBeNull();
  });
});

describe('names and titles (O14)', () => {
  it('each control names its project, except Share; each title names the action', async () => {
    cloudAs('me', [makeProject({ id: 'p1', name: 'Alpha', owner: 'me', members: { me: 'owner' } })]);
    renderPage();
    const tile = req((await screen.findAllByRole('listitem'))[0], 'tile');
    const named = [...tile.querySelectorAll('button')].map(b => [b.getAttribute('aria-label'), b.getAttribute('title')]);
    expect(named).toEqual([
      ['Open Structure for Alpha', 'Open Structure'],
      ['Delete Alpha', 'Delete project'],
      ['Share project', 'Share project'],
      ['Export Alpha', 'Export project'],
      ['Edit Alpha', 'Edit project'],
      ['Clone Alpha', 'Clone project'],
    ]);
  });

  it('a shared project\'s open button says so, and shows the badge', async () => {
    cloudAs('me', [makeProject({ id: 'p1', name: 'Alpha', owner: 'them', members: { them: 'owner', me: 'editor' } })]);
    renderPage();
    const tile = req((await screen.findAllByRole('listitem'))[0], 'tile');
    expect(within(tile).getByRole('button', { name: 'Open Structure for Alpha (Shared)' })).toBeTruthy();
    expect(within(tile).getByText('Shared')).toBeTruthy();
  });
});

describe('who may Edit, Delete and Share (R6, R13, R21, O17)', () => {
  const controls = async (role: 'owner' | 'editor' | 'viewer' | 'none') => {
    const members: Record<string, 'owner' | 'editor' | 'viewer'> = { boss: 'owner' };
    if (role !== 'none') members.me = role;
    cloudAs('me', [makeProject({ id: 'p1', name: 'Alpha', owner: role === 'owner' ? 'me' : 'boss', members })]);
    renderPage();
    const tile = req((await screen.findAllByRole('listitem'))[0], 'tile');
    const del = within(tile).getByRole('button', { name: 'Delete Alpha' }) as HTMLButtonElement;
    const edit = within(tile).getByRole('button', { name: 'Edit Alpha' }) as HTMLButtonElement;
    const share = within(tile).queryByRole('button', { name: 'Share project' });
    return { del, edit, share };
  };

  it('owner: Delete, Edit and Share', async () => {
    const { del, edit, share } = await controls('owner');
    expect([del.disabled, edit.disabled, share !== null]).toEqual([false, false, true]);
    expect(del.getAttribute('aria-describedby')).toBeNull();
  });

  it('editor: Delete disabled with its reason; Edit offered; no Share', async () => {
    const { del, edit, share } = await controls('editor');
    expect([del.disabled, edit.disabled, share]).toEqual([true, false, null]);
    expect(del.getAttribute('title')).toBe(OWNER_ONLY);
    expect(describedText(del)).toBe(OWNER_ONLY);
  });

  it('viewer: Delete and Edit disabled, each with its reason; no Share', async () => {
    const { del, edit, share } = await controls('viewer');
    expect([del.disabled, edit.disabled, share]).toEqual([true, true, null]);
    expect(describedText(del)).toBe(OWNER_ONLY);
    expect(edit.getAttribute('title')).toBe(VIEW_ONLY);
    expect(describedText(edit)).toBe(VIEW_ONLY);
  });

  it('the role is the members map\'s, not the owner field\'s: no owner field, a viewer entry, a viewer\'s tile', async () => {
    const p = makeProject({ id: 'p1', name: 'Alpha', members: { me: 'viewer' } });
    p._owner = null;
    cloudAs('me', [p]);
    renderPage();
    const tile = req((await screen.findAllByRole('listitem'))[0], 'tile');
    expect((within(tile).getByRole('button', { name: 'Delete Alpha' }) as HTMLButtonElement).disabled).toBe(true);
    expect((within(tile).getByRole('button', { name: 'Edit Alpha' }) as HTMLButtonElement).disabled).toBe(true);
    expect(within(tile).queryByRole('button', { name: 'Share project' })).toBeNull();
  });

  it('a role the members map does not give: fails closed, as a viewer', async () => {
    const { del, edit, share } = await controls('none');
    expect([del.disabled, edit.disabled, share]).toEqual([true, true, null]);
  });

  it('local mode: the owner of every project, and no Share', async () => {
    const [tile] = await showProjects([makeProject({ id: 'p1', name: 'Alpha' })]);
    const t = req(tile, 'tile');
    expect((within(t).getByRole('button', { name: 'Delete Alpha' }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(t).getByRole('button', { name: 'Edit Alpha' }) as HTMLButtonElement).disabled).toBe(false);
    expect(within(t).queryByRole('button', { name: 'Share project' })).toBeNull();
  });

  it('Export and Clone stay offered to a viewer', async () => {
    cloudAs('me', [makeProject({ id: 'p1', name: 'Alpha', owner: 'boss', members: { boss: 'owner', me: 'viewer' } })]);
    renderPage();
    const tile = req((await screen.findAllByRole('listitem'))[0], 'tile');
    expect((within(tile).getByRole('button', { name: 'Export Alpha' }) as HTMLButtonElement).disabled).toBe(false);
    expect((within(tile).getByRole('button', { name: 'Clone Alpha' }) as HTMLButtonElement).disabled).toBe(false);
  });
});
