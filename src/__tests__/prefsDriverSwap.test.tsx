// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.55.14 R-8 (review -06): a driver swap still CANCELS pending settings writes (sign-out must not
 * write after revocation), while leaving the page flushes them. Driven through the real
 * StorageProvider: a setting typed on the local driver, then a switch to the cloud swaps the driver.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, act, cleanup } from '@testing-library/react';

const h = vi.hoisted(() => ({
  fs: null as unknown as ReturnType<typeof import('./fixtures/mergeFieldsFirestore').createMergeFieldsFirestore>,
}));
vi.mock('../lib/firebase', () => ({ db: {}, auth: null, functionsInstance: null, isFirebaseAvailable: true }));
vi.mock('../lib/AuthProvider', () => ({ useAuth: () => ({ user: { uid: 'u' }, loading: false, firebaseAvailable: true }) }));
vi.mock('firebase/firestore', async () => {
  const { createMergeFieldsFirestore } = await import('./fixtures/mergeFieldsFirestore');
  h.fs ??= createMergeFieldsFirestore();
  const f = h.fs;
  return {
    doc: f.doc, getDoc: f.getDoc, setDoc: f.setDoc, deleteField: f.deleteField, FieldPath: f.FieldPath,
    getDocs: f.getDocs, collection: f.collection, query: f.query, where: f.where,
  };
});

import { StorageProvider, useStorage } from '../lib/StorageProvider';

function Controls() {
  const { driver, mode, switchMode } = useStorage();
  return (
    <>
      <span data-testid="mode">{mode}</span>
      <button onClick={() => driver?.writePreferences([{ path: ['exportName'], value: 'typed' }])}>write</button>
      <button onClick={() => switchMode('cloud')}>cloud</button>
    </>
  );
}
// signed in as u, so the local driver writes under u's namespace
const storedLocally = () => JSON.parse(localStorage.getItem('rp:u:preferences') ?? '{}');
const wait = (ms: number) => act(() => new Promise(r => setTimeout(r, ms)));

afterEach(() => { cleanup(); localStorage.clear(); h.fs?.reset(); });

describe('a driver swap cancels pending settings writes', () => {
  it.each([true, false])('a setting typed just before the swap is not written after it (swap=%s; without the swap it lands)', async swap => {
    const view = render(<StorageProvider><Controls /></StorageProvider>);
    expect(view.getByTestId('mode').textContent).toBe('local');
    await act(async () => { view.getByText('write').click(); });
    expect(storedLocally().exportName).toBeUndefined(); // still inside the debounce
    if (swap) {
      await act(async () => { view.getByText('cloud').click(); });
      expect(view.getByTestId('mode').textContent).toBe('cloud');
    }
    await wait(300);
    expect(storedLocally().exportName).toBe(swap ? undefined : 'typed');
    expect(h.fs.writes).toHaveLength(0);
  });
});
