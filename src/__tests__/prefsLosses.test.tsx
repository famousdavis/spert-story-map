// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.55.14: two settings changes no longer undo each other. Each scenario is a loss measured at
 * v0.55.13 (Char-RB-1), driven through the real `useProjectOrder` and `AppSettingsModal` on the real
 * drivers: the cloud driver over the masked-write stand-in (two drivers on one document = two
 * clients), and the local driver as two module graphs on one localStorage (two tabs). Each has a
 * control: the same steps spaced out, which keeps both settings before and after the fix.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, renderHook, act, fireEvent, cleanup, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import type { Context } from 'react';
import type { StorageDriver } from '../types';

const h = vi.hoisted(() => ({
  fs: null as unknown as ReturnType<typeof import('./fixtures/mergeFieldsFirestore').createMergeFieldsFirestore>,
  ctx: null as unknown as Context<{ driver: StorageDriver } | null>,
}));
vi.mock('../lib/firebase', () => ({ db: {}, auth: null, functionsInstance: null, isFirebaseAvailable: true }));
vi.mock('firebase/firestore', async () => {
  const { createMergeFieldsFirestore } = await import('./fixtures/mergeFieldsFirestore');
  h.fs ??= createMergeFieldsFirestore();
  const f = h.fs;
  return {
    doc: f.doc, getDoc: f.getDoc, setDoc: f.setDoc, deleteField: f.deleteField, FieldPath: f.FieldPath,
    getDocs: f.getDocs, getDocFromServer: f.getDocFromServer, getDocsFromServer: f.getDocsFromServer,
    collection: f.collection, query: f.query, where: f.where,
  };
});
vi.mock('../lib/StorageProvider', async () => {
  const React = await import('react');
  h.ctx ??= React.createContext<{ driver: StorageDriver } | null>(null);
  return { useStorage: () => ({ ...React.useContext(h.ctx), mode: 'local', isCloudAvailable: false, storageReady: true }) };
});
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: null, loading: false, firebaseAvailable: false }) }));
vi.mock('../hooks/useSignInWithTosGate', () => ({ useSignInWithTosGate: () => ({}) }));

import AppSettingsModal from '../components/settings/AppSettingsModal';
import { useProjectOrder } from '../hooks/useProjectOrder';

const SEED = { exportName: 'Jane', exportId: 'J1', projectOrder: ['p1', 'p2', 'p3'] };
const PRODUCTS = ['p1', 'p2', 'p3'].map(id => ({ id, name: id }));
const wait = (ms: number) => act(() => new Promise(r => setTimeout(r, ms)));

type Kind = 'cloud' | 'local';
async function makeDriver(kind: Kind): Promise<StorageDriver> {
  vi.resetModules();
  const m = await import('../lib/storageDriver');
  return kind === 'cloud' ? m.createFirestoreDriver('u') : m.createLocalStorageDriver();
}
function stored(kind: Kind): Record<string, unknown> {
  if (kind === 'cloud') return h.fs.docs.get('spertstorymap_settings/u') ?? {};
  return JSON.parse(localStorage.getItem('rp:local:preferences') ?? '{}');
}
function seed(kind: Kind) {
  if (kind === 'cloud') h.fs.docs.set('spertstorymap_settings/u', structuredClone(SEED));
  else localStorage.setItem('rp:local:preferences', JSON.stringify(SEED));
}

/** One open settings dialog on `driver`; `type` changes the export name. */
async function openDialog(driver: StorageDriver) {
  const view = render(
    <MemoryRouter><h.ctx.Provider value={{ driver }}><AppSettingsModal open onClose={() => {}} /></h.ctx.Provider></MemoryRouter>,
  );
  await wait(0);
  const inputs = screen.getAllByRole('textbox', { name: 'Name' });
  const input = inputs[inputs.length - 1]!;
  return { type: (v: string) => act(() => { fireEvent.change(input, { target: { value: v } }); }), view };
}
/** One Products page's order on `driver`; `drop` moves p3 onto p1. */
async function openOrder(driver: StorageDriver) {
  const hook = renderHook(() => useProjectOrder(driver, PRODUCTS));
  await wait(0);
  act(() => { hook.result.current.listed(PRODUCTS, hook.result.current.refreshStarted()); });
  return { drop: () => act(() => { hook.result.current.moveOnto('p3', 'p1'); }) };
}

