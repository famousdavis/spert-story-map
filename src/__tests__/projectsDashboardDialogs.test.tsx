// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * The Projects page's dialogs (v0.55.0): one dialog for New Project and Edit Project, and the
 * Delete confirmation, in the page's own shell. Through the real page on the real local driver.
 *
 * ⚠️ jsdom does not enforce `inert`, so these tests cannot see focus moved while the page is still
 * inert (a silent no-op in a browser). The release's browser check measures focus after Cancel,
 * Escape, Update and a confirmed delete in a real browser.
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
import { resetLocalCaution } from '../lib/localCaution';
import { req } from './testHelpers';
import { installPageEnv, makeProject, renderPage, seedLocal, stored, tileNames, tiles } from './fixtures/projectsPage';
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
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function showProjects(names: string[], extra: Partial<Parameters<typeof makeProject>[0]> = {}) {
  seedLocal(names.map((n, i) => makeProject({ id: `p${i}`, name: n, description: `${n} described`, ...extra })));
  renderPage();
  await screen.findByRole('list', { name: 'Projects' });
}

const tileOf = (name: string) => req(tiles().find(t => t.querySelector('h3')?.textContent === name), `tile ${name}`);
const control = (name: string, label: string) => within(tileOf(name)).getByRole('button', { name: `${label} ${name}` });

describe('New Project', () => {
  it('is a modal dialog named by its title, focus in Project Name; Cancel then Create; the hint', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    const dialog = screen.getByRole('dialog', { name: 'New Project' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(within(dialog).getByLabelText('Project Name'));
    expect(within(dialog).getByLabelText('Description (Optional)').tagName).toBe('TEXTAREA');
    expect(within(dialog).getAllByRole('button').map(b => b.textContent)).toEqual(['Cancel', 'Create']);
    expect(within(dialog).getByText('Enter in Project Name, or Ctrl+S (Cmd+S), saves. Esc cancels.')).toBeTruthy();
    expect(within(dialog).queryByRole('button', { name: /close|×/i })).toBeNull();
  });

  it('Create is disabled while the trimmed name is empty', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    const create = screen.getByRole('button', { name: 'Create' }) as HTMLButtonElement;
    expect(create.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Project Name'), '   ');
    expect(create.disabled).toBe(true);
    await userEvent.type(screen.getByLabelText('Project Name'), 'x');
    expect(create.disabled).toBe(false);
  });

  it('creates the project, both fields trimmed, and lands on Structure (unchanged)', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    await userEvent.type(screen.getByLabelText('Project Name'), '  Beta  ');
    await userEvent.type(screen.getByLabelText('Description (Optional)'), '  about beta  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create' }));
    await screen.findByText('Structure page');
    flushPendingSaves();
    const index = JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]') as { id: string; name: string }[];
    const beta = req(index.find(e => e.name === 'Beta'), 'Beta in the index');
    expect(req(stored(beta.id), 'Beta').description).toBe('about beta');
  });

  it('Enter in Project Name creates; Enter in the description is a line break', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    await userEvent.type(screen.getByLabelText('Description (Optional)'), 'one{Enter}two');
    expect((screen.getByLabelText('Description (Optional)') as HTMLTextAreaElement).value).toBe('one\ntwo');
    expect(screen.queryByText('Structure page')).toBeNull();
    await userEvent.type(screen.getByLabelText('Project Name'), 'Gamma{Enter}');
    await screen.findByText('Structure page');
  });

  it('a 1001st character cannot be typed in the name', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    const name = screen.getByLabelText('Project Name') as HTMLInputElement;
    expect(name.maxLength).toBe(1000);
    fireEvent.change(name, { target: { value: 'x'.repeat(1000) } });
    await userEvent.type(name, 'y');
    expect(name.value).toHaveLength(1000);
    expect((screen.getByLabelText('Description (Optional)') as HTMLTextAreaElement).maxLength).toBe(-1);
  });

  it('Tab and Shift+Tab wrap at the dialog\'s ends', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    await userEvent.type(screen.getByLabelText('Project Name'), 'x');
    const name = screen.getByLabelText('Project Name');
    const create = screen.getByRole('button', { name: 'Create' });
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(create);
    await userEvent.tab();
    expect(document.activeElement).toBe(name);
  });

  it('Escape closes it, and no other listener on the page sees it: a waiting import stays', async () => {
    await showProjects(['Alpha']);
    const seen: string[] = [];
    const spy = (e: KeyboardEvent) => seen.push(e.key);
    document.addEventListener('keydown', spy);
    window.addEventListener('keydown', spy);
    try {
      const file = new File([JSON.stringify(createSampleProduct())], 'p.json', { type: 'application/json' });
      await userEvent.upload(req(document.querySelector<HTMLInputElement>('input[type="file"]'), 'file input'), file);
      await screen.findByRole('button', { name: 'Confirm Import' });
      await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
      await userEvent.keyboard('{Escape}');
      expect(screen.queryByRole('dialog')).toBeNull();
      expect(seen).not.toContain('Escape');
      expect(screen.getByRole('button', { name: 'Confirm Import' })).toBeTruthy();
    } finally {
      document.removeEventListener('keydown', spy);
      window.removeEventListener('keydown', spy);
    }
  });

  it.each([['Ctrl+S', { ctrlKey: true }], ['Cmd+S', { metaKey: true }]])('%s saves, and is consumed', async (_label, mods) => {
    await showProjects(['Alpha']);
    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    await userEvent.type(screen.getByLabelText('Project Name'), 'Delta');
    const notPrevented = fireEvent.keyDown(screen.getByLabelText('Project Name'), { key: 's', ...mods });
    expect(notPrevented).toBe(false);
    await screen.findByText('Structure page');
  });

  it.each([['Ctrl+S', { ctrlKey: true }], ['Cmd+S', { metaKey: true }]])('%s with an empty name saves nothing and is still consumed', async (_label, mods) => {
    await showProjects(['Alpha']);
    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    const notPrevented = fireEvent.keyDown(screen.getByLabelText('Project Name'), { key: 's', ...mods });
    expect(notPrevented).toBe(false);
    await settle();
    expect(screen.getByRole('dialog', { name: 'New Project' })).toBeTruthy();
    expect(tileNames()).toEqual(['Alpha']);
  });

  it('a click on the backdrop does not close it', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
    const overlay = req(screen.getByRole('dialog').parentElement, 'overlay');
    fireEvent.mouseDown(overlay);
    fireEvent.click(overlay);
    expect(screen.getByRole('dialog', { name: 'New Project' })).toBeTruthy();
  });

  it('the page behind is inert while it is open, and only what it made inert is restored', async () => {
    await showProjects(['Alpha']);
    const already = document.createElement('div');
    already.setAttribute('inert', '');
    document.body.appendChild(already);
    try {
      await userEvent.click(screen.getByRole('button', { name: 'New Project' }));
      const overlay = req(screen.getByRole('dialog').parentElement, 'overlay');
      const others = [...document.body.children].filter(el => el !== overlay);
      expect(others.every(el => el.hasAttribute('inert'))).toBe(true);
      await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
      expect([...document.body.children].filter(el => el.hasAttribute('inert'))).toEqual([already]);
    } finally {
      already.remove();
    }
  });
});

