// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * N9 (FRAME26, v0.57.0, D13): an address no route matches is a framed 404. Before, it rendered nothing at all: no
 * frame, no heading, no way back. Now the frame draws, no navigation item is current, the heading says so, and the
 * body links back to Products. The words are the suite's (MyScrumBudget, Scheduler, CFD), with Story Map's noun.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ driver: null, mode: 'local', storageReady: false }) }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: false }) }));

import App from '../App';
import { req } from './testHelpers';

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('the 404 (D13)', () => {
  it.each(['/no-such-page', '/product/p1/no-such-tab', '/about/more'])('%s: framed, "Page not found", a link back, nothing current', async path => {
    render(<MemoryRouter initialEntries={[path]}><App /></MemoryRouter>);
    const h1 = await screen.findByRole('heading', { level: 1, name: 'Page not found' });
    expect(document.querySelectorAll('h1')).toHaveLength(1);
    const main = req(document.querySelector<HTMLElement>('[data-sf="main"]'), 'main');
    expect(main.contains(h1)).toBe(true);
    expect(within(main).getByText("There's no page at this address.")).toBeTruthy();
    expect(within(main).getByRole('link', { name: 'Back to Products' }).getAttribute('href')).toBe('/');
    const nav = req(document.querySelector<HTMLElement>('[data-sf="nav"]'), 'nav');
    expect(nav.querySelectorAll('[aria-current]')).toHaveLength(0);
    expect(within(req(nav.querySelector<HTMLElement>('[data-sf="nav-work"]'), 'work')).getAllByRole('link').map(a => a.textContent)).toEqual(['Products']);
    expect(document.querySelector('[data-sf="footer"]')).toBeTruthy();
  });
});