const NEW_ORDER = ['p3', 'p1', 'p2'];

beforeEach(() => { h.fs?.reset(); localStorage.clear(); });
afterEach(() => { cleanup(); });

describe.each<Kind>(['cloud', 'local'])('%s: two settings changes keep each other', kind => {
  it.each([false, true])('a dialog left open, another tab reorders, then a keystroke: order kept (control=%s)', async control => {
    seed(kind);
    const A = await makeDriver(kind);
    const B = await makeDriver(kind);
    const dialog = control ? null : await openDialog(B);
    const order = await openOrder(A);
    await order.drop();
    await wait(300);
    const d = dialog ?? await openDialog(B);
    await d.type('Jane D');
    await wait(300);
    expect(stored(kind)).toMatchObject({ projectOrder: NEW_ORDER, exportName: 'Jane D', exportId: 'J1' });
  });

  it.each([false, true])('one tab: a keystroke, then a drop within the debounce: name kept (control=%s)', async control => {
    seed(kind);
    const A = await makeDriver(kind);
    const order = await openOrder(A);
    const dialog = await openDialog(A);
    await dialog.type('Jane D');
    if (control) await wait(300);
    await order.drop();
    await wait(300);
    expect(stored(kind)).toMatchObject({ projectOrder: NEW_ORDER, exportName: 'Jane D', exportId: 'J1' });
  });

  it.each([false, true])('one tab: a drop, then the dialog opened within the debounce and a keystroke: order kept (control=%s)', async control => {
    seed(kind);
    const A = await makeDriver(kind);
    const order = await openOrder(A);
    await order.drop();
    if (control) await wait(300);
    const dialog = await openDialog(A);
    await dialog.type('Jane D');
    await wait(300);
    expect(stored(kind)).toMatchObject({ projectOrder: NEW_ORDER, exportName: 'Jane D', exportId: 'J1' });
  });

  it.each([false, true])('two clients change different settings at the same moment: both kept (control=%s)', async control => {
    seed(kind);
    const A = await makeDriver(kind);
    const B = await makeDriver(kind);
    const dialog = await openDialog(A);
    const order = await openOrder(B);
    await dialog.type('Jane D');
    if (control) { await wait(300); cleanup(); }
    const o = control ? await openOrder(B) : order;
    await o.drop();
    await wait(300);
    expect(stored(kind)).toMatchObject({ projectOrder: NEW_ORDER, exportName: 'Jane D', exportId: 'J1' });
  });
});

describe('cloud: a first settings read made offline', () => {
  it.each([false, true])('a drop then keeps the export name and identifier (online control=%s)', async control => {
    seed('cloud');
    const A = await makeDriver('cloud');
    h.fs.setOffline(!control);
    const order = await openOrder(A);
    await order.drop(); // the tab is still offline: a drop's own read fails too; the SDK queues the write
    await wait(300);
    h.fs.setOffline(false);
    expect(stored('cloud')).toMatchObject({ exportName: 'Jane', exportId: 'J1' });
    expect((stored('cloud').projectOrder as string[])[0]).toBe('p3');
  });

  it('a keystroke then keeps the tile order', async () => {
    seed('cloud');
    const A = await makeDriver('cloud');
    h.fs.setOffline(true);
    const dialog = await openDialog(A);
    h.fs.setOffline(false);
    await dialog.type('Jane D');
    await wait(300);
    expect(stored('cloud')).toMatchObject({ exportName: 'Jane D', exportId: 'J1', projectOrder: SEED.projectOrder });
  });
});