describe('Edit Project', () => {
  it('opens on the tile\'s Edit with both fields prefilled, the name selected', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(control('Alpha', 'Edit'));
    const dialog = screen.getByRole('dialog', { name: 'Edit Project' });
    const name = within(dialog).getByLabelText('Project Name') as HTMLInputElement;
    expect([name.value, (within(dialog).getByLabelText('Description (Optional)') as HTMLTextAreaElement).value])
      .toEqual(['Alpha', 'Alpha described']);
    expect(document.activeElement).toBe(name);
    expect([name.selectionStart, name.selectionEnd]).toEqual([0, 5]);
    expect(within(dialog).getAllByRole('button').map(b => b.textContent)).toEqual(['Cancel', 'Update']);
  });

  it('changing only the name keeps a description stored after the dialog opened', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(control('Alpha', 'Edit'));
    // Written elsewhere while the dialog is open: another tab, Settings, a collaborator.
    const now = req(stored('p0'), 'p0');
    localStorage.setItem('rp:local:product_p0', JSON.stringify({ ...now, description: '  Rewritten in Settings  ' }));
    const name = screen.getByLabelText('Project Name');
    await userEvent.clear(name);
    await userEvent.type(name, 'Alpha 2');
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(tileNames()).toEqual(['Alpha 2']));
    const after = req(stored('p0'), 'p0');
    expect([after.name, after.description]).toEqual(['Alpha 2', '  Rewritten in Settings  ']);
  });

  it('changing only the description keeps a name stored after the dialog opened', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(control('Alpha', 'Edit'));
    const now = req(stored('p0'), 'p0');
    localStorage.setItem('rp:local:product_p0', JSON.stringify({ ...now, name: 'Renamed elsewhere' }));
    const desc = screen.getByLabelText('Description (Optional)');
    await userEvent.clear(desc);
    await userEvent.type(desc, '  New words  ');
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    await settle();
    const after = req(stored('p0'), 'p0');
    expect([after.name, after.description]).toEqual(['Renamed elsewhere', 'New words']);
  });

  it('appends no changelog entry', async () => {
    await showProjects(['Alpha']);
    const before = req(stored('p0'), 'p0')._changeLog?.length;
    await userEvent.click(control('Alpha', 'Edit'));
    await userEvent.type(screen.getByLabelText('Project Name'), ' 2');
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    await waitFor(() => expect(tileNames()).toEqual(['Alpha 2']));
    expect(req(stored('p0'), 'p0')._changeLog?.length).toBe(before);
  });

  it('an unchanged Update writes nothing, whitespace included', async () => {
    const save = vi.spyOn(driver, 'saveProductImmediate');
    await showProjects(['Alpha']);
    await userEvent.click(control('Alpha', 'Edit'));
    await userEvent.type(screen.getByLabelText('Project Name'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'Update' }));
    await settle();
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(save).not.toHaveBeenCalled();
  });
});

