// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
// R73 v0.56.2, R-4 (R101), the way the app passes it. `changeLogReplaceUndo.test.tsx` hands `useProduct`'s
// `updateProduct` straight to `DataSection`; in the app it goes through `ProductLayout`'s Outlet and
// `SettingsView`, and either could drop the option that clears undo (review Opus-PR247-1-03). So here
// every piece is the real one: the layout, the Settings tab, its Data section, the Map tab and the
// local driver. Only the two context hooks are stubbed, as `projectsLink.test.tsx` does.
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import '@testing-library/jest-dom/vitest';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

const storage = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => storage.value }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: false }) }));

import ProductLayout from '../components/layout/ProductLayout';
import SettingsView from '../pages/SettingsView';
import StoryMapView from '../pages/StoryMapView';
import { createLocalStorageDriver } from '../lib/storageDriver';
import { flushPendingSaves } from '../lib/storage';
import { fileProduct } from './fixtures/changeLogFiles';

const driver = createLocalStorageDriver();
const shownName = () => screen.getByRole('heading', { level: 1 }).textContent;
const storedName = () => {
  flushPendingSaves();
  return (JSON.parse(localStorage.getItem('rp:local:product_p1') ?? 'null') as { name?: string } | null)?.name;
};
const key = (init: KeyboardEventInit) => act(() => { fireEvent.keyDown(document.body, init); });

beforeEach(() => {
  localStorage.clear();
  storage.value = { driver, mode: 'local', storageReady: true };
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('scrollTo', vi.fn());
});

afterEach(() => {
  cleanup();
  flushPendingSaves();
  localStorage.clear();
  vi.unstubAllGlobals();
});

describe('a Data replace through the real layout and Settings tab', () => {
  it('leaves nothing for Ctrl+Z or redo on the Map tab, on screen or in the store', async () => {
    await driver.createProduct(fileProduct('p1', 'Before', 40, 'pre'));
    render(
      <MemoryRouter initialEntries={['/product/p1/settings']}>
        <Routes>
          <Route path="/product/:productId" element={<ProductLayout />}>
            <Route path="settings" element={<SettingsView />} />
            <Route path="storymap" element={<StoryMapView />} />
          </Route>
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(shownName()).toBe('Before'));

    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    await userEvent.upload(input, new File([JSON.stringify(fileProduct('x', 'From file', 300))], 'f.json'));
    await userEvent.click(await screen.findByRole('button', { name: /replace all data/i }));
    await waitFor(() => expect(shownName()).toBe('From file'));

    // The Map tab, by its own link: the stacks live in the layout, so they survive the tab change.
    await userEvent.click(screen.getByRole('link', { name: /Map/ }));
    await waitFor(() => expect(document.querySelector('[data-map-container]')).not.toBeNull());

    key({ key: 'z', ctrlKey: true });
    expect(shownName()).toBe('From file');
    key({ key: 'Z', ctrlKey: true, shiftKey: true });
    expect(shownName()).toBe('From file');
    expect(storedName()).toBe('From file');
  });
});
