// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * The Welcome panel (v0.58.0, FRAME26's clean-up; contract §3 and §7, stylesheet v3): Story Map's panel moves onto the
 * frame's `.sf-empty` and its parts, in the contract's order, so the stylesheet draws it 16 px below the heading row,
 * on the page ground in both themes, with 36 px actions. frame-check measures the drawn result in Chrome; this pins the
 * markup that makes it so, and that the panel's two actions are the toolbar's.
 *
 * Before: its own card (`mt-6`, `rounded-[10px]`, `bg-[#171717]` in dark), 24 px below the row, 10 px corners, 35 px
 * buttons, and the note at 3.71 : 1 on that card in dark.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup, within } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { resetLocalCaution } from '../lib/localCaution';
import { installPageEnv, renderPage, seedLocal } from './fixtures/projectsPage';
import { TOOLBAR_PRIMARY, TOOLBAR_SECONDARY } from '../components/product/button-styles';
import { req } from './testHelpers';

const driver = createLocalStorageDriver();
const SOURCE = readFileSync(resolve(__dirname, '../components/product/ProjectsEmptyState.tsx'), 'utf8');

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  storage.value = { driver, mode: 'local', storageReady: true };
  installPageEnv(vi);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

async function panel() {
  seedLocal([]);
  renderPage();
  const title = await screen.findByRole('heading', { name: 'Welcome to SPERT® Story Map' });
  return { title, panel: req(title.parentElement, 'the panel') };
}
const classes = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/).filter(Boolean);

describe('the Welcome panel is the frame\'s (§7)', () => {
  it('a `.sf-empty` hooked `data-sf="empty"`, a named region, in the tile grid\'s place in `main`', async () => {
    const { panel: p } = await panel();
    expect(classes(p)).toEqual(['sf-empty']);
    expect(p.getAttribute('data-sf')).toBe('empty');
    expect(p.getAttribute('role')).toBe('region');
    expect(within(p).getByRole('heading').id).toBe(p.getAttribute('aria-labelledby'));
    expect(p.closest('[data-sf="main"]')).not.toBeNull();
    expect(document.querySelector('[data-sf="tiles"]')).toBeNull();
  });

  it('its parts in the contract\'s order: title, two lines, the actions, the note', async () => {
    const { panel: p } = await panel();
    expect(Array.from(p.children).map(c => `${c.tagName.toLowerCase()}.${classes(c).join('.')}`)).toEqual([
      'h2.sf-empty-title', 'p.sf-empty-text', 'p.sf-empty-text', 'div.sf-empty-actions', 'p.sf-empty-note',
    ]);
  });

  it('the title is "Welcome to " and the brand row\'s title, its ® in the same `.sf-mark`', async () => {
    const { title } = await panel();
    const brand = req(document.querySelector('[data-sf="title"]'), 'the brand row\'s title');
    expect(title.textContent).toBe(`Welcome to ${brand.textContent}`);
    expect(title.textContent).toBe('Welcome to SPERT® Story Map');
    const marks = title.querySelectorAll('.sf-mark');
    expect(marks).toHaveLength(1);
    expect(marks[0]?.textContent).toBe('®');
    expect(brand.querySelector('.sf-mark')?.textContent).toBe('®');
  });

  it('its two actions are `.sf-btn` in the toolbar\'s two looks: Create New Product primary, Load Sample Product secondary', async () => {
    const { panel: p } = await panel();
    const actions = req(p.querySelector('.sf-empty-actions'), 'actions');
    const [create, sample] = Array.from(actions.querySelectorAll('button'));
    expect(create?.textContent).toBe('Create New Product');
    expect(sample?.textContent).toBe('Load Sample Product');
    for (const b of [create, sample]) expect(classes(req(b, 'button'))).toContain('sf-btn');
    for (const c of TOOLBAR_PRIMARY.split(/\s+/)) expect(classes(req(create, 'create'))).toContain(c);
    for (const c of TOOLBAR_SECONDARY.split(/\s+/)) expect(classes(req(sample, 'sample'))).toContain(c);
    expect(classes(req(sample, 'sample'))).not.toContain('dark:bg-transparent');
  });

  it('Load Sample is on the panel exactly when the toolbar has it (frame-check\'s `empty.sample`)', async () => {
    await panel();
    const toolbar = req(document.querySelector<HTMLElement>('[data-sf="toolbar"]'), 'toolbar');
    expect(within(toolbar).getByRole('button', { name: 'Load Sample' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Load Sample Product' })).toBeTruthy();
  });

  it('none of the old panel\'s own margin, border, ground or type classes remain (a dead class is a trap)', () => {
    for (const old of ['mt-6', 'rounded-[10px]', 'border-dashed', 'border-[#e5e5e5]', 'bg-[#171717]', 'dark:bg-[#171717]', 'p-8',
      'text-xl', 'font-semibold', 'text-[#666]', 'max-w-prose', 'italic', 'dark:bg-transparent', 'mb-3', 'mt-4']) {
      expect(SOURCE, old).not.toContain(old);
    }
  });
});
