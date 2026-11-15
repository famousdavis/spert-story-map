// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
//
// v0.55.16: a Terms sign-out says why, on any page (R80's words), until Dismiss or the next
// sign-in; it lives in memory, so a reload clears it (R81). The page has already rendered when the
// sign-out happens, so the banner must follow the notice, not read it once. The footer always says
// "Terms of Service", so these tests match the whole sentence. Real App, AuthProvider,
// StorageProvider, signOutCleanup and local driver; only Firebase is replaced.

import { describe, it, expect, beforeAll, beforeEach, afterEach, vi } from 'vitest';
import { act, cleanup, fireEvent, screen, within } from '@testing-library/react';
import type { FirebaseStub } from './fixtures/termsSignOutFirebase';

const S = vi.hoisted(() => ({}) as FirebaseStub);
vi.mock('firebase/auth', async () => (await import('./fixtures/termsSignOutFirebase')).authModule(S));
vi.mock('firebase/firestore', async () => (await import('./fixtures/termsSignOutFirebase')).firestoreModule(S));
vi.mock('../lib/firebase', async () => (await import('./fixtures/termsSignOutFirebase')).firebaseModule);
vi.mock('../lib/callables', async () => (await import('./fixtures/termsSignOutFirebase')).callablesModule);

import { emit, resetStub } from './fixtures/termsSignOutFirebase';
import {
  NOTICE, OLD_EDITION, TOS_KEY, load, seed, settle, user, warmUp, type Seeded,
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
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const notice = () => screen.queryByText(NOTICE);

/** A load with an out-of-date acceptance; returns once the sign-out has run. */
async function termsSignOut(uid: string, at: (ids: Seeded) => string = () => '/') {
  const ids = await seed(uid, 'local', OLD_EDITION);
  S.record = OLD_EDITION;
  S.current = user(uid);
  await load(S, at(ids));
  await settle(S);
  expect(S.current).toBeNull();
}

describe('the Terms sign-out notice', { timeout: 20_000 }, () => {
  it('is shown on the dashboard, in the exact words', async () => {
    await termsSignOut('n1');

    expect(notice()).not.toBeNull();
  });

  it('is shown on a product page', async () => {
    await termsSignOut('n2', ids => `/product/${ids.localId}/structure`);

    expect(screen.getAllByText('Signed-out Alpha').length).toBeGreaterThan(0);
    expect(notice()).not.toBeNull();
  });

  it('is shown when the sign-out itself fails, twice', async () => {
    await seed('n3', 'local', OLD_EDITION);
    S.record = OLD_EDITION;
    S.current = user('n3');
    S.signOutRejects = 2;
    await load(S);
    await settle(S);

    expect(S.log.filter(e => e === 'signOut')).toHaveLength(2);
    expect(errors.some(e => e.includes('Failed to check ToS acceptance'))).toBe(true);
    expect(notice()).not.toBeNull();
  });

  it('goes when dismissed', async () => {
    await termsSignOut('n4');
    const banner = notice()?.closest('[role="alert"]');
    if (!(banner instanceof HTMLElement)) throw new Error('no banner around the notice');

    fireEvent.click(within(banner).getByRole('button', { name: 'Dismiss' }));

    expect(notice()).toBeNull();
  });

  it('goes at the next sign-in', async () => {
    await termsSignOut('n5');
    expect(notice()).not.toBeNull();
    localStorage.setItem(TOS_KEY, TOS_VERSION); // what the consent dialog does before the sign-in
    S.record = TOS_VERSION;

    await act(async () => { emit(S, user('n5')); });
    await settle(S);

    expect(screen.getByRole('button', { name: /Signed in as/ })).not.toBeNull();
    expect(notice()).toBeNull();
  });

  it('goes at a reload', async () => {
    await termsSignOut('n6');
    expect(notice()).not.toBeNull();

    vi.resetModules();
    await load(S);
    await settle(S);

    expect(screen.getAllByRole('button', { name: /Sign in/ }).length).toBeGreaterThan(0);
    expect(notice()).toBeNull();
  });

  it('is never shown after the Sign out button', async () => {
    await seed('n7', 'local', TOS_VERSION);
    S.record = TOS_VERSION;
    S.current = user('n7');
    await load(S);
    await settle(S);

    fireEvent.click(screen.getByRole('button', { name: /Signed in as/ }));
    fireEvent.click(await screen.findByRole('button', { name: 'Sign out' }));
    await settle(S);

    expect(S.current).toBeNull();
    expect(notice()).toBeNull();
  });
});
