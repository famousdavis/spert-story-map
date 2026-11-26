// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * S12 (v0.58.0): the Products page's dialogs (DialogShell) are portalled to `body`, outside `#root`, so v0.57.0's
 * `#root *` scope (D5) took their thin scrollbars away: with classic scrollbars, measured in Chrome on v0.57.0, the
 * New Product dialog's scroll area took the platform's 15 px against a Modal's 6 px. The overlay now names itself
 * `data-thin-scrollbars`, which `index.css`'s rules also take (`rootScrollbar.test.ts` holds their selectors). The
 * after-probe measures 6 px in Chrome, and the page's own scrollbar unchanged.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { screen, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null }) }));

import { createLocalStorageDriver } from '../lib/storageDriver';
import { resetLocalCaution } from '../lib/localCaution';
import { installPageEnv, makeProject, renderPage, seedLocal } from './fixtures/projectsPage';
import { req } from './testHelpers';

const driver = createLocalStorageDriver();

beforeEach(() => {
  localStorage.clear();
  resetLocalCaution();
  storage.value = { driver, mode: 'local', storageReady: true };
  installPageEnv(vi);
});
afterEach(() => { cleanup(); localStorage.clear(); vi.unstubAllGlobals(); });

describe('the Products page\'s dialogs keep the thin scrollbars (S12)', () => {
  it.each([
    ['New Product', async () => userEvent.click(await screen.findByRole('button', { name: 'New Product' }))],
    ['Delete Product', async () => userEvent.click(await screen.findByRole('button', { name: 'Delete Alpha' }))],
  ] as const)('%s: its overlay, a child of body outside #root, carries data-thin-scrollbars', async (name, open) => {
    seedLocal([makeProject({ id: 'a', name: 'Alpha' })]);
    renderPage();
    await open();
    const dialog = await screen.findByRole(name === 'New Product' ? 'dialog' : 'alertdialog');
    const overlay = req(dialog.parentElement, 'overlay');
    expect(overlay.parentElement).toBe(document.body);
    expect(overlay.closest('#root')).toBeNull();
    expect(overlay.hasAttribute('data-thin-scrollbars')).toBe(true);
    expect(document.documentElement.hasAttribute('data-thin-scrollbars')).toBe(false);
    expect(document.body.hasAttribute('data-thin-scrollbars')).toBe(false);
  });
});
