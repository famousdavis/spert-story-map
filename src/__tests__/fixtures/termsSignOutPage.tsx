// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// A page load for the Terms sign-out tests (v0.55.16): the real App, AuthProvider, StorageProvider,
// signOutCleanup and local driver, each load a fresh module graph, so a reload is a second call.
// The test file mocks Firebase (fixtures/termsSignOutFirebase.ts) and owns the stub's state.

import { useEffect } from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { vi } from 'vitest';
import type { FirebaseStub } from './termsSignOutFirebase';
import type { StorageDriver } from '../../types';

/** The edition an out-of-date acceptance names. Written out: the current one is read from tosConstants. */
export const OLD_EDITION = '10-05-2026';
export const TOS_KEY = 'spert_tos_accepted_version';
export const MODE_KEY = 'spert-storage-mode';
/** The banner's words (R80), written out rather than imported from the component. */
export const NOTICE =
  'You were signed out because the Terms of Service changed or could not be checked. Your products, export name and identifier in this browser were not deleted. If you used Cloud storage, choose it again in Settings after you sign in.';

export const user = (uid: string) => ({
  uid,
  displayName: 'Rem Ember',
  email: `${uid}@example.test`,
  emailVerified: false,
  photoURL: null,
  providerData: [{ providerId: 'google.com' }],
});

export interface Seeded { uid: string; localId: string; uidId: string }

/** Two products and an export name kept signed out (rp:local), one product and an export name kept signed in (rp:{uid}). */
export async function seed(uid: string, mode: 'local' | 'cloud', tosKey: string | null): Promise<Seeded> {
  localStorage.clear();
  const storage = await import('../../lib/storage');
  storage.setStorageNamespace('local');
  const a = storage.createNewProduct('Signed-out Alpha');
  storage.saveProductImmediate(a);
  storage.saveProductImmediate(storage.createNewProduct('Signed-out Beta'));
  // Written raw, as an earlier version kept it: since v0.56.1 the app writes products to rp:local only.
  const u = storage.createNewProduct('Made signed in');
  localStorage.setItem(`rp:${uid}:product_${u.id}`, JSON.stringify(u));
  localStorage.setItem(`rp:${uid}:products_index`, JSON.stringify([{ id: u.id, name: u.name, updatedAt: u.updatedAt }]));
  localStorage.setItem('rp:local:preferences', JSON.stringify({ exportName: 'Signed-out person', exportId: 'L-1' }));
  localStorage.setItem(`rp:${uid}:preferences`, JSON.stringify({ exportName: 'Signed-in person', exportId: 'U-1' }));
  localStorage.setItem(MODE_KEY, mode);
  localStorage.setItem('spert_firstRun_seen', '1');
  if (tosKey) localStorage.setItem(TOS_KEY, tosKey);
  return { uid, localId: a.id, uidId: u.id };
}

export interface Page { driver: () => StorageDriver | null }

/** Load the app at `at` with whatever Firebase holds (`s.current`). Call `vi.resetModules()` first for a fresh page. */
export async function load(s: FirebaseStub, at = '/'): Promise<Page> {
  cleanup();
  s.listeners.clear();
  s.runs = [];
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
  const { AuthProvider } = await import('../../lib/AuthProvider');
  const { StorageProvider, useStorage } = await import('../../lib/StorageProvider');
  const App = (await import('../../App')).default;
  const { MemoryRouter } = await import('react-router-dom');
  const held: { driver: StorageDriver | null } = { driver: null };
  function Hold() {
    const { driver } = useStorage();
    useEffect(() => { held.driver = driver; }, [driver]);
    return null;
  }
  render(
    <MemoryRouter initialEntries={[at]}>
      <AuthProvider><StorageProvider><Hold /><App /></StorageProvider></AuthProvider>
    </MemoryRouter>,
  );
  // AuthProvider's observer is called on a 0 ms timer set while it rendered; this one fires after it.
  await act(async () => { await new Promise(r => setTimeout(r, 0)); });
  return { driver: () => held.driver };
}

/**
 * Evaluate the app's modules once, so their transform is paid in a hook with its own timeout and
 * each test's fresh page only re-evaluates them (the first load took about 3 s alone, more in the
 * full suite).
 */
export async function warmUp(): Promise<void> {
  await import('../../App');
  await import('../../lib/AuthProvider');
  await import('../../lib/StorageProvider');
  await import('react-router-dom');
}

/** Poll with real timers until `ready()` holds. */
export async function until(ready: () => boolean, what: string, ms = 5000): Promise<void> {
  const end = Date.now() + ms;
  while (!ready()) {
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  }
}

/** One turn of the event loop that fake `setTimeout` does not hold. */
const turn = () => new Promise<void>(r => setImmediate(r));

/** Wait until every auth observer call, and every one it started, has finished. */
export async function settle(s: FirebaseStub): Promise<void> {
  for (let i = 0; i < 30; i++) {
    const n = s.runs.length;
    await act(async () => { await turn(); await Promise.allSettled(s.runs); await turn(); });
    if (s.runs.length === n && i > 1) return;
  }
}

export function names(ns: string): string[] {
  const raw = localStorage.getItem(`rp:${ns}:products_index`);
  return raw ? (JSON.parse(raw) as { name: string }[]).map(e => e.name).sort() : [];
}

export function productName(ns: string, id: string): string | null {
  const raw = localStorage.getItem(`rp:${ns}:product_${id}`);
  return raw ? (JSON.parse(raw) as { name: string }).name : null;
}

export function exportName(ns: string): unknown {
  const raw = localStorage.getItem(`rp:${ns}:preferences`);
  return raw ? (JSON.parse(raw) as { exportName?: unknown }).exportName : null;
}
