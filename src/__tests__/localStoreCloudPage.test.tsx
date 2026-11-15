// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
//
// v0.56.1 (R71): the Products page with Cloud storage, while this browser's one Local store holds
// products. The real App, AuthProvider, StorageProvider and drivers; only Firebase is replaced
// (fixtures/termsSignOutFirebase.ts, whose members query returns the stub's `cloud` documents).

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { FirebaseStub } from './fixtures/termsSignOutFirebase';

const S = vi.hoisted(() => ({}) as FirebaseStub);
vi.mock('firebase/auth', async () => (await import('./fixtures/termsSignOutFirebase')).authModule(S));
vi.mock('firebase/firestore', async () => (await import('./fixtures/termsSignOutFirebase')).firestoreModule(S));
vi.mock('../lib/firebase', async () => (await import('./fixtures/termsSignOutFirebase')).firebaseModule);
vi.mock('../lib/callables', async () => (await import('./fixtures/termsSignOutFirebase')).callablesModule);

import { resetStub } from './fixtures/termsSignOutFirebase';
import { fresh, keepIn, load, settle, until, user, warmUp } from './fixtures/termsSignOutPage';
import { TOS_VERSION } from '../lib/tosConstants';

beforeAll(warmUp, 60_000);
beforeEach(() => {
  resetStub(S);
  vi.resetModules();
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

/** Signed in with Cloud storage and an empty cloud, this browser's Local store holding these products. */
async function cloudPage(uid: string, local: string[]): Promise<void> {
  fresh('cloud', TOS_VERSION);
  for (const name of local) await keepIn('local', name);
  S.record = TOS_VERSION;
  S.current = user(uid);
  await load(S);
  await settle(S);
}

describe('Cloud storage with products in this browser', { timeout: 20_000 }, () => {
  it.each([
    [1, 'This browser’s Local storage holds 1 product, which may be someone else’s.'],
    [2, 'This browser’s Local storage holds 2 products, which may include other people’s.'],
  ])('an empty cloud with %i Local product(s): the warning says they may be other people’s and where to upload yours', async (n, held) => {
    await cloudPage(`c${n}`, ['Ana’s lab', 'Mine'].slice(0, n));
    const words = `Your cloud account has no products. ${held} To upload any that are yours, go to App Settings → Storage, choose Local, then choose Cloud again and tick only your own.`;
    await until(() => screen.queryByText(words) !== null, 'the warning');
  });

  it('following the warning’s words lists this browser’s products, none ticked', async () => {
    await cloudPage('c3', ['Ana’s lab', 'Mine']);
    await until(() => screen.queryByText(/^Your cloud account has no products\./) !== null, 'the warning');
    fireEvent.click(screen.getByTitle('App Settings'));
    fireEvent.click(await screen.findByRole('radio', { name: 'Local (browser only)' }));
    await settle(S);
    fireEvent.click(await screen.findByRole('radio', { name: 'Cloud (sync across devices)' }));
    const dialog = await screen.findByRole('form', { name: 'Upload Local Products' });
    const boxes = ['Ana’s lab', 'Mine'].map(name => within(dialog).getByRole('checkbox', { name: new RegExp(`^${name}`) }) as HTMLInputElement);
    expect(boxes.map(b => b.checked)).toEqual([false, false]);
  });
});
