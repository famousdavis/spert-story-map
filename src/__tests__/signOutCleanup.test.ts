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
  getSendInvitationEmail: vi.fn(() => null),
  getClaimPendingInvitations: vi.fn(() => null),
  getRevokeInvite: vi.fn(() => null),
  getResendInvite: vi.fn(() => null),
}));

import { signOutCleanup } from '../lib/signOutCleanup';

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

function makeDriver() {
  return {
    mode: 'cloud' as const,
    cancelPendingSaves: vi.fn(),
    flushPendingSaves: vi.fn(),
    // Unused stubs — required to satisfy the StorageDriver shape.
    loadProductIndex: vi.fn(),
    loadProduct: vi.fn(),
    createProduct: vi.fn(),
    saveProduct: vi.fn(),
    saveProductImmediate: vi.fn(),
    replaceProduct: vi.fn(),
    deleteProduct: vi.fn(),
    loadPreferences: vi.fn(),
    savePreferences: vi.fn(),
    getWorkspaceId: vi.fn(),
    onProductChange: vi.fn(),
    onSaveError: vi.fn(),
  };
}

beforeEach(() => {
  localStorage.clear();
  firebaseSignOutMock.mockClear();
});

describe('signOutCleanup', () => {
  it('calls driver.cancelPendingSaves before firebaseSignOut', async () => {
    const driver = makeDriver();
    const callOrder: string[] = [];
    driver.cancelPendingSaves.mockImplementation(() => { callOrder.push('cancel'); });
    firebaseSignOutMock.mockImplementation(() => {
      callOrder.push('firebaseSignOut');
      return Promise.resolve();
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test double
    await signOutCleanup(driver as any);

    expect(callOrder).toEqual(['cancel', 'firebaseSignOut']);
  });

  it('removes every rp_product_* key but preserves non-matching keys', async () => {
    localStorage.setItem('rp_product_aaa', '{}');
    localStorage.setItem('rp_product_bbb', '{}');
    localStorage.setItem('rp_product_ccc', '{}');
    localStorage.setItem('rp_workspace_id', 'ws-123');
    localStorage.setItem('spert-theme', 'dark');

    await signOutCleanup(null);

    expect(localStorage.getItem('rp_product_aaa')).toBeNull();
    expect(localStorage.getItem('rp_product_bbb')).toBeNull();
    expect(localStorage.getItem('rp_product_ccc')).toBeNull();
    expect(localStorage.getItem('rp_workspace_id')).toBe('ws-123');
    expect(localStorage.getItem('spert-theme')).toBe('dark');
  });

  it('removes rp_products_index and rp_app_preferences', async () => {
    localStorage.setItem('rp_products_index', '[]');
    localStorage.setItem('rp_app_preferences', '{"exportName":"Alice","exportId":"UF001"}');

    await signOutCleanup(null);

    expect(localStorage.getItem('rp_products_index')).toBeNull();
    expect(localStorage.getItem('rp_app_preferences')).toBeNull();
  });

  it('preserves the academic integrity token and UI preferences', async () => {
    localStorage.setItem('rp_workspace_id', 'ws-persistent');
    localStorage.setItem('spert-theme', 'dark');
    localStorage.setItem('spert_firstRun_seen', 'true');
    localStorage.setItem('spert_map_hint_dismissed', '1');

    await signOutCleanup(null);

    expect(localStorage.getItem('rp_workspace_id')).toBe('ws-persistent');
    expect(localStorage.getItem('spert-theme')).toBe('dark');
    expect(localStorage.getItem('spert_firstRun_seen')).toBe('true');
    expect(localStorage.getItem('spert_map_hint_dismissed')).toBe('1');
  });

  it('calls switchMode when provided and does not touch spert-storage-mode directly', async () => {
    localStorage.setItem('spert-storage-mode', 'cloud');
    const switchMode = vi.fn();

    await signOutCleanup(null, switchMode);

    expect(switchMode).toHaveBeenCalledWith('local');
    // localStorage still has 'cloud' because the helper delegated to switchMode
    // rather than writing directly.
    expect(localStorage.getItem('spert-storage-mode')).toBe('cloud');
  });

  it('writes spert-storage-mode=local directly when switchMode is omitted', async () => {
    localStorage.setItem('spert-storage-mode', 'cloud');

    await signOutCleanup(null);

    expect(localStorage.getItem('spert-storage-mode')).toBe('local');
  });

  it('invokes firebaseSignOut exactly once', async () => {
    await signOutCleanup(null);
    expect(firebaseSignOutMock).toHaveBeenCalledTimes(1);
  });
});
