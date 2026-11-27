// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * S6 and S7 (v0.58.0). The shared `Modal` had no role: a screen reader met its content as part of the page. Now every
 * Modal, and so every ConfirmDialog, is `role="dialog"`, `aria-modal="true"`, named by its title. The app Settings
 * dialog, opened by the navigation row's "Settings", was titled "Cloud Storage" though it also holds Export Attribution
 * and Notifications; it is "Settings" now (William, 2026-11-26).
 *
 * S1 and S2 of FRAME26 pass 3 (v0.59.0), measured on production v0.58.0 in Chrome: the close button's accessible name
 * was "×"; opening a dialog left focus on what opened it, and 19 of 25 Tabs (20 of 25 Shift+Tabs) left the dialog. Now
 * every Modal (and ConfirmDialog) names its close button "Close", takes focus in on open, keeps Tab inside while it is
 * the top dialog, closes the top one on Escape, and gives focus back to its opener on close.
 */
import { useState } from 'react';
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

// ---- FRAME26 pass 3 (v0.59.0): S1 and S2 ----

/** A page with an opener and a control outside the dialog, as every caller of Modal has. */
function Host({ children }: { children?: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>Open</button>
      <button>Elsewhere</button>
      {/* A new onClose on every render, as most callers pass: the focus behaviour must not re-run on it. */}
      <Modal open={open} onClose={() => setOpen(false)} title="Edit">
        {children ?? <><input aria-label="Name" /><button>Save</button></>}
      </Modal>
    </>
  );
}

/** ShareDialog's shape: a Modal whose button opens a second Modal (a ConfirmDialog) over it. */
function Nested({ onOuterClose }: { onOuterClose: () => void }) {
  const [inner, setInner] = useState(false);
  return (
    <>
      <button>Page</button>
      <Modal open onClose={onOuterClose} title="Share">
        <button onClick={() => setInner(true)}>Revoke</button>
        <Modal open={inner} onClose={() => setInner(false)} title="Confirm"><button>Yes</button><button>No</button></Modal>
      </Modal>
    </>
  );
}

const active = () => document.activeElement;
const nameOf = (el: Element | null) => (el?.getAttribute('aria-label') ?? el?.textContent ?? '').trim();

describe('S1 (v0.59.0): the close button is named "Close"', () => {
  it('named "Close", its × hidden from screen readers; no button is named "×"', () => {
    render(<Modal open onClose={() => {}} title="T"><p>body</p></Modal>);
    const close = screen.getByRole('button', { name: 'Close' });
    const glyph = close.querySelector('[aria-hidden="true"]');
    expect(glyph?.textContent).toBe('×');
    expect(screen.queryByRole('button', { name: '×' })).toBeNull();
  });

  it('every ConfirmDialog too', () => {
    render(<ConfirmDialog open title="Delete Release" message="Delete it?" onConfirm={() => {}} onClose={() => {}} />);
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Close' })).toBeTruthy();
  });
});

describe('S2 (v0.59.0): focus moves in, Tab stays in, Escape closes the top one, focus goes back', () => {
  it('on open, the dialog itself takes focus when no child has', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit' });
    expect(active()).toBe(dialog);
    expect(dialog.getAttribute('tabindex')).toBe('-1');
  });

  it('a child that took focus as it mounted keeps it', async () => {
    render(<Host><input aria-label="Name" autoFocus /></Host>);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    expect(active()).toBe(screen.getByRole('textbox', { name: 'Name' }));
  });

  it('Tab from the last control goes to the first, Shift+Tab from the first to the last; 12 of each never leave', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    const dialog = screen.getByRole('dialog', { name: 'Edit' });
    await userEvent.tab();
    expect(nameOf(active())).toBe('Close');
    screen.getByRole('button', { name: 'Save' }).focus();
    await userEvent.tab();
    expect(nameOf(active())).toBe('Close');
    await userEvent.tab({ shift: true });
    expect(nameOf(active())).toBe('Save');
    const seen: string[] = [];
    for (let i = 0; i < 12; i++) { await userEvent.tab(); expect(dialog.contains(active())).toBe(true); seen.push(nameOf(active())); }
    for (let i = 0; i < 12; i++) { await userEvent.tab({ shift: true }); expect(dialog.contains(active())).toBe(true); }
    expect(seen.slice(0, 3)).toEqual(['Close', 'Name', 'Save']);
  });

  it('Shift+Tab from the dialog itself goes to its last control; from outside, Tab comes back in', async () => {
    render(<Host />);
    await userEvent.click(screen.getByRole('button', { name: 'Open' }));
    await userEvent.tab({ shift: true });
    expect(nameOf(active())).toBe('Save');
    screen.getByRole('button', { name: 'Elsewhere' }).focus();
    await userEvent.tab();
    expect(nameOf(active())).toBe('Close');
  });

  it('Escape closes it, and focus returns to the button that opened it', async () => {
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    expect(screen.getByRole('dialog').contains(active())).toBe(true); // focus left the opener, so its return is real
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(active()).toBe(opener);
  });

  it('closed by its Close button, focus returns to the opener too', async () => {
    render(<Host />);
    const opener = screen.getByRole('button', { name: 'Open' });
    await userEvent.click(opener);
    await userEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(active()).toBe(opener);
  });

  it('two open: only the top one keeps Tab and closes on Escape; focus goes back into the one under it', async () => {
    const onOuterClose = vi.fn();
    render(<Nested onOuterClose={onOuterClose} />);
    const share = screen.getByRole('dialog', { name: 'Share' });
    const revoke = within(share).getByRole('button', { name: 'Revoke' });
    await userEvent.click(revoke);
    const confirm = screen.getByRole('dialog', { name: 'Confirm' });
    expect(active()).toBe(confirm);
    for (let i = 0; i < 6; i++) { await userEvent.tab(); expect(confirm.contains(active())).toBe(true); }
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog', { name: 'Confirm' })).toBeNull();
    expect(onOuterClose).not.toHaveBeenCalled();
    expect(active()).toBe(revoke);
    await userEvent.keyboard('{Escape}');
    expect(onOuterClose).toHaveBeenCalledTimes(1);
  });
});
