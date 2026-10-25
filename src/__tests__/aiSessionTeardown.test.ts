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
  vi.useRealTimers();
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

  it('is a no-op with no stored session and PRESERVES a parked marker', async () => {
    // Regression (review 1): the no-session branch must NOT clear the marker.
    // A failed teardown parks it then clears the session id, and this same
    // function runs again right after (AuthProvider's auth-change handler; and
    // another tab shares localStorage). Clearing here would silence the failure.
    localStorage.setItem(AI_TEARDOWN_PENDING_KEY, 'sid-parked');

    const result = await endAiSessionForSignOut();

    expect(result).toEqual({ attempted: false, serverOk: true });
    expect(httpsCallableMock).not.toHaveBeenCalled();
    expect(getPendingAiTeardownSessionId()).toBe('sid-parked');
  });

  it('keeps the failure marker on the second call with no session id (double-call)', async () => {
    // 1) sign-out with a failing server call parks the marker + clears the id.
    seedSession();
    callableMock.mockRejectedValue(new Error('offline'));
    const first = await endAiSessionForSignOut();
    expect(first.serverOk).toBe(false);
    expect(getPendingAiTeardownSessionId()).toBe(SID);
    expect(localStorage.getItem(AI_SESSION_ID_KEY)).toBeNull();

    // 2) the auth-change handler (or another tab) runs it again — no id now.
    const second = await endAiSessionForSignOut();

    expect(second).toEqual({ attempted: false, serverOk: true });
    // Marker must SURVIVE so the banner still warns and the retry still fires.
    expect(getPendingAiTeardownSessionId()).toBe(SID);
  });

  it('does not hang when the snapshot delete never resolves; parks the marker within the timeout', async () => {
    // Regression (review 2): navigator.onLine can be true while Firestore is
    // unreachable (captive portal / dropped VPN / proxy). A deleteDoc write then
    // never resolves. The whole server teardown is bounded, so sign-out still
    // completes and the failure is parked for retry.
    seedSession();
    vi.useFakeTimers();
    deleteDocMock.mockReturnValue(new Promise<void>(() => { /* never resolves */ }));

    const p = endAiSessionForSignOut();
    await vi.advanceTimersByTimeAsync(10_000);
    const result = await p;
    vi.useRealTimers();

    expect(result).toEqual({ attempted: true, serverOk: false });
    expect(getPendingAiTeardownSessionId()).toBe(SID);
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
