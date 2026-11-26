// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * S6 and S7 (v0.58.0). The shared `Modal` had no role: a screen reader met its content as part of the page. Now every
 * Modal, and so every ConfirmDialog, is `role="dialog"`, `aria-modal="true"`, named by its title. The app Settings
 * dialog, opened by the navigation row's "Settings", was titled "Cloud Storage" though it also holds Export Attribution
 * and Notifications; it is "Settings" now (William, 2026-11-26).
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// One storage value, its driver included, for every call: a new driver each render would re-run every driver-keyed
// effect in the frame without end.
const storage = vi.hoisted(() => ({ driver: { loadPreferences: () => Promise.resolve({}), writePreferences: () => {}, onSaveError: () => () => {} }, mode: 'local', storageReady: true, switchMode: () => {} }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: false }) }));

import Modal from '../components/ui/Modal';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import AppShell from '../components/layout/AppShell';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('every Modal is a modal dialog named by its title (S6)', () => {
  it('Modal', () => {
    render(<Modal open onClose={() => {}} title="Allocate: Login"><p>body</p></Modal>);
    const dialog = screen.getByRole('dialog', { name: 'Allocate: Login' });
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(within(dialog).getByText('body')).toBeTruthy();
    const title = document.getElementById(dialog.getAttribute('aria-labelledby') ?? '');
    expect(title?.tagName).toBe('H2');
  });

  it('two Modals open at once get different title ids', () => {
    render(<><Modal open onClose={() => {}} title="One"><p>1</p></Modal><Modal open onClose={() => {}} title="Two"><p>2</p></Modal></>);
    const ids = screen.getAllByRole('dialog').map(d => d.getAttribute('aria-labelledby'));
    expect(new Set(ids).size).toBe(2);
    expect(screen.getByRole('dialog', { name: 'One' })).toBeTruthy();
    expect(screen.getByRole('dialog', { name: 'Two' })).toBeTruthy();
  });

  it('ConfirmDialog, which renders a Modal', () => {
    render(<ConfirmDialog open title="Delete Release" message="Delete it?" onConfirm={() => {}} onClose={() => {}} />);
    expect(screen.getByRole('dialog', { name: 'Delete Release' }).getAttribute('aria-modal')).toBe('true');
  });

  it('a closed Modal renders nothing', () => {
    render(<Modal open={false} onClose={() => {}} title="Hidden"><p>x</p></Modal>);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('the app Settings dialog is "Settings" (S7)', () => {
  it('the navigation row\'s Settings opens a dialog named "Settings", holding Storage, Export Attribution and Notifications', async () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    render(<MemoryRouter><Routes><Route element={<AppShell />}><Route path="/" element={<p>Products</p>} /></Route></Routes></MemoryRouter>);
    await userEvent.click(within(document.querySelector('nav') as HTMLElement).getByRole('button', { name: 'Settings' }));
    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    expect(within(dialog).getByRole('heading', { level: 2 }).textContent).toBe('Settings');
    expect(within(dialog).queryByText('Cloud Storage', { selector: 'h2' })).toBeNull();
    for (const section of ['Export Attribution', 'Notifications']) expect(within(dialog).getByText(section)).toBeTruthy();
  });
});
