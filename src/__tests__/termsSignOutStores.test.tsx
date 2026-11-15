// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
//
// v0.55.16: when Story Map signs a person out because the Terms of Service changed or could not
// be checked, it no longer deletes what this browser keeps. That sign-out runs before the app has
// followed the person to their own storage, so the active namespace is still 'local' (this
// browser's signed-out store); until v0.55.16 the cleanup cleared it. These tests run the real
// App, AuthProvider, StorageProvider, signOutCleanup and local driver; only Firebase is replaced
// (fixtures/termsSignOutFirebase.ts). Each test is a fresh page.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import type { FirebaseStub } from './fixtures/termsSignOutFirebase';

const S = vi.hoisted(() => ({}) as FirebaseStub);
vi.mock('firebase/auth', async () => (await import('./fixtures/termsSignOutFirebase')).authModule(S));
vi.mock('firebase/firestore', async () => (await import('./fixtures/termsSignOutFirebase')).firestoreModule(S));
vi.mock('../lib/firebase', async () => (await import('./fixtures/termsSignOutFirebase')).firebaseModule);
vi.mock('../lib/callables', async () => (await import('./fixtures/termsSignOutFirebase')).callablesModule);

import { resetStub } from './fixtures/termsSignOutFirebase';
import {
  OLD_EDITION, TOS_KEY, exportName, load, names, productName, seed, settle, until, user, warmUp,
} from './fixtures/termsSignOutPage';
import { TOS_VERSION } from '../lib/tosConstants';

let errors: string[] = [];

beforeAll(warmUp, 60_000);

beforeEach(() => {
  resetStub(S);
  vi.resetModules();
  errors = [];
  vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { errors.push(a.map(String).join(' ')); });
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const failedCheckLogged = () => errors.some(e => e.includes('Failed to check ToS acceptance'));

function expectBothStoresKept(uid: string) {
  expect(names('local')).toEqual(['Signed-out Alpha', 'Signed-out Beta']);
  expect(exportName('local')).toBe('Signed-out person');
  expect(names(uid)).toEqual(['Made signed in']);
  expect(exportName(uid)).toBe('Signed-in person');
}

describe('a Terms sign-out keeps what this browser keeps', { timeout: 20_000 }, () => {
  it.each(['local', 'cloud'] as const)('an out-of-date acceptance (%s storage): signed out, both stores kept', async mode => {
    await seed('u1', mode, OLD_EDITION);
    S.record = OLD_EDITION;
    S.current = user('u1');

    await load(S);
    await settle(S);

    expect(S.log).toContain('signOut');
    expect(S.current).toBeNull();
    expectBothStoresKept('u1');
    expect(failedCheckLogged()).toBe(false);
  });

  it('a Terms read that fails: signed out through the same branch, both stores kept', async () => {
    await seed('u2', 'local', OLD_EDITION);
    S.readFails = true;
    S.record = TOS_VERSION;
    S.current = user('u2');

    await load(S);
    await settle(S);

    expect(S.log).toContain('read users/u2');
    expect(S.current).toBeNull();
    expectBothStoresKept('u2');
    expect(failedCheckLogged()).toBe(false);
  });

  it('an accepted read whose caching throws (the catch branch): signed out, both stores kept, the failure logged', async () => {
    await seed('u3', 'local', null);
    S.record = TOS_VERSION;
    S.current = user('u3');
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k === TOS_KEY) throw new DOMException('full', 'QuotaExceededError');
      return setItem.call(this, k, v);
    });

    await load(S);
    await settle(S);

    expect(S.current).toBeNull();
    expectBothStoresKept('u3');
    expect(failedCheckLogged()).toBe(true);
  });

  it('the Sign out button still clears the signed-in store and keeps the signed-out one', async () => {
    await seed('u4', 'local', TOS_VERSION);
    S.record = TOS_VERSION;
    S.current = user('u4');
    await load(S);
    await settle(S);
    const pill = screen.getByRole('button', { name: /Signed in as/ });

    fireEvent.click(pill);
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await settle(S);

    expect(S.current).toBeNull();
    expect(names('u4')).toEqual([]);
    expect(exportName('u4')).toBeNull();
    expect(names('local')).toEqual(['Signed-out Alpha', 'Signed-out Beta']);
    expect(exportName('local')).toBe('Signed-out person');
  });

  it.each(['local', 'cloud'] as const)('an edit still waiting to be saved when the sign-out arrives is saved (%s storage)', async mode => {
    const ids = await seed('u5', mode, OLD_EDITION);
    S.record = OLD_EDITION;
    S.current = user('u5');
    let release = () => {};
    S.profileGate = new Promise<void>(r => { release = r; }); // offline at load: the check waits
    const page = await load(S);
    await until(() => page.driver() !== null, 'the driver while the Terms check waits');
    const driver = page.driver();
    if (!driver) throw new Error('no driver while the Terms check waits');
    expect(driver.mode).toBe('local');
    const storage = await import('../lib/storage');
    const product = storage.loadProduct(ids.localId);
    if (!product) throw new Error('seeded product missing');

    // Hold the 200 ms save timer, so only the sign-out can write the edit.
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    await driver.saveProduct({ ...product, name: 'Signed-out Alpha (edited)' });
    expect(productName('local', ids.localId)).toBe('Signed-out Alpha');
    release();
    await settle(S);

    expect(S.current).toBeNull();
    expect(productName('local', ids.localId)).toBe('Signed-out Alpha (edited)');
    expect(S.log.slice(S.log.indexOf('signOut')).some(e => e.startsWith('setDoc'))).toBe(false);
  });
});
