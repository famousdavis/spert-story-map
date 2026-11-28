// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * S1 of the FRAME26 follow-ups (v0.59.1). Signed in, the account chip's accessible name said "… click to open Cloud
 * Storage settings", but every click opens the app's Settings dialog, titled "Settings" since v0.58.0. A screen reader
 * announced one dialog and opened another. Now the name ends "open Settings": this test finds the chip in the real
 * frame by that name, clicks it, and requires the dialog that opens to be named as the chip's name says.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const state = vi.hoisted(() => ({
  mode: 'local',
  storage: { driver: { loadPreferences: () => Promise.resolve({}), writePreferences: () => {}, onSaveError: () => () => {} }, storageReady: true, switchMode: () => {} },
}));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ ...state.storage, mode: state.mode }) }));
vi.mock('../lib/AuthProvider', () => ({
  useAuth: () => ({ user: { uid: 'u1', displayName: 'Ana Lima', email: 'ana@example.com' }, firebaseAvailable: false }),
}));

import AppShell from '../components/layout/AppShell';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); state.mode = 'local'; });

describe('the signed-in account chip opens the dialog its name says (S1)', () => {
  it.each(['local', 'cloud'] as const)('%s storage: the chip named "Signed in as Ana — … storage — open Settings" opens "Settings"', async (mode) => {
    state.mode = mode;
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    render(<MemoryRouter><Routes><Route element={<AppShell />}><Route path="/" element={<p>Products</p>} /></Route></Routes></MemoryRouter>);

    const chip = screen.getByRole('button', { name: `Signed in as Ana — ${mode} storage — open Settings` });
    const name = chip.getAttribute('aria-label') ?? '';
    expect(name).not.toMatch(/Cloud Storage/);
    expect(screen.queryByRole('dialog')).toBeNull();

    await userEvent.click(chip);
    const opened = name.replace(/^.* — open /, '');
    expect(opened).toBe('Settings');
    const dialog = screen.getByRole('dialog', { name: opened });
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe(opened);
  });
});
