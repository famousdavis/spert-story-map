// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// B-04 — sign-out must end an active Connect AI session, the way Disconnect
// does. Before the fix signOutCleanup touched none of the AI state; these tests
// fail against that code and pass once signOutCleanup calls
// endAiSessionForSignOut. Driven end-to-end through the real
// aiSessionTeardown module so they assert the server teardownAiSession call,
// not merely that a helper was invoked.

import { describe, it, expect, beforeEach, vi } from 'vitest';

const { firebaseSignOutMock, callableMock, httpsCallableMock, deleteDocMock } = vi.hoisted(() => ({
  firebaseSignOutMock: vi.fn(() => Promise.resolve()),
  callableMock: vi.fn(() => Promise.resolve({ data: { status: 'ok' } })),
  httpsCallableMock: vi.fn(),
  deleteDocMock: vi.fn(() => Promise.resolve()),
}));

vi.mock('firebase/auth', () => ({ signOut: firebaseSignOutMock }));

// db + functionsInstance non-null so the server teardown actually runs.
vi.mock('../lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user' } },
  db: { __fake: 'db' },
  isFirebaseAvailable: true,
  functionsInstance: { __fake: 'functions' },
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  deleteDoc: deleteDocMock,
  getDoc: vi.fn(() => Promise.resolve({ exists: () => false })),
  setDoc: vi.fn(() => Promise.resolve()),
  serverTimestamp: vi.fn(() => ({ __ts: true })),
}));

vi.mock('firebase/functions', () => ({ httpsCallable: httpsCallableMock }));

vi.mock('../lib/callables', () => ({
  callSendInvitationEmail: vi.fn(() => Promise.reject(new Error('n/a'))),
  callClaimPendingInvitations: vi.fn(() => Promise.reject(new Error('n/a'))),
  callRevokeInvite: vi.fn(() => Promise.reject(new Error('n/a'))),
  callResendInvite: vi.fn(() => Promise.reject(new Error('n/a'))),
}));

import { signOutCleanup } from '../lib/signOutCleanup';
import { setStorageNamespace } from '../lib/storage';
import {
  AI_SESSION_ID_KEY, AI_CONSENT_KEY, AI_LAST_SEQ_PREFIX, AI_TEARDOWN_PENDING_KEY,
} from '../lib/aiConstants';

const SID = '123e4567-e89b-42d3-a456-426614174000';

const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (k: string) => store[k] ?? null,
  setItem: (k: string, v: string) => { store[k] = String(v); },
  removeItem: (k: string) => { delete store[k]; },
  clear: () => { for (const k of Object.keys(store)) delete store[k]; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
});

beforeEach(() => {
  localStorage.clear();
  firebaseSignOutMock.mockClear();
  callableMock.mockReset().mockResolvedValue({ data: { status: 'ok' } });
  httpsCallableMock.mockReset().mockReturnValue(callableMock);
  deleteDocMock.mockReset().mockResolvedValue(undefined);
  setStorageNamespace('local');
  localStorage.setItem(AI_SESSION_ID_KEY, SID);
  localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({ version: 1, read: true, write: true }));
  localStorage.setItem(AI_LAST_SEQ_PREFIX + SID, '3');
});

describe('signOutCleanup ends the Connect AI session (B-04)', () => {
  it('calls teardownAiSession with the active session id and clears the local session', async () => {
    await signOutCleanup();

    expect(httpsCallableMock).toHaveBeenCalledWith({ __fake: 'functions' }, 'teardownAiSession');
    expect(callableMock).toHaveBeenCalledWith({ sessionId: SID });
    expect(localStorage.getItem(AI_SESSION_ID_KEY)).toBeNull();
    expect(localStorage.getItem(AI_CONSENT_KEY)).toBeNull();
    expect(localStorage.getItem(AI_LAST_SEQ_PREFIX + SID)).toBeNull();
    // Still signs out afterwards.
    expect(firebaseSignOutMock).toHaveBeenCalledTimes(1);
  });

  it('ends the AI session BEFORE revoking the Firebase credential', async () => {
    const order: string[] = [];
    callableMock.mockImplementation(() => { order.push('teardownAiSession'); return Promise.resolve({ data: { status: 'ok' } }); });
    firebaseSignOutMock.mockImplementation(() => { order.push('firebaseSignOut'); return Promise.resolve(); });

    await signOutCleanup();

    expect(order).toEqual(['teardownAiSession', 'firebaseSignOut']);
  });

  it('parks a retry marker (the user-visible warning state) when the teardown call fails', async () => {
    callableMock.mockRejectedValue(new Error('offline'));

    await signOutCleanup();

    // The session id is parked so AiTeardownBanner warns the user and the
    // teardown can be retried; sign-out still completes.
    expect(localStorage.getItem(AI_TEARDOWN_PENDING_KEY)).toBe(SID);
    expect(firebaseSignOutMock).toHaveBeenCalledTimes(1);
  });
});
