// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
//
// The October 26, 2026 editions of the Terms of Service and Privacy Policy.
// A returning user whose acceptance names the October 5 editions ('10-05-2026')
// must be signed out, so the next sign-in asks them to accept again; a user whose
// acceptance names the October 26 editions ('10-26-2026') must be let through.
// These run the real AuthProvider and tosHelpers; only the Firebase edges and the
// sign-out cleanup are replaced. The version strings are written out on purpose:
// importing TOS_VERSION would make every case pass whatever the constant said.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import type { ReactNode } from 'react';
import { renderHook, act, cleanup } from '@testing-library/react';

const hoisted = vi.hoisted(() => ({
  listener: null as ((user: unknown) => Promise<void>) | null,
  /** The tosVersion on the user's acceptance record, or null when there is no record. */
  onRecord: null as string | null,
  signOutCleanupMock: vi.fn(() => Promise.resolve()),
  setDocMock: vi.fn((..._args: unknown[]) => Promise.resolve()),
}));

vi.mock('firebase/auth', () => ({
  onAuthStateChanged: (_auth: unknown, listener: (user: unknown) => Promise<void>) => {
    hoisted.listener = listener;
    return () => {
      hoisted.listener = null;
    };
  },
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: class {},
  OAuthProvider: class {},
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  getDoc: () => Promise.resolve({
    exists: () => hoisted.onRecord !== null,
    data: () => ({ tosVersion: hoisted.onRecord }),
  }),
  setDoc: hoisted.setDocMock,
  serverTimestamp: () => ({ __ts: true }),
}));

vi.mock('../lib/firebase', () => ({
  auth: { __fake: 'auth' },
  db: { __fake: 'db' },
  isFirebaseAvailable: true,
}));

vi.mock('../lib/callables', () => ({
  callClaimPendingInvitations: vi.fn(() => Promise.reject(new Error('n/a'))),
}));

vi.mock('../lib/signOutCleanup', () => ({ signOutCleanup: hoisted.signOutCleanupMock }));

vi.mock('../lib/aiSessionTeardown', () => ({ endAiSessionForSignOut: vi.fn(() => Promise.resolve()) }));

import { AuthProvider, useAuth } from '../lib/AuthProvider';
import { cacheTosAcceptance } from '../lib/tosHelpers';
import { TOS_ACCEPTED_VERSION_KEY } from '../lib/tosConstants';

const OCTOBER_5 = '10-05-2026';
const OCTOBER_26 = '10-26-2026';

const user = {
  uid: 'terms-uid',
  email: 'u@example.com',
  displayName: 'U',
  photoURL: null,
  emailVerified: true,
  providerData: [{ providerId: 'google.com' }],
};

async function signIn() {
  const wrapper = ({ children }: { children: ReactNode }) => <AuthProvider>{children}</AuthProvider>;
  const auth = renderHook(() => useAuth(), { wrapper }).result;
  await act(async () => {
    await hoisted.listener?.(user);
  });
  return auth;
}

function termsWrites() {
  return hoisted.setDocMock.mock.calls.filter(([ref]) => (ref as { path: string }).path === `users/${user.uid}`);
}

beforeEach(() => {
  localStorage.clear();
  hoisted.onRecord = null;
  hoisted.signOutCleanupMock.mockClear();
  hoisted.setDocMock.mockClear();
});

afterEach(cleanup);

describe('Terms and Privacy Policy 1.4 (October 26, 2026): who is asked to accept again', () => {
  it('a user whose cached acceptance and record name the October 5 editions is signed out, to accept again', async () => {
    localStorage.setItem(TOS_ACCEPTED_VERSION_KEY, OCTOBER_5);
    hoisted.onRecord = OCTOBER_5;

    const auth = await signIn();

    expect(hoisted.signOutCleanupMock).toHaveBeenCalledTimes(1);
    expect(auth.current.user).toBeNull();
    expect(localStorage.getItem(TOS_ACCEPTED_VERSION_KEY)).toBeNull();
  });

  it('a user with no cached acceptance whose record names the October 5 editions is signed out, to accept again', async () => {
    hoisted.onRecord = OCTOBER_5;

    const auth = await signIn();

    expect(hoisted.signOutCleanupMock).toHaveBeenCalledTimes(1);
    expect(auth.current.user).toBeNull();
  });

  it('a user whose cached acceptance and record name the October 26 editions is let through, with nothing rewritten', async () => {
    localStorage.setItem(TOS_ACCEPTED_VERSION_KEY, OCTOBER_26);
    hoisted.onRecord = OCTOBER_26;

    const auth = await signIn();

    expect(hoisted.signOutCleanupMock).not.toHaveBeenCalled();
    expect(auth.current.user?.uid).toBe(user.uid);
    expect(termsWrites()).toHaveLength(0);
  });

  it('a user with no cached acceptance whose record names the October 26 editions is let through, and cached', async () => {
    hoisted.onRecord = OCTOBER_26;

    const auth = await signIn();

    expect(hoisted.signOutCleanupMock).not.toHaveBeenCalled();
    expect(auth.current.user?.uid).toBe(user.uid);
    expect(localStorage.getItem(TOS_ACCEPTED_VERSION_KEY)).toBe(OCTOBER_26);
  });

  it('accepting over an October 5 record records the October 26 Terms and Privacy Policy', async () => {
    cacheTosAcceptance(); // what the consent modal does before the sign-in
    hoisted.onRecord = OCTOBER_5;

    const auth = await signIn();

    expect(hoisted.signOutCleanupMock).not.toHaveBeenCalled();
    expect(auth.current.user?.uid).toBe(user.uid);
    expect(termsWrites()).toHaveLength(1);
    expect(termsWrites()[0][1]).toMatchObject({ tosVersion: OCTOBER_26, privacyPolicyVersion: OCTOBER_26 });
  });
});