describe('focus when a dialog closes (§5.8)', () => {
  it('New Project, Cancel and Escape: back to the toolbar\'s New Project', async () => {
    await showProjects(['Alpha']);
    const newProject = screen.getByRole('button', { name: 'New Project' });
    await userEvent.click(newProject);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(document.activeElement).toBe(newProject);
    await userEvent.click(newProject);
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(newProject);
  });

  it('New Project from the welcome panel: back to its Create New Project', async () => {
    seedLocal([]);
    renderPage();
    const create = await screen.findByRole('button', { name: 'Create New Project' });
    await userEvent.click(create);
    expect(screen.getByRole('dialog', { name: 'New Project' })).toBeTruthy();
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(create);
  });

  it.each(['Cancel', 'Escape', 'Update'])('Edit, %s: that tile\'s Edit', async (how) => {
    await showProjects(['Alpha', 'Beta']);
    await userEvent.click(control('Beta', 'Edit'));
    if (how === 'Escape') await userEvent.keyboard('{Escape}');
    else {
      if (how === 'Update') await userEvent.type(screen.getByLabelText('Project Name'), 'x');
      await userEvent.click(screen.getByRole('button', { name: how }));
    }
    await settle();
    const name = how === 'Update' ? 'Betax' : 'Beta';
    expect(document.activeElement).toBe(control(name, 'Edit'));
  });

  it.each(['Cancel', 'Escape', 'backdrop'])('Delete, %s: that tile\'s Delete, nothing deleted', async (how) => {
    await showProjects(['Alpha', 'Beta']);
    await userEvent.click(control('Beta', 'Delete'));
    if (how === 'Escape') await userEvent.keyboard('{Escape}');
    else if (how === 'Cancel') await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    else {
      const overlay = req(screen.getByRole('alertdialog').parentElement, 'overlay');
      fireEvent.mouseDown(overlay);
      fireEvent.click(overlay);
    }
    await settle();
    expect(screen.queryByRole('alertdialog')).toBeNull();
    expect(document.activeElement).toBe(control('Beta', 'Delete'));
    expect(tileNames()).toEqual(['Alpha', 'Beta']);
  });

  it.each([
    ['the next tile\'s open button', ['A', 'B', 'C'], 'B', 'Open Structure for C'],
    ['the previous one\'s, when it was the last', ['A', 'B', 'C'], 'C', 'Open Structure for B'],
    ['New Project, when none is left', ['A'], 'A', 'New Project'],
  ])('Delete, confirmed: %s', async (_label, names, target, focusName) => {
    await showProjects(names);
    await userEvent.click(control(target, 'Delete'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(tileNames()).not.toContain(target));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: focusName }));
    expect(stored(`p${names.indexOf(target)}`)).toBeNull();
  });

  it('Delete, confirmed but refused (a cloud delete that failed): back to that tile\'s Delete', async () => {
    const refusing: StorageDriver = { ...driver, deleteProduct: () => Promise.resolve() };
    storage.value = { driver: refusing, mode: 'local', storageReady: true };
    await showProjects(['A', 'B']);
    await userEvent.click(control('A', 'Delete'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await settle();
    await settle();
    expect(tileNames()).toEqual(['A', 'B']);
    expect(document.activeElement).toBe(control('A', 'Delete'));
  });

  it('with an id holding a space and a ", and a name holding " and \\', async () => {
    const odd = 'odd id "x"';
    const name = 'Say "hi" \\ there';
    seedLocal([makeProject({ id: 'p0', name: 'First' }), makeProject({ id: odd, name }), makeProject({ id: 'p2', name: 'Last' })]);
    renderPage();
    await screen.findByRole('list', { name: 'Projects' });
    await userEvent.click(control(name, 'Edit'));
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(control(name, 'Edit'));
    await userEvent.click(control(name, 'Delete'));
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(control(name, 'Delete'));
    await userEvent.click(control(name, 'Delete'));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(tileNames()).toEqual(['First', 'Last']));
    await settle();
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Open Structure for Last' }));
  });
});

describe('the Delete confirmation', () => {
  it('is an alertdialog named by its title and described by its message; focus on Cancel; Cancel then Delete', async () => {
    await showProjects(['Alpha']);
    await userEvent.click(control('Alpha', 'Delete'));
    const dialog = screen.getByRole('alertdialog', { name: 'Delete Project' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const message = document.getElementById(req(dialog.getAttribute('aria-describedby'), 'describedby'));
    expect(message?.textContent).toBe('Are you sure you want to delete "Alpha"? This cannot be undone. Consider exporting first.');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Cancel' }));
    expect(within(dialog).getAllByRole('button').map(b => b.textContent)).toEqual(['Cancel', 'Delete']);
  });
});
