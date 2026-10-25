// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// B-04 — the React-free Connect AI teardown used by sign-out. Proves it calls
// the server teardownAiSession Cloud Function with the stored session id and
// clears the local session, and that a failed/offline server call parks a
// retry marker (the state AiTeardownBanner reads) instead of silently dropping.

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// A single callable spy whose behaviour each test overrides.
const { callableMock, httpsCallableMock, deleteDocMock } = vi.hoisted(() => ({
  callableMock: vi.fn(() => Promise.resolve({ data: { status: 'ok' } })),
  httpsCallableMock: vi.fn(),
  deleteDocMock: vi.fn((_ref?: unknown) => Promise.resolve()),
}));

vi.mock('../lib/firebase', () => ({
  db: { __fake: 'db' },
  functionsInstance: { __fake: 'functions' },
}));

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segs: string[]) => ({ path: segs.join('/') }),
  deleteDoc: deleteDocMock,
}));

vi.mock('firebase/functions', () => ({
  httpsCallable: httpsCallableMock,
}));

import {
  endAiSessionForSignOut,
  retryPendingAiTeardown,
  getPendingAiTeardownSessionId,
  clearPendingAiTeardown,
} from '../lib/aiSessionTeardown';
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
  callableMock.mockReset().mockResolvedValue({ data: { status: 'ok' } });
  httpsCallableMock.mockReset().mockReturnValue(callableMock);
  deleteDocMock.mockReset().mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  // Re-stub localStorage for the next test (unstubAllGlobals clears it).
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => store[k] ?? null,
    setItem: (k: string, v: string) => { store[k] = String(v); },
    removeItem: (k: string) => { delete store[k]; },
    clear: () => { for (const k of Object.keys(store)) delete store[k]; },
    get length() { return Object.keys(store).length; },
    key: (i: number) => Object.keys(store)[i] ?? null,
  });
});

function seedSession() {
  localStorage.setItem(AI_SESSION_ID_KEY, SID);
  localStorage.setItem(AI_CONSENT_KEY, JSON.stringify({ version: 1, read: true, write: true }));
  localStorage.setItem(AI_LAST_SEQ_PREFIX + SID, '7');
}

describe('endAiSessionForSignOut', () => {
  it('calls teardownAiSession with the stored session id and clears local keys', async () => {
    seedSession();

    const result = await endAiSessionForSignOut();

    // Server call: the authoritative revocation.
    expect(httpsCallableMock).toHaveBeenCalledWith(
      { __fake: 'functions' }, 'teardownAiSession',
    );
    expect(callableMock).toHaveBeenCalledWith({ sessionId: SID });
    // Snapshot delete: part of "relay data incl. snapshot deleted".
    expect(deleteDocMock).toHaveBeenCalledTimes(1);
    expect(deleteDocMock.mock.calls[0]?.[0]).toEqual({
      path: `anonymous_sessions/${SID}/snapshot/current`,
    });
    // Local teardown.
    expect(localStorage.getItem(AI_SESSION_ID_KEY)).toBeNull();
    expect(localStorage.getItem(AI_CONSENT_KEY)).toBeNull();
    expect(localStorage.getItem(AI_LAST_SEQ_PREFIX + SID)).toBeNull();
    expect(result).toEqual({ attempted: true, serverOk: true });
    // Nothing parked on success.
    expect(getPendingAiTeardownSessionId()).toBeNull();
  });

  it('parks a retry marker when the server call fails, but still clears local keys', async () => {
    seedSession();
    callableMock.mockRejectedValue(new Error('unavailable'));

    const result = await endAiSessionForSignOut();

    expect(result).toEqual({ attempted: true, serverOk: false });
    // Local keys cleared regardless.
    expect(localStorage.getItem(AI_SESSION_ID_KEY)).toBeNull();
    expect(localStorage.getItem(AI_CONSENT_KEY)).toBeNull();
    // The session id is parked so the banner can warn + the teardown can retry.
    expect(getPendingAiTeardownSessionId()).toBe(SID);
  });

  it('fails fast and parks a marker when offline (no server call)', async () => {
    seedSession();
    vi.stubGlobal('navigator', { onLine: false });

    const result = await endAiSessionForSignOut();

    expect(result).toEqual({ attempted: true, serverOk: false });
    expect(httpsCallableMock).not.toHaveBeenCalled();
    expect(deleteDocMock).not.toHaveBeenCalled();
    expect(getPendingAiTeardownSessionId()).toBe(SID);
  });

  it('is a no-op with no stored session (and clears any stale marker)', async () => {
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, 'stale');

    const result = await endAiSessionForSignOut();

    expect(result).toEqual({ attempted: false, serverOk: true });
    expect(httpsCallableMock).not.toHaveBeenCalled();
    expect(getPendingAiTeardownSessionId()).toBeNull();
  });
});

describe('retryPendingAiTeardown', () => {
  it('clears the marker when the retried server call succeeds', async () => {
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, SID);

    const ok = await retryPendingAiTeardown();

    expect(ok).toBe(true);
    expect(callableMock).toHaveBeenCalledWith({ sessionId: SID });
    expect(getPendingAiTeardownSessionId()).toBeNull();
  });

  it('keeps the marker when the retry still fails', async () => {
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, SID);
    callableMock.mockRejectedValue(new Error('still offline'));

    const ok = await retryPendingAiTeardown();

    expect(ok).toBe(false);
    expect(getPendingAiTeardownSessionId()).toBe(SID);
  });

  it('is a no-op with nothing pending', async () => {
    const ok = await retryPendingAiTeardown();
    expect(ok).toBe(true);
    expect(httpsCallableMock).not.toHaveBeenCalled();
  });
});

describe('clearPendingAiTeardown', () => {
  it('removes the marker', () => {
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, SID);
    clearPendingAiTeardown();
    expect(getPendingAiTeardownSessionId()).toBeNull();
  });
});
