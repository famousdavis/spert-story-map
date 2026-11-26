// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * S10 (v0.58.0): one theme source. The charts took their colours from their own `useDarkMode()`, a separate copy of
 * the theme read once when the view mounted. The frame's theme button (AppShell's own `useDarkMode`) switched the page
 * and the chart kept its colours until its view remounted: measured on v0.57.0, Insights' grid stayed `#f0f0f0` after
 * the button made the page dark, and turned `#374151` only after leaving the tab and coming back. The charts now read
 * `useIsDark()`, the `dark` class itself.
 *
 * The real frame and the real Insights view; Recharts' `ResponsiveContainer` is given a size, since jsdom lays out
 * nothing and it would otherwise draw no chart at all.
 */
import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { cloneElement, isValidElement, type ReactElement, type ReactNode } from 'react';
import { render, cleanup, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';

vi.mock('recharts', async orig => {
  const m = await orig<typeof import('recharts')>();
  return {
    ...m,
    ResponsiveContainer: ({ children }: { children: ReactNode }) =>
      (isValidElement(children) ? cloneElement(children as ReactElement<{ width: number; height: number }>, { width: 600, height: 240 }) : null),
  };
});
// One storage value, its driver included, for every call: a new driver each render would re-run every driver-keyed
// effect in the frame without end.
const storage = vi.hoisted(() => ({ driver: { loadPreferences: () => Promise.resolve({}), writePreferences: () => {}, onSaveError: () => () => {} }, mode: 'local', storageReady: true }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: false }) }));

import AppShell from '../components/layout/AppShell';
import InsightsView from '../pages/InsightsView';
import { makeProduct, makeRib } from './fixtures/progressIntegrity';
import { req } from './testHelpers';

const product = makeProduct([
  makeRib('a', [{ releaseId: 'R1', percentage: 100 }], [], 'L'),
  makeRib('b', [{ releaseId: 'R2', percentage: 100 }], [], 'M'),
]);

function Hosted() {
  return <Outlet context={{ product, updateProduct: () => {}, undo: () => {}, redo: () => {} }} />;
}

beforeEach(() => {
  localStorage.setItem('spert-theme', 'light');
  document.documentElement.classList.remove('dark');
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => { cleanup(); localStorage.clear(); document.documentElement.classList.remove('dark'); vi.unstubAllGlobals(); });

/** Every grid line's stroke, across the view's charts. */
const settle = () => act(async () => { for (let i = 0; i < 5; i += 1) await new Promise(r => setTimeout(r, 20)); });
const gridStrokes = () => [...new Set(Array.from(document.querySelectorAll('.recharts-cartesian-grid line')).map(l => l.getAttribute('stroke')))];

describe('a chart follows the theme button at once, with no remount (S10)', () => {
  it('light → dark → System (light here): the grid goes #f0f0f0 → #374151 → #f0f0f0, the same view throughout', async () => {
    render(<MemoryRouter><Routes><Route element={<AppShell />}><Route element={<Hosted />}><Route path="/" element={<InsightsView />} /></Route></Route></Routes></MemoryRouter>);
    await settle();
    const view = req(document.querySelector('main h2'), 'the view\'s first heading');
    expect(gridStrokes()).toEqual(['#f0f0f0']); // must-find control: the grid is drawn, in light
    const theme = req(document.querySelector<HTMLElement>('[data-sf="theme"]'), 'the theme button');

    await userEvent.click(theme);
    await settle();
    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(gridStrokes()).toEqual(['#374151']);

    await userEvent.click(theme);
    await settle();
    expect(document.documentElement.classList.contains('dark')).toBe(false);
    expect(gridStrokes()).toEqual(['#f0f0f0']);
    expect(document.querySelector('main h2')).toBe(view); // never remounted
  });
});
