// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock firebase/auth so we can spy on signOut.
// vi.hoisted is required because vi.mock is hoisted above top-level statements.
const { firebaseSignOutMock } = vi.hoisted(() => ({
  firebaseSignOutMock: vi.fn(() => Promise.resolve()),
}));
vi.mock('firebase/auth', () => ({
  signOut: firebaseSignOutMock,
}));

// Mock firebase module — auth must be non-null for firebaseSignOut to fire.
vi.mock('../lib/firebase', () => ({
  auth: { currentUser: { uid: 'test-user' } },
  db: null,
  isFirebaseAvailable: true,
  functionsInstance: null,
}));

// Mock callables.ts (Lesson 61: centralized requireFunctions wrappers)
vi.mock('../lib/callables', () => ({
  callSendInvitationEmail: vi.fn(() => Promise.reject(new Error('Firebase Functions not initialized.'))),
  callClaimPendingInvitations: vi.fn(() => Promise.reject(new Error('Firebase Functions not initialized.'))),
  callRevokeInvite: vi.fn(() => Promise.reject(new Error('Firebase Functions not initialized.'))),
  callResendInvite: vi.fn(() => Promise.reject(new Error('Firebase Functions not initialized.'))),
}));

import { signOutCleanup } from '../lib/signOutCleanup';
import { setStorageNamespace } from '../lib/storage';
import {
  registerDriverCleanup,
  clearDriverCleanup,
} from '../lib/driverCleanupRegistry';

// Mock localStorage for node environment.
const store: Record<string, string> = {};
vi.stubGlobal('localStorage', {
  getItem: (key: string) => store[key] ?? null,
  setItem: (key: string, value: string) => { store[key] = String(value); },
  removeItem: (key: string) => { delete store[key]; },
  clear: () => { for (const key of Object.keys(store)) delete store[key]; },
  get length() { return Object.keys(store).length; },
  key: (i: number) => Object.keys(store)[i] ?? null,
});

beforeEach(() => {
  localStorage.clear();
  firebaseSignOutMock.mockClear();
  clearDriverCleanup();
  // Default: anonymous namespace. Cloud-user tests will override.
  setStorageNamespace('local');
});

/**
 * Register a fake driver teardown so signOutCleanup → runDriverCleanup
 * exercises the cancel/tearDown ordering. Returns the spy handles plus
 * the unsubscribe lambda (cleanup runs once on signOut, then auto-clears).
 */
function registerFakeDriver() {
  const cancelPendingSaves = vi.fn();
  const tearDownListeners = vi.fn();
  registerDriverCleanup(async () => {
    cancelPendingSaves();
    tearDownListeners();
  });
  return { cancelPendingSaves, tearDownListeners };
}

describe('signOutCleanup', () => {
  it('runs registered driver cleanup before firebaseSignOut', async () => {
    const callOrder: string[] = [];
    registerDriverCleanup(async () => {
      callOrder.push('driverCleanup');
    });
    firebaseSignOutMock.mockImplementation(() => {
      callOrder.push('firebaseSignOut');
      return Promise.resolve();
    });

    await signOutCleanup();

    expect(callOrder).toEqual(['driverCleanup', 'firebaseSignOut']);
  });

  it('driver cleanup cancels pending saves AND detaches listeners (audit L3)', async () => {
    const { cancelPendingSaves, tearDownListeners } = registerFakeDriver();

    await signOutCleanup();

    expect(cancelPendingSaves).toHaveBeenCalledTimes(1);
    expect(tearDownListeners).toHaveBeenCalledTimes(1);
  });

  it('removes every product key in the active namespace but preserves non-matching keys', async () => {
    setStorageNamespace('test-user-uid');
    // The signed-in user's namespaced index — clearAllLocalProducts iterates
    // this to remove individual product docs.
    localStorage.setItem('rp:test-user-uid:products_index', JSON.stringify([
      { id: 'aaa', name: 'A' }, { id: 'bbb', name: 'B' }, { id: 'ccc', name: 'C' },
    ]));
    localStorage.setItem('rp:test-user-uid:product_aaa', '{}');
    localStorage.setItem('rp:test-user-uid:product_bbb', '{}');
    localStorage.setItem('rp:test-user-uid:product_ccc', '{}');
    localStorage.setItem('rp_workspace_id', 'ws-123');
    localStorage.setItem('spert-theme', 'dark');
    // Anonymous-namespace orphans must SURVIVE — a signed-out user may still
    // want to see anonymous data they had before signing in.
    localStorage.setItem('rp:local:product_zzz', '{}');

    await signOutCleanup();

    expect(localStorage.getItem('rp:test-user-uid:product_aaa')).toBeNull();
    expect(localStorage.getItem('rp:test-user-uid:product_bbb')).toBeNull();
    expect(localStorage.getItem('rp:test-user-uid:product_ccc')).toBeNull();
    expect(localStorage.getItem('rp:test-user-uid:products_index')).toBeNull();
    expect(localStorage.getItem('rp:local:product_zzz')).toBe('{}');
    expect(localStorage.getItem('rp_workspace_id')).toBe('ws-123');
    expect(localStorage.getItem('spert-theme')).toBe('dark');
  });

  it('removes namespaced products_index and preferences', async () => {
    setStorageNamespace('test-user-uid');
    localStorage.setItem('rp:test-user-uid:products_index', '[]');
    localStorage.setItem('rp:test-user-uid:preferences', '{"exportName":"Alice","exportId":"UF001"}');

    await signOutCleanup();

    expect(localStorage.getItem('rp:test-user-uid:products_index')).toBeNull();
    expect(localStorage.getItem('rp:test-user-uid:preferences')).toBeNull();
  });

  it('preserves the academic integrity token and UI preferences', async () => {
    localStorage.setItem('rp_workspace_id', 'ws-persistent');
    localStorage.setItem('spert-theme', 'dark');
    localStorage.setItem('spert_firstRun_seen', 'true');
    localStorage.setItem('spert_map_hint_dismissed', '1');

    await signOutCleanup();

    expect(localStorage.getItem('rp_workspace_id')).toBe('ws-persistent');
    expect(localStorage.getItem('spert-theme')).toBe('dark');
    expect(localStorage.getItem('spert_firstRun_seen')).toBe('true');
    expect(localStorage.getItem('spert_map_hint_dismissed')).toBe('1');
  });

  it('calls switchMode when provided and does not touch spert-storage-mode directly', async () => {
    localStorage.setItem('spert-storage-mode', 'cloud');
    const switchMode = vi.fn();

    await signOutCleanup(switchMode);

    expect(switchMode).toHaveBeenCalledWith('local');
    // localStorage still has 'cloud' because the helper delegated to switchMode
    // rather than writing directly.
    expect(localStorage.getItem('spert-storage-mode')).toBe('cloud');
  });

  it('writes spert-storage-mode=local directly when switchMode is omitted', async () => {
    localStorage.setItem('spert-storage-mode', 'cloud');

    await signOutCleanup();

    expect(localStorage.getItem('spert-storage-mode')).toBe('local');
  });

  it('invokes firebaseSignOut exactly once', async () => {
    await signOutCleanup();
    expect(firebaseSignOutMock).toHaveBeenCalledTimes(1);
  });
});
