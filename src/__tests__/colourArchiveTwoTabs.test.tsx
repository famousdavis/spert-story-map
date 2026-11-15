// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.56.0 R-1: a colour set in one tab and an archive set in another, on one product, are both kept,
 * because each is written as its own field. The real `useProductArchive` on the real drivers: the
 * cloud driver over the masked-write stand-in (two drivers on one document = two clients), the local
 * driver as two module graphs on one localStorage (two tabs). Char-RB-1 measured the alternative, a
 * whole entry per write: 100 of 100 lost.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { createRef } from 'react';
import type { StorageDriver } from '../types';

const h = vi.hoisted(() => ({
  fs: null as unknown as ReturnType<typeof import('./fixtures/mergeFieldsFirestore').createMergeFieldsFirestore>,
}));
vi.mock('../lib/firebase', () => ({ db: {}, auth: null, functionsInstance: null, isFirebaseAvailable: true }));
vi.mock('firebase/firestore', async () => {
  const { createMergeFieldsFirestore } = await import('./fixtures/mergeFieldsFirestore');
  h.fs ??= createMergeFieldsFirestore();
  const f = h.fs;
  return {
    doc: f.doc, getDoc: f.getDoc, setDoc: f.setDoc, deleteField: f.deleteField, FieldPath: f.FieldPath,
    getDocs: f.getDocs, getDocFromServer: f.getDocFromServer, getDocsFromServer: f.getDocsFromServer,
    collection: f.collection, query: f.query, where: f.where,
  };
});
import { useProductArchive } from '../hooks/useProductArchive';
import { sanitizeProjectPrefs } from '../lib/projectPrefs';

type Kind = 'cloud' | 'local';
const P = [{ id: 'p1', name: 'One' }, { id: 'p2', name: 'Two' }];
const wait = (ms: number) => act(() => new Promise(r => setTimeout(r, ms)));

async function makeDriver(kind: Kind): Promise<StorageDriver> {
  vi.resetModules();
  const m = await import('../lib/storageDriver');
  return kind === 'cloud' ? m.createFirestoreDriver('u') : m.createLocalStorageDriver();
}
function stored(kind: Kind) {
  const raw = kind === 'cloud'
    ? h.fs.docs.get('spertstorymap_settings/u')
    : JSON.parse(localStorage.getItem('rp:local:preferences') ?? '{}');
  return sanitizeProjectPrefs((raw as { projectPrefs?: unknown } | undefined)?.projectPrefs);
}
/** A tab whose first read found no colours or archive (one object: the hook compares reads by identity). */
function openTab(driver: StorageDriver) {
  const settings = { status: 'ready' as const, prefs: {} };
  const rootRef = createRef<HTMLElement>();
  const newProductRef = createRef<HTMLButtonElement>();
  return renderHook(() => useProductArchive({ driver, products: P, settings, rootRef, newProductRef, announce: () => {} }));
}

beforeEach(async () => { await import('firebase/firestore'); h.fs.reset(); localStorage.clear(); });
afterEach(() => { cleanup(); });

describe.each<Kind>(['cloud', 'local'])('%s: colour in one tab, archive in another, one product', kind => {
  it('both are kept', async () => {
    const A = openTab(await makeDriver(kind));
    const B = openTab(await makeDriver(kind));
    act(() => { A.result.current.pickColor('p1', 'teal'); });
    act(() => { B.result.current.archiveId('p1'); });
    await wait(300);
    expect(stored(kind)).toEqual({ p1: { color: 'teal', archived: true } });
  });

  it('the other way round: a colour from a tab that read nothing keeps the archive another tab stored', async () => {
    const A = openTab(await makeDriver(kind));
    act(() => { A.result.current.archiveId('p2'); A.result.current.pickColor('p2', 'pink'); });
    await wait(300);
    const B = openTab(await makeDriver(kind));
    act(() => { B.result.current.pickColor('p2', 'slate'); });
    await wait(300);
    expect(stored(kind)).toEqual({ p2: { color: 'slate', archived: true } });
  });
});
