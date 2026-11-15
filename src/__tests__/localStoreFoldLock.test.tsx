// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
//
// v0.56.1 (R71 R-3): the fold at sign-in, while it waits for its Web Lock. A stand-in for
// navigator.locks holds the lock until the test releases it, so what StorageProvider does in the
// meantime can be seen (without it the fold runs at once and the order cannot be told apart). The real
// App, AuthProvider, StorageProvider and drivers; only Firebase is replaced (fixtures/termsSignOutFirebase.ts).

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, screen } from '@testing-library/react';
import type { FirebaseStub } from './fixtures/termsSignOutFirebase';

const S = vi.hoisted(() => ({}) as FirebaseStub);
vi.mock('firebase/auth', async () => (await import('./fixtures/termsSignOutFirebase')).authModule(S));
vi.mock('firebase/firestore', async () => (await import('./fixtures/termsSignOutFirebase')).firestoreModule(S));
vi.mock('../lib/firebase', async () => (await import('./fixtures/termsSignOutFirebase')).firebaseModule);
vi.mock('../lib/callables', async () => (await import('./fixtures/termsSignOutFirebase')).callablesModule);

import { resetStub } from './fixtures/termsSignOutFirebase';
import { fresh, keepIn, load, settle, until, user, warmUp } from './fixtures/termsSignOutPage';
import { TOS_VERSION } from '../lib/tosConstants';

const MOVED_ONE = 'One product you made while signed in was moved into this browser’s Local storage. Anyone who uses this browser can now see it.';

/** An exclusive navigator.locks stand-in whose grants all wait until `release()`, then run one at a time, in order. */
function heldLocks() {
  let release = () => {};
  const gate = new Promise<void>(r => { release = r; });
  let chain: Promise<unknown> = gate;
  const requests: string[] = [];
  const request = (name: string, ...rest: unknown[]) => {
    const cb = rest[rest.length - 1] as () => unknown;
    requests.push(name);
    const run = chain.then(() => cb());
    chain = run.catch(() => {});
    return run;
  };
  Object.defineProperty(navigator, 'locks', { value: { request }, configurable: true });
  return { release: () => release(), requests };
}

const pause = (ms: number) => act(async () => { await new Promise(r => setTimeout(r, ms)); });

beforeAll(warmUp, 60_000);
beforeEach(() => {
  resetStub(S);
  vi.resetModules();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  cleanup();
  delete (navigator as unknown as Record<string, unknown>).locks;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('the fold at sign-in, waiting for its lock', { timeout: 20_000 }, () => {
  it('the driver for the signed-in person is made only after the fold: its first list holds the moved product (review -05, K15)', async () => {
    fresh('local', TOS_VERSION);
    await keepIn('u20', 'Made signed in');
    await keepIn('local', 'Signed-out work');
    const lock = heldLocks();
    const storage = await import('../lib/storage');
    const made: { ns: string; list: Promise<string[]> }[] = [];
    S.record = TOS_VERSION;
    S.current = user('u20');
    await load(S, '/', d => { made.push({ ns: storage.getActiveNamespace(), list: d.loadProductIndex().then(ps => ps.map(p => p.name).sort()) }); });
    await settle(S);
    await until(() => lock.requests.length === 1, 'the fold to ask for its lock');
    await pause(50); // a driver made now, before the fold, would be seen here
    lock.release();
    await until(() => made.some(m => m.ns === 'u20'), 'a driver for the signed-in person');
    const forPerson = await Promise.all(made.filter(m => m.ns === 'u20').map(m => m.list));
    expect(forPerson[0]).toEqual(['Made signed in', 'Signed-out work']);
  });

  it('a fold whose effect is cancelled while it waits still reports what it moved (review -05, K30)', async () => {
    fresh('local', TOS_VERSION);
    const kept = await keepIn('u21', 'Made signed in');
    const lock = heldLocks();
    S.record = TOS_VERSION;
    S.current = user('u21');
    const page = await load(S);
    await settle(S);
    await until(() => lock.requests.length === 1, 'the fold to ask for its lock');
    await act(async () => { page.switchMode('cloud'); }); // the effect re-runs: the first fold's effect is cancelled
    await until(() => lock.requests.length === 2, 'a second fold');
    lock.release();
    await until(() => screen.queryByText(MOVED_ONE) !== null, 'the notice');
    expect(localStorage.getItem(`rp:local:product_${kept.id}`)).not.toBeNull();
  });
});
