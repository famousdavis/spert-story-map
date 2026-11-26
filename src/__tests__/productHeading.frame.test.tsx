// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * N7 (FRAME26, v0.57.0): inside a product, the product's own heading row (contract §7).
 * - The product's name is the page's `h1`, with the full name in `title` (the frame cuts it with an ellipsis).
 * - Connect AI is the toolbar's one button, the frame's 36 px `.sf-btn`, in both of its states (D10, OP4).
 * - Saved is status text just left of the toolbar, OUTSIDE it, at 12 px in the frame's muted colour, which clears 4.5
 *   on both grounds (D10).
 * - While the product loads, or when it cannot be found, the frame stays and the heading row reads "Product" (D13).
 * - The product's own notices (a failed save, a part left out on load) sit below its heading row, not in the frame's
 *   notices slot, which is the app's (D12).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const S = vi.hoisted(() => ({
  product: null as null | { id: string; name: string },
  loading: false,
  lastSaved: null as Date | null,
  mode: 'local' as 'local' | 'cloud',
  firebase: true,
  session: { sessionActive: false, aiConnected: false, boundProductId: null as string | null },
  saveError: null as null | (() => void),
}));
vi.mock('../hooks/useProduct', () => ({
  useProduct: () => ({ product: S.product, loading: S.loading, lastSaved: S.lastSaved, updateProduct: () => {}, undo: () => {}, redo: () => {} }),
}));
vi.mock('../hooks/useAiConnectivity', () => ({
  useAiConnectivity: () => ({ sessionState: S.session, startSession: () => Promise.resolve(false), stopSession: () => {}, changePermissions: () => {}, dismissNotice: () => {} }),
}));
vi.mock('../lib/firebase', async orig => ({ ...(await orig<object>()), get isFirebaseAvailable() { return S.firebase; } }));
const drv = vi.hoisted(() => ({
  onSaveError: (cb: () => void) => { S.saveError = cb; return () => { S.saveError = null; }; },
  loadPreferences: () => Promise.resolve({}),
}));
vi.mock('../lib/StorageProvider', () => ({ useStorage: () => ({ driver: drv, mode: S.mode, storageReady: true }) }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, firebaseAvailable: false }) }));

import AppShell from '../components/layout/AppShell';
import ProductLayout from '../components/layout/ProductLayout';
import { reportGuardedLoad, dismissGuardedLoad } from '../lib/cloudLoadNotices';
import { req } from './testHelpers';

const NAME = 'A product whose name runs on and on, far past the width of any heading row the frame could give it';
const FRAME = readFileSync(resolve(__dirname, '../styles/spert-frame.css'), 'utf8');

beforeEach(() => {
  localStorage.clear();
  Object.assign(S, { product: { id: 'p1', name: NAME }, loading: false, lastSaved: null, mode: 'local', firebase: true });
  S.session = { sessionActive: false, aiConnected: false, boundProductId: null };
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
});

afterEach(() => {
  cleanup();
  dismissGuardedLoad('p1');
  vi.unstubAllGlobals();
});

async function open() {
  render(
    <MemoryRouter initialEntries={['/product/p1/structure']}>
      <Routes>
        <Route element={<AppShell />}>
          <Route path="/" element={<p>Products page</p>} />
          <Route path="/product/:productId" element={<ProductLayout />}>
            <Route path="structure" element={<p>Structure page</p>} />
          </Route>
        </Route>
      </Routes>
    </MemoryRouter>,
  );
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  const h1 = req(document.querySelector<HTMLElement>('h1'), 'h1');
  return { h1, row: req(h1.parentElement, 'heading row'), main: req(document.querySelector<HTMLElement>('main'), 'main') };
}

// ---- the frame's muted colour, from the vendored stylesheet ----
const lin = (c: number) => { const s = c / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; };
const lum = (h: string) => { const [r, g, b] = [1, 3, 5].map(i => lin(Number.parseInt(h.slice(i, i + 2), 16))) as [number, number, number]; return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)]; return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
function token(theme: 'light' | 'dark', name: string) {
  const at = FRAME.indexOf(theme === 'light' ? '\n:root {' : '\n:root.dark, :root[data-theme="dark"] {');
  return req(new RegExp(`--${name}:\\s*(#[0-9a-f]{6})`).exec(FRAME.slice(at, FRAME.indexOf('}', at)))?.[1], name);
}

