// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
// B14 R-1 through the two tabs with undo keys. The host wraps the real `useProduct` around an
// `<Outlet context>`, so a key reaches the real undo and redo (fixtures/productHost's are no-ops).
// jsdom's `navigator.platform` is "", so only the Mac rows exercise Cmd.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { act, cleanup, fireEvent, render, waitFor } from '@testing-library/react';
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom';
import StoryMapView from '../pages/StoryMapView';
import SizingView from '../pages/SizingView';
import { useProduct } from '../hooks/useProduct';
import type { Product } from '../types';
import { makeProduct, makeRib } from './fixtures/progressIntegrity';

const stored = (): Product => makeProduct([makeRib('r', [{ releaseId: 'R1', percentage: 100 }], [])]);
const driver = {
  loadProduct: vi.fn(async () => stored()),
  saveProduct: vi.fn(),
  flushPendingSaves: vi.fn(),
  onProductChange: vi.fn(() => () => {}),
  onProductSaved: vi.fn(() => () => {}),
};
vi.mock('../lib/StorageProvider', () => ({
  useStorage: () => ({ driver, mode: 'local', storageReady: true }),
}));

const bridge: { update: ((fn: (p: Product) => Product) => void) | null; product: Product | null } = { update: null, product: null };

function mount(View: () => ReactElement) {
  function Host() {
    const { product, updateProduct, undo, redo } = useProduct('p');
    bridge.product = product;
    bridge.update = updateProduct;
    if (!product) return null;
    return (
      <Routes>
        <Route element={<Outlet context={{ product, updateProduct, undo, redo }} />}>
          <Route path="*" element={<View />} />
        </Route>
      </Routes>
    );
  }
  return render(<MemoryRouter><Host /></MemoryRouter>);
}

const name = () => bridge.product?.name;
const key = (init: KeyboardEventInit, target: Element | Window = document.body) => act(() => { fireEvent.keyDown(target, init); });

beforeEach(() => {
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  bridge.update = null;
  bridge.product = null;
});

describe.each([['Map', StoryMapView], ['Sizing', SizingView]] as const)('%s tab undo keys', (_tab, View) => {
  /** Mounts the tab, makes one edit, and returns the name from before it. */
  async function edited() {
    mount(View);
    await waitFor(() => expect(bridge.product).not.toBeNull());
    const before = name();
    act(() => { bridge.update?.(p => ({ ...p, name: 'Edited' })); });
    expect(name()).toBe('Edited');
    return before;
  }

  it('Ctrl+Shift+Z, which a browser sends as key "Z", redoes an undone edit', async () => {
    const before = await edited();
    key({ key: 'z', ctrlKey: true });
    expect(name()).toBe(before);
    key({ key: 'Z', ctrlKey: true, shiftKey: true });
    expect(name()).toBe('Edited');
  });

  it('Ctrl+Shift with a lowercase key "y" redoes an undone edit, as before (R57)', async () => {
    const before = await edited();
    key({ key: 'z', ctrlKey: true });
    expect(name()).toBe(before);
    key({ key: 'y', ctrlKey: true, shiftKey: true });
    expect(name()).toBe('Edited');
  });

  it('Ctrl+Shift+Y sent as key "Y" does nothing, as before (R57)', async () => {
    const before = await edited();
    key({ key: 'z', ctrlKey: true });
    expect(name()).toBe(before);
    key({ key: 'Y', ctrlKey: true, shiftKey: true });
    expect(name()).toBe(before);
  });

  it('Ctrl+Z (key "z", no Shift) undoes', async () => {
    const before = await edited();
    key({ key: 'z', ctrlKey: true });
    expect(name()).toBe(before);
  });

  it('Ctrl+Z typed inside an input does nothing', async () => {
    await edited();
    const input = document.createElement('input');
    document.body.appendChild(input);
    key({ key: 'z', ctrlKey: true }, input);
    expect(name()).toBe('Edited');
    input.remove();
  });

  it('on a Mac ("MacIntel"): Ctrl+Z does nothing, Cmd+Z undoes, Cmd+Shift+Z (key "Z") redoes', async () => {
    vi.spyOn(navigator, 'platform', 'get').mockReturnValue('MacIntel');
    const before = await edited();
    key({ key: 'z', ctrlKey: true });
    expect(name()).toBe('Edited');
    key({ key: 'z', metaKey: true });
    expect(name()).toBe(before);
    key({ key: 'Z', metaKey: true, shiftKey: true });
    expect(name()).toBe('Edited');
  });

  it('a bare keydown event with no key raises no error', async () => {
    await edited();
    // jsdom reports a listener's throw as a window `error` event; dispatchEvent itself does not throw.
    const errors: string[] = [];
    const onError = (ev: ErrorEvent) => { errors.push(String(ev.message)); ev.preventDefault(); };
    window.addEventListener('error', onError);
    try {
      act(() => { document.body.dispatchEvent(new Event('keydown', { bubbles: true })); });
      act(() => { window.dispatchEvent(new Event('keydown')); });
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
    expect(name()).toBe('Edited');
  });
});
