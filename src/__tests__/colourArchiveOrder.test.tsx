// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.56.0 R-6, R-4, R88: every order write builds from a fresh read of the stored order. The real
 * `useProjectOrder` on the real drivers: the cloud driver over the masked-write stand-in (two drivers
 * on one document = two clients), the local driver as two module graphs on one localStorage (two
 * tabs). Until v0.56.0 a drop or a clone in a tab opened earlier wrote the order that tab had read
 * at load, and undid another tab's reorder (Opus-CA-1-1, Opus-CA-1-2, Exec-CA-1 pre-flight).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
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
import { useProjectOrder } from '../hooks/useProjectOrder';

const P = ['p1', 'p2', 'p3', 'p4'].map(id => ({ id, name: id }));
const wait = (ms: number) => act(() => new Promise(r => setTimeout(r, ms)));
const unavailable = () => Object.assign(new Error('Failed to get document because the client is offline.'), { code: 'unavailable' });
type Kind = 'cloud' | 'local';

async function makeDriver(kind: Kind): Promise<StorageDriver> {
  vi.resetModules();
  const m = await import('../lib/storageDriver');
  return kind === 'cloud' ? m.createFirestoreDriver('u') : m.createLocalStorageDriver();
}
function stored(kind: Kind): { projectOrder?: string[] } {
  if (kind === 'cloud') return (h.fs.docs.get('spertstorymap_settings/u') ?? {}) as { projectOrder?: string[] };
  return JSON.parse(localStorage.getItem('rp:local:preferences') ?? '{}');
}
function seed(kind: Kind, order: string[]) {
  if (kind === 'cloud') h.fs.docs.set('spertstorymap_settings/u', { projectOrder: order });
  else localStorage.setItem('rp:local:preferences', JSON.stringify({ projectOrder: order }));
}
async function openOrder(driver: StorageDriver, list = P) {
  const hook = renderHook(() => useProjectOrder(driver, list));
  await wait(0);
  act(() => { hook.result.current.listed(list, hook.result.current.refreshStarted()); });
  return hook;
}
type Hook = Awaited<ReturnType<typeof openOrder>>;
const shown = (hook: Hook) => hook.result.current.sorted.map(p => p.id);
/** `moveOnto` returns a promise from v0.56.0 and nothing before: awaiting undefined is harmless. */
const drop = (hook: Hook, from: string, to: string, hidden?: ReadonlySet<string>) =>
  act(async () => { await (hook.result.current.moveOnto as (a: string, b: string, h?: ReadonlySet<string>) => unknown)(from, to, hidden); });
const clone = (hook: Hook, source: string, id: string) =>
  act(async () => { await (hook.result.current.placeClone(source, id, `${source} (Copy)`) as { placed?: Promise<void> }).placed; });

beforeEach(async () => { await import('firebase/firestore'); h.fs.reset(); localStorage.clear(); });
afterEach(() => { cleanup(); });

