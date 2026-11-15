// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
//
// v0.56.1 (R71): one Local store per browser. Products live in rp:local signed in or not, sign-out
// deletes none of them, and a signed-in person's products kept by an earlier version in rp:{uid} are
// folded into rp:local at sign-in. The real App, AuthProvider, StorageProvider, signOutCleanup and
// local driver; only Firebase is replaced (fixtures/termsSignOutFirebase.ts). Each test is a fresh page.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import type { FirebaseStub } from './fixtures/termsSignOutFirebase';
import type { Product, StorageDriver } from '../types';

const S = vi.hoisted(() => ({}) as FirebaseStub);
vi.mock('firebase/auth', async () => (await import('./fixtures/termsSignOutFirebase')).authModule(S));
vi.mock('firebase/firestore', async () => (await import('./fixtures/termsSignOutFirebase')).firestoreModule(S));
vi.mock('../lib/firebase', async () => (await import('./fixtures/termsSignOutFirebase')).firebaseModule);
vi.mock('../lib/callables', async () => (await import('./fixtures/termsSignOutFirebase')).callablesModule);

import { resetStub, emit } from './fixtures/termsSignOutFirebase';
import { OLD_EDITION, fresh, keepIn, load, names, settle, until, user, warmUp } from './fixtures/termsSignOutPage';
import { TOS_VERSION } from '../lib/tosConstants';

const MOVED_ONE = 'One product you made while signed in was moved into this browser’s Local storage. Anyone who uses this browser can now see it.';
const STOPPED = 'Some products could not be moved because this browser’s storage is full. They are kept, but not shown, until there is room: export or delete products you no longer need, then reload the page.';
const UNREADABLE_ONE = 'One product could not be read, so it was set aside in this browser’s storage, unchanged, and is not shown.';
const LOCAL_LINE = 'Products on this page are kept in this browser, not in your cloud account. Anyone who uses this browser can see them.';