describe('the product\'s heading row (contract §7)', () => {
  it('the name is the h1, in the heading row, with the full name in title', async () => {
    const { h1, row } = await open();
    expect(h1.textContent).toBe(NAME);
    expect(h1.getAttribute('title')).toBe(NAME);
    expect(h1.className).toBe('sf-heading');
    expect(row.getAttribute('data-sf')).toBe('headrow');
    expect(document.querySelectorAll('h1')).toHaveLength(1);
  });

  it('Connect AI is the toolbar\'s one button, `.sf-btn`, "Connect AI" with no session', async () => {
    const { row } = await open();
    const toolbar = req(row.querySelector<HTMLElement>('[data-sf="toolbar"]'), 'toolbar');
    const buttons = Array.from(toolbar.children);
    expect(buttons).toHaveLength(1);
    const b = req(buttons[0], 'Connect AI');
    expect(b.textContent).toBe('Connect AI');
    expect(b.getAttribute('title')).toBe('Connect an AI assistant');
    expect(b.className.split(/\s+/)).toContain('sf-btn');
  });

  it('with a session it reads "AI", with its dot, and says the session is active', async () => {
    S.session = { sessionActive: true, aiConnected: true, boundProductId: 'p1' };
    const { row } = await open();
    const b = req(row.querySelector<HTMLElement>('[data-sf="toolbar"] button'), 'AI');
    expect(b.textContent).toBe('AI');
    expect(b.getAttribute('title')).toBe('AI session active');
    expect(b.querySelector('span')?.className).toContain('animate-pulse');
    expect(b.className.split(/\s+/)).toContain('sf-btn');
  });

  it('without Firebase there is no Connect AI and so no toolbar', async () => {
    S.firebase = false;
    const { row } = await open();
    expect(row.querySelector('[data-sf="toolbar"]')).toBeNull();
  });

  it('Saved sits just left of the toolbar, outside it, at 12 px in the frame\'s muted colour (D10)', async () => {
    S.lastSaved = new Date();
    const { row } = await open();
    const saved = req(Array.from(row.children).find(c => /^Saved /.test(c.textContent ?? '')) ?? null, 'Saved');
    const toolbar = req(row.querySelector('[data-sf="toolbar"]'), 'toolbar');
    expect(toolbar.contains(saved)).toBe(false);
    expect(saved.nextElementSibling).toBe(toolbar);
    expect(saved.className.split(/\s+/)).toEqual(expect.arrayContaining(['text-xs', 'text-[color:var(--sf-text-muted)]']));
    expect(contrast(token('light', 'sf-text-muted'), token('light', 'sf-page'))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token('dark', 'sf-text-muted'), token('dark', 'sf-page'))).toBeGreaterThanOrEqual(4.5);
  });

  it('while the product loads: the frame stays, the heading row reads "Product", the body "Loading..."', async () => {
    S.loading = true;
    S.product = null;
    const { h1, main } = await open();
    expect(h1.textContent).toBe('Product');
    expect(within(main).getByText('Loading...')).toBeTruthy();
    expect(document.querySelector('[data-sf="nav"]')).toBeTruthy();
    expect(within(req(document.querySelector<HTMLElement>('[data-sf="nav-work"]'), 'work')).getAllByRole('link')).toHaveLength(8);
  });

  it('a product that cannot be found (cloud): the frame stays, "Product", and the way back', async () => {
    S.product = null;
    S.mode = 'cloud';
    const { h1, main } = await open();
    expect(h1.textContent).toBe('Product');
    expect(within(main).getByText('Product not found')).toBeTruthy();
    expect(within(main).getByRole('link', { name: 'Back to Products' }).getAttribute('href')).toBe('/');
  });

  it('the product\'s notices sit below its heading row, in main, never in the frame\'s notices slot', async () => {
    reportGuardedLoad('p1', ['releases'], true);
    const { row, main } = await open();
    await act(async () => { S.saveError?.(); });
    const error = req(main.querySelector<HTMLElement>('.sf-notice--error'), 'the save error');
    const left = req(main.querySelector<HTMLElement>('.sf-notice--caution'), 'the left-out notice');
    const view = screen.getByText('Structure page');
    for (const n of [error, left]) {
      expect(n.className.split(/\s+/)).toContain('sf-below');
      expect(row.compareDocumentPosition(n) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
      expect(n.compareDocumentPosition(view) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
    expect(req(document.querySelector('[data-sf="notices"]'), 'slot').querySelector('.sf-notice--error, [role="status"]')).toBeNull();
  });
});