describe.each<Kind>(['cloud', 'local'])('%s: an order write reads the stored order first', kind => {
  it.each([false, true])('a drop in a tab opened before another tab\'s reorder keeps that reorder (control=%s)', async control => {
    seed(kind, ['p1', 'p2', 'p3', 'p4']);
    const B = await openOrder(await makeDriver(kind));
    let A: Hook | null = control ? null : await openOrder(await makeDriver(kind));
    await drop(B, 'p4', 'p1');
    await wait(300);
    expect(stored(kind).projectOrder).toEqual(['p4', 'p1', 'p2', 'p3']);
    A ??= await openOrder(await makeDriver(kind));
    await drop(A, 'p3', 'p2');
    await wait(300);
    expect(stored(kind).projectOrder).toEqual(['p4', 'p1', 'p3', 'p2']);
    expect(shown(A)).toEqual(['p4', 'p1', 'p3', 'p2']);
  });

  it.each([false, true])('a clone in a tab opened before another tab\'s reorder keeps that reorder (control=%s)', async control => {
    seed(kind, ['p1', 'p2', 'p3', 'p4']);
    const B = await openOrder(await makeDriver(kind));
    let A: Hook | null = control ? null : await openOrder(await makeDriver(kind));
    await drop(B, 'p4', 'p1');
    await wait(300);
    A ??= await openOrder(await makeDriver(kind));
    await clone(A, 'p2', 'c');
    await wait(300);
    expect(stored(kind).projectOrder).toEqual(['p4', 'p1', 'p2', 'c', 'p3']);
  });

  it('two quick drops in one tab both survive', async () => {
    seed(kind, ['p1', 'p2', 'p3', 'p4']);
    const A = await openOrder(await makeDriver(kind));
    await act(async () => {
      const move = A.result.current.moveOnto as (a: string, b: string) => unknown;
      await Promise.all([move('p4', 'p1'), move('p3', 'p1')]);
    });
    await wait(300);
    expect(stored(kind).projectOrder).toEqual(['p4', 'p3', 'p1', 'p2']);
  });

  it('a drop shows at once, from the order the tab holds, before the read returns', async () => {
    seed(kind, ['p1', 'p2', 'p3', 'p4']);
    const A = await openOrder(await makeDriver(kind));
    const release = kind === 'cloud' ? h.fs.holdReads() : null;
    act(() => { void (A.result.current.moveOnto as (a: string, b: string) => unknown)('p4', 'p1'); });
    expect(shown(A)).toEqual(['p4', 'p1', 'p2', 'p3']);
    release?.();
    await wait(300);
    expect(stored(kind).projectOrder).toEqual(['p4', 'p1', 'p2', 'p3']);
  });

  // Forecaster's slot rule (`reorderShown`): the slots that held a shown product take the new order;
  // a hidden product keeps its slot. Before and after give the same answer under the old rule.
  it.each([
    [['A', 'H', 'B', 'C'], 'A', 'B', ['B', 'H', 'A', 'C']],
    [['A', 'H', 'B', 'C'], 'B', 'A', ['B', 'H', 'A', 'C']],
    [['A', 'H', 'B', 'C'], 'A', 'C', ['B', 'H', 'C', 'A']],
    [['A', 'H', 'B', 'C'], 'C', 'A', ['C', 'H', 'A', 'B']],
    [['H', 'A', 'B', 'C'], 'C', 'A', ['H', 'C', 'A', 'B']],
    [['A', 'B', 'C', 'H'], 'A', 'C', ['B', 'C', 'A', 'H']],
  ])('hidden H in %j: %s dropped on %s gives %j', async (order, from, to, want) => {
    const list = order.map(id => ({ id, name: id }));
    seed(kind, order);
    const A = await openOrder(await makeDriver(kind), list);
    await drop(A, from, to, new Set(['H']));
    await wait(300);
    expect(stored(kind).projectOrder).toEqual(want);
  });
});

describe('cloud: a failed read', () => {
  it('keeps the order the tab holds, never the list\'s own sequence', async () => {
    seed('cloud', ['p4', 'p3', 'p2', 'p1']);
    const A = await openOrder(await makeDriver('cloud'));
    h.fs.failReads(unavailable());
    await drop(A, 'p1', 'p4');
    await wait(300);
    expect(stored('cloud').projectOrder).toEqual(['p1', 'p4', 'p3', 'p2']);
  });

  it('R88: the first read failed, so a drop writes no order', async () => {
    seed('cloud', ['p4', 'p3', 'p2', 'p1']);
    h.fs.failReads(unavailable());
    const A = await openOrder(await makeDriver('cloud'));
    expect(A.result.current.settings.status).toBe('failed');
    await drop(A, 'p2', 'p1');
    await wait(300);
    expect(stored('cloud').projectOrder).toEqual(['p4', 'p3', 'p2', 'p1']);
  });

  it('R88: the first read failed, so a clone writes no order; a later read that succeeds brings the order back', async () => {
    seed('cloud', ['p4', 'p3', 'p2', 'p1']);
    h.fs.failReads(unavailable());
    const A = await openOrder(await makeDriver('cloud'));
    await clone(A, 'p2', 'c');
    await wait(300);
    expect(stored('cloud').projectOrder).toEqual(['p4', 'p3', 'p2', 'p1']);
    h.fs.failReads(null);
    act(() => { A.result.current.listed(P, A.result.current.refreshStarted()); });
    await wait(0);
    expect(A.result.current.settings.status).toBe('ready');
    expect(shown(A)).toEqual(['p4', 'p3', 'p2', 'p1']);
  });

  it('the strict read: a failure is told apart from an empty document', async () => {
    const A = await makeDriver('cloud');
    await expect(A.loadPreferences({ throwOnError: true })).resolves.toEqual({});
    h.fs.failReads(unavailable());
    await expect(A.loadPreferences({ throwOnError: true })).rejects.toThrow();
    await expect(A.loadPreferences()).resolves.toEqual({});
  });
});