beforeAll(warmUp, 60_000);
beforeEach(() => {
  resetStub(S);
  vi.resetModules();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

async function listed(page: { driver: () => StorageDriver | null }): Promise<string[]> {
  const d = page.driver();
  if (!d) throw new Error('no driver');
  return (await d.loadProductIndex()).map(p => p.name).sort();
}

async function signOutByButton(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: /Signed in as/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
  await settle(S);
}

const prefsOf = (ns: string) => JSON.parse(localStorage.getItem(`rp:${ns}:preferences`) ?? 'null') as Record<string, unknown> | null;

describe('one Local store per browser', { timeout: 20_000 }, () => {
  it('the must-find: signed in with Local, create, Sign out, sign in again: it is there, and signed out too', async () => {
    fresh('local', TOS_VERSION);
    S.record = TOS_VERSION;
    S.current = user('u1');
    const page = await load(S);
    await settle(S);
    const { createNewProduct } = await import('../lib/storage');
    await page.driver()?.createProduct(createNewProduct('Mine'));
    expect(await listed(page)).toEqual(['Mine']);

    await signOutByButton();
    expect(S.current).toBeNull();
    const signedOut = await listed(page);
    emit(S, user('u1'));
    await settle(S);
    expect({ signedOut, again: await listed(page) }).toEqual({ signedOut: ['Mine'], again: ['Mine'] });
  });

  it('Sign out keeps an edit still waiting to be saved, removes only the export name and identifier from storage, and keeps the rest', async () => {
    fresh('local', TOS_VERSION);
    localStorage.setItem('rp:u2:preferences', JSON.stringify({ exportName: 'Ben', exportId: 'B-1', projectOrder: ['x'], suppressLocalStorageWarning: true }));
    localStorage.setItem('rp:local:preferences', JSON.stringify({ exportName: 'Signed-out Ana', exportId: 'A-1' }));
    const other = await keepIn('u-other', 'Someone else’s');
    S.record = TOS_VERSION;
    S.current = user('u2');
    const page = await load(S);
    await settle(S);
    const driver = page.driver();
    if (!driver) throw new Error('no driver');
    const { createNewProduct } = await import('../lib/storage');
    const p = createNewProduct('Mine');
    await driver.createProduct(p);
    fireEvent.click(screen.getByRole('button', { name: /Signed in as/ }));
    const out = await screen.findByRole('button', { name: 'Sign out' });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // hold the 200 ms save: only the sign-out can write it
    await driver.saveProduct({ ...p, description: 'typed just before Sign out' });
    fireEvent.click(out);
    await settle(S);

    const stored = JSON.parse(localStorage.getItem(`rp:local:product_${p.id}`) ?? 'null') as Product | null;
    expect(stored?.description).toBe('typed just before Sign out');
    // Read from storage itself, not only through loadPreferences(), which lays pending entries on top.
    expect(prefsOf('u2')).toEqual({ projectOrder: ['x'], suppressLocalStorageWarning: true });
    const { loadPreferences } = await import('../lib/storage');
    expect(loadPreferences('u2')).toEqual({ projectOrder: ['x'], suppressLocalStorageWarning: true });
    expect(prefsOf('local')).toEqual({ exportName: 'Signed-out Ana', exportId: 'A-1' });
    expect(localStorage.getItem(`rp:u-other:product_${other.id}`)).not.toBeNull();
  });

  it('an export name still waiting to be saved at Sign out is not written back after the export identity is removed (review -05, K31)', async () => {
    fresh('local', TOS_VERSION);
    localStorage.setItem('rp:u11:preferences', JSON.stringify({ projectOrder: ['x'] }));
    S.record = TOS_VERSION;
    S.current = user('u11');
    const page = await load(S);
    await settle(S);
    fireEvent.click(screen.getByRole('button', { name: /Signed in as/ }));
    const out = await screen.findByRole('button', { name: 'Sign out' });

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] }); // hold the 200 ms settings write: only the sign-out can write it
    await page.driver()?.writePreferences([{ path: ['exportName'], value: 'Typed just before Sign out' }]);
    expect(prefsOf('u11')).toEqual({ projectOrder: ['x'] }); // pending, not yet stored
    fireEvent.click(out);
    await settle(S);

    expect(S.current).toBeNull();
    expect(prefsOf('u11')).toEqual({ projectOrder: ['x'] });
    const { loadPreferences } = await import('../lib/storage');
    expect(loadPreferences('u11')).toEqual({ projectOrder: ['x'] });
  });

  it('a Terms sign-out does not fold: the person’s rp:{uid} products stay where they were', async () => {
    fresh('local', OLD_EDITION);
    const kept = await keepIn('u3', 'Made signed in');
    S.record = OLD_EDITION;
    S.current = user('u3');
    await load(S);
    await settle(S);
    expect(S.current).toBeNull();
    expect(localStorage.getItem(`rp:u3:product_${kept.id}`)).not.toBeNull();
    expect(names('local')).toEqual([]);
  });

  it('a signed-in person’s products kept by an earlier version are moved into rp:local at sign-in, with a notice until Dismiss', async () => {
    fresh('local', TOS_VERSION);
    const kept = await keepIn('u4', 'Made signed in');
    await keepIn('local', 'Signed-out work');
    S.record = TOS_VERSION;
    S.current = user('u4');
    const page = await load(S);
    await settle(S);
    await until(() => screen.queryByText(MOVED_ONE) !== null, 'the notice');
    expect(await listed(page)).toEqual(['Made signed in', 'Signed-out work']);
    expect(localStorage.getItem(`rp:u4:product_${kept.id}`)).toBeNull();
    expect(localStorage.getItem(`rp:local:product_${kept.id}`)).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(screen.queryByText(MOVED_ONE)).toBeNull();
  });

  it('a product the fold cannot read is reported once: after Dismiss and a reload the notice does not come back', async () => {
    fresh('local', TOS_VERSION);
    localStorage.setItem('rp:u10:product_bad', '{not json');
    S.record = TOS_VERSION;
    S.current = user('u10');
    await load(S);
    await settle(S);
    await until(() => screen.queryByText(UNREADABLE_ONE) !== null, 'the notice');
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));

    vi.resetModules(); // a reload
    await load(S);
    await settle(S);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(screen.queryByText(UNREADABLE_ONE)).toBeNull();
    expect(localStorage.getItem('rp:u10:unreadable_product_bad')).toBe('{not json');
  });

  it('a fold whose write fails: the app still renders, the notice says so, and the product stays in rp:{uid}', async () => {
    fresh('local', TOS_VERSION);
    const kept = await keepIn('u5', 'Made signed in');
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith('rp:local:product_')) throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, k, v);
    });
    S.record = TOS_VERSION;
    S.current = user('u5');
    await load(S);
    await settle(S);
    await until(() => screen.queryByText(STOPPED) !== null, 'the notice');
    expect(screen.getByRole('button', { name: /Signed in as/ })).toBeTruthy();
    expect(localStorage.getItem(`rp:u5:product_${kept.id}`)).not.toBeNull();
  });

  it('PF-08 in the steady state: a signed-in Local person’s product page stays open while the Terms check waits', async () => {
    fresh('local', TOS_VERSION);
    const p = await keepIn('local', 'Stay Here');
    S.record = TOS_VERSION;
    S.current = user('u6');
    S.profileGate = new Promise<void>(() => {}); // the check never finishes here
    await load(S, `/product/${p.id}`);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(screen.queryByText('Stay Here')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Export all products as JSON' })).toBeNull();
  });

  it('PF-08 in the steady state, for a product the app made while signed in: reloading its page while the Terms check waits keeps it open', async () => {
    fresh('local', TOS_VERSION);
    S.record = TOS_VERSION;
    S.current = user('u8');
    const first = await load(S);
    await settle(S);
    const { createNewProduct } = await import('../lib/storage');
    const p = createNewProduct('Made Here');
    await first.driver()?.createProduct(p);

    vi.resetModules(); // a reload: the same browser storage, a fresh page
    S.profileGate = new Promise<void>(() => {}); // the check never finishes here
    await load(S, `/product/${p.id}`);
    await act(async () => { await new Promise(r => setTimeout(r, 300)); });
    expect(screen.queryByText('Made Here')).not.toBeNull();
    expect(screen.queryByRole('button', { name: 'Export all products as JSON' })).toBeNull();
  });

  it('the Products page says, while signed in with Local storage, that its products are kept in this browser', async () => {
    fresh('local', TOS_VERSION);
    await keepIn('local', 'Here');
    S.record = TOS_VERSION;
    S.current = user('u7');
    await load(S);
    await settle(S);
    await until(() => screen.queryByText(LOCAL_LINE) !== null, 'the line');
    await signOutByButton();
    expect(screen.queryByText(LOCAL_LINE)).toBeNull();
  });

  it('Export All in Local mode asks first, naming the export name and identifier it stamps', async () => {
    fresh('local', null);
    await keepIn('local', 'One');
    await keepIn('local', 'Two');
    localStorage.setItem('rp:local:preferences', JSON.stringify({ exportName: 'Ana', exportId: 'A-1' }));
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() }));
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await load(S);
    await settle(S);
    fireEvent.click(await screen.findByRole('button', { name: 'Export all products as JSON' }));
    const message = 'The file will hold all 2 products stored in this browser, including any made by other people who use it. Each will be stamped with the export name “Ana” and the identifier “A-1”.';
    await until(() => screen.queryByText(message) !== null, 'the confirm');
    expect(click).not.toHaveBeenCalled();
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Export All' })); });
    await until(() => click.mock.calls.length === 1, 'the download');
  });
});
