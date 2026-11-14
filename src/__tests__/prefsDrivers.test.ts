// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * v0.55.14 R-1 to R-4: both drivers write settings as entries. The cloud driver runs over the
 * masked-write stand-in; the local driver over jsdom's localStorage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

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
    getDocs: f.getDocs, collection: f.collection, query: f.query, where: f.where,
  };
});

import { createFirestoreDriver } from '../lib/firestoreDriver';
import * as storage from '../lib/storage';
import { REMOVE, applyEntries, isRemoval, type PrefEntry } from '../lib/prefEntries';

const SEED = { exportName: 'E', exportId: 'I', projectOrder: ['a'], projectPrefs: { 'a.b': { color: 'blue', archived: true }, p2: { archived: true }, s: 'str' } };
const cloudDoc = (uid = 'u') => h.fs.docs.get(`spertstorymap_settings/${uid}`);
const localDoc = (ns = 'local') => JSON.parse(localStorage.getItem(`rp:${ns}:preferences`) ?? 'null');

/** Write `entries` and flush, on one driver; returns the stored document. */
interface Side { write(e: PrefEntry[]): void; flush(): void; cancel(): void; stored(): unknown; read(): Promise<unknown> }
function cloudSide(uid = 'u'): Side {
  const d = createFirestoreDriver(uid);
  return { write: e => { void d.writePreferences(e); }, flush: () => d.flushPendingSaves(), cancel: () => d.cancelPendingSaves(), stored: () => cloudDoc(uid), read: () => d.loadPreferences() };
}
function localSide(ns = 'local'): Side {
  return { write: e => storage.writePreferences(e, ns), flush: () => storage.flushPendingSaves(), cancel: () => storage.cancelPendingSaves(), stored: () => localDoc(ns), read: async () => storage.loadPreferences(ns) };
}
function seed(kind: 'cloud' | 'local', key = kind === 'cloud' ? 'u' : 'local') {
  if (kind === 'cloud') h.fs.docs.set(`spertstorymap_settings/${key}`, structuredClone(SEED));
  else localStorage.setItem(`rp:${key}:preferences`, JSON.stringify(SEED));
}

/** Maps left empty compare equal to absent ones (see the test of the one difference). */
function pruneEmpty(v: unknown): unknown {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
  const out: Record<string, unknown> = {};
  for (const [k, x] of Object.entries(v)) {
    const p = pruneEmpty(x);
    if (!(typeof p === 'object' && p !== null && !Array.isArray(p) && Object.keys(p).length === 0)) out[k] = p;
  }
  return out;
}

beforeEach(() => { h.fs?.reset(); storage.cancelPendingSaves(); localStorage.clear(); vi.restoreAllMocks(); });

describe.each(['cloud', 'local'] as const)('%s driver', kind => {
  const side = () => (kind === 'cloud' ? cloudSide() : localSide());

  it.each([['constructor'], ['toString'], [''], ['__x__'], ['__proto__']])('refuses the segment %j and writes nothing', seg => {
    seed(kind);
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const s = side();
    s.write([{ path: ['projectPrefs', seg, 'color'], value: 'x' }]);
    s.write([{ path: [seg], value: REMOVE }]);
    s.flush();
    expect(s.stored()).toEqual(SEED);
    if (kind === 'cloud') expect(h.fs.writes).toHaveLength(0);
    expect(warn).toHaveBeenCalled();
  });

  it('a segment holding a dot is one field, not a nested path', () => {
    seed(kind);
    const s = side();
    s.write([{ path: ['projectPrefs', 'a.b', 'color'], value: 'teal' }]);
    s.flush();
    expect(s.stored()).toMatchObject({ projectPrefs: { 'a.b': { color: 'teal', archived: true }, p2: { archived: true } } });
    expect((s.stored() as { projectPrefs: Record<string, unknown> }).projectPrefs.a).toBeUndefined();
  });

  it('a nested path is created, and a removal or an undefined value removes the key', () => {
    seed(kind);
    const s = side();
    s.write([{ path: ['projectPrefs', 'n1', 'color'], value: 'pink' }, { path: ['exportId'], value: undefined }, { path: ['projectPrefs', 'p2'], value: REMOVE }]);
    s.flush();
    const d = s.stored() as Record<string, Record<string, unknown>>;
    expect(d.projectPrefs).toEqual({ 'a.b': { color: 'blue', archived: true }, s: 'str', n1: { color: 'pink' } });
    expect('exportId' in d).toBe(false);
    expect(d.exportName).toBe('E');
  });

  it('a parent removal after a pending child wins; a child after a pending parent removal folds into it', () => {
    seed(kind);
    const s = side();
    s.write([{ path: ['projectPrefs', 'a.b', 'color'], value: 'red' }, { path: ['projectPrefs', 'a.b'], value: REMOVE }]);
    s.write([{ path: ['projectPrefs', 'p2'], value: REMOVE }, { path: ['projectPrefs', 'p2', 'color'], value: 'teal' }]);
    s.flush();
    expect((s.stored() as { projectPrefs: unknown }).projectPrefs).toEqual({ p2: { color: 'teal' }, s: 'str' });
  });

  it('accumulated entries write the same document as the entries written one by one (seeded random)', () => {
    const PATHS = [['exportName'], ['projectOrder'], ['projectPrefs'], ['projectPrefs', 'a.b'], ['projectPrefs', 'a.b', 'color'],
      ['projectPrefs', 'a.b', 'archived'], ['projectPrefs', 'p2', 'color'], ['projectPrefs', 'new', 'archived']];
    const VALUES: unknown[] = ['v1', 'v2', true, { color: 'teal' }, ['x', 'y'], REMOVE, undefined];
    let state = 20261114;
    const rnd = () => ((state = (state * 1664525 + 1013904223) >>> 0) / 2 ** 32);
    for (let round = 0; round < 200; round++) {
      const seq: PrefEntry[] = Array.from({ length: 1 + Math.floor(rnd() * 6) }, () => ({ path: PATHS[Math.floor(rnd() * PATHS.length)]!, value: VALUES[Math.floor(rnd() * VALUES.length)] }));
      seed(kind, kind === 'cloud' ? 'ua' : 'na');
      seed(kind, kind === 'cloud' ? 'ub' : 'nb');
      const acc = kind === 'cloud' ? cloudSide('ua') : localSide('na');
      const one = kind === 'cloud' ? cloudSide('ub') : localSide('nb');
      for (const e of seq) acc.write([e]);
      acc.flush();
      for (const e of seq) { one.write([e]); one.flush(); }
      expect(pruneEmpty(acc.stored()), JSON.stringify(seq)).toEqual(pruneEmpty(one.stored()));
    }
  });

  it('the one difference: a set then its own removal leaves an empty map one by one, nothing accumulated', () => {
    seed(kind, kind === 'cloud' ? 'ua' : 'na');
    seed(kind, kind === 'cloud' ? 'ub' : 'nb');
    const acc = kind === 'cloud' ? cloudSide('ua') : localSide('na');
    const one = kind === 'cloud' ? cloudSide('ub') : localSide('nb');
    const seq: PrefEntry[] = [{ path: ['projectPrefs', 'new', 'color'], value: 'x' }, { path: ['projectPrefs', 'new', 'color'], value: REMOVE }];
    for (const e of seq) acc.write([e]);
    acc.flush();
    for (const e of seq) { one.write([e]); one.flush(); }
    expect((one.stored() as { projectPrefs: Record<string, unknown> }).projectPrefs.new).toEqual({});
    expect('new' in (acc.stored() as { projectPrefs: Record<string, unknown> }).projectPrefs).toBe(false);
  });

  it('flush writes every accumulated entry at once; cancel drops them', () => {
    seed(kind);
    const s = side();
    s.write([{ path: ['exportName'], value: 'N' }]);
    s.write([{ path: ['projectOrder'], value: ['b', 'a'] }]);
    s.flush();
    expect(s.stored()).toMatchObject({ exportName: 'N', projectOrder: ['b', 'a'], exportId: 'I' });
    if (kind === 'cloud') expect(h.fs.writes).toHaveLength(1);
    s.write([{ path: ['exportName'], value: 'dropped' }]);
    s.cancel();
    s.flush();
    expect(s.stored()).toMatchObject({ exportName: 'N' });
  });

  // Review -04: the test above ends with flush(), which writes nothing once the timer is gone, so a
  // cancel that kept its entries passed it.
  it('after a cancel, a read lacks the cancelled entry and a later write and flush do not carry it', async () => {
    seed(kind);
    const s = side();
    s.write([{ path: ['exportName'], value: 'cancelled' }]);
    s.cancel();
    expect(await s.read()).toMatchObject({ exportName: 'E' });
    s.write([{ path: ['exportId'], value: 'later' }]);
    s.flush();
    expect(s.stored()).toMatchObject({ exportName: 'E', exportId: 'later' });
  });

  it('a read sees this tab\'s entries before they are written', async () => {
    seed(kind);
    const s = side();
    s.write([{ path: ['exportName'], value: 'pending' }, { path: ['projectPrefs', 'p2'], value: REMOVE }]);
    const read = await s.read() as Record<string, Record<string, unknown>>;
    expect(read.exportName).toBe('pending');
    expect(read.projectPrefs?.p2).toBeUndefined();
    expect(read.exportId).toBe('I');
    expect(s.stored()).toEqual(SEED);
  });
});

describe('cloud driver', () => {
  it('reads nothing around a save', async () => {
    seed('cloud');
    const s = cloudSide();
    const before = h.fs.reads;
    s.write([{ path: ['exportName'], value: 'N' }]);
    await new Promise(r => setTimeout(r, 260));
    expect(cloudDoc()).toMatchObject({ exportName: 'N', exportId: 'I' });
    expect(h.fs.reads - before).toBe(0);
  });

  // Review -05: R-4 takes this tab's entries when the read RETURNS, and on the offline path too.
  it('a write made while a read is outstanding is seen by that read when it returns', async () => {
    seed('cloud');
    const d = createFirestoreDriver('u');
    const releaseRead = h.fs.holdReads();
    const read = d.loadPreferences();
    await d.writePreferences([{ path: ['exportName'], value: 'typed while reading' }]);
    releaseRead();
    expect(await read).toMatchObject({ exportName: 'typed while reading', exportId: 'I' });
  });

  it('a read that fails offline still sees this tab\'s pending entries', async () => {
    seed('cloud');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = createFirestoreDriver('u');
    h.fs.setOffline(true); // never read by this client, so the read throws
    await d.writePreferences([{ path: ['exportName'], value: 'typed offline' }, { path: ['projectOrder'], value: ['b', 'a'] }]);
    expect(await d.loadPreferences()).toEqual({ exportName: 'typed offline', projectOrder: ['b', 'a'] });
  });

  // Review -01: the SDK computes a read's snapshot before a setDoc it is handed later and delivers it
  // after, so a read straddling the hand-off saw neither the pending entry nor the stored one.
  it('a read issued before the hand-off and returned after it sees the entry', async () => {
    seed('cloud');
    const d = createFirestoreDriver('u');
    await d.writePreferences([{ path: ['exportName'], value: 'typed' }]);
    const releaseRead = h.fs.holdReads();
    const read = d.loadPreferences();
    const releaseWrite = h.fs.holdWrites();
    d.flushPendingSaves(); // the hand-off: the entry leaves the pending list for setDoc
    releaseRead();
    expect(await read).toMatchObject({ exportName: 'typed', exportId: 'I' });
    releaseWrite();
    await new Promise(r => setTimeout(r, 0));
    expect(await d.loadPreferences()).toMatchObject({ exportName: 'typed', exportId: 'I' });
  });

  it('entries in flight apply before the pending ones', async () => {
    seed('cloud');
    const d = createFirestoreDriver('u');
    await d.writePreferences([{ path: ['exportName'], value: 'older' }, { path: ['exportId'], value: 'in flight' }]);
    const releaseRead = h.fs.holdReads();
    const read = d.loadPreferences();
    const releaseWrite = h.fs.holdWrites();
    d.flushPendingSaves();
    await d.writePreferences([{ path: ['exportName'], value: 'newer' }]);
    releaseRead();
    expect(await read).toMatchObject({ exportName: 'newer', exportId: 'in flight' });
    releaseWrite();
  });

  it('a write that fails leaves the in-flight list: a later read shows what is stored', async () => {
    seed('cloud');
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const d = createFirestoreDriver('u');
    h.fs.refuseWhen(() => Object.assign(new Error('Missing or insufficient permissions.'), { code: 'permission-denied' }));
    await d.writePreferences([{ path: ['exportName'], value: 'refused' }]);
    const releaseWrite = h.fs.holdWrites();
    d.flushPendingSaves();
    expect(await d.loadPreferences()).toMatchObject({ exportName: 'refused' }); // in flight: shown
    releaseWrite();
    await new Promise(r => setTimeout(r, 0));
    expect(await d.loadPreferences()).toMatchObject({ exportName: 'E', exportId: 'I' });
    expect(cloudDoc()).toEqual(SEED);
  });
});

describe('local driver', () => {
  it('applies entries to the document as stored when the write fires, not when it was queued', () => {
    seed('local');
    storage.writePreferences([{ path: ['exportName'], value: 'mine' }]);
    // another tab writes a different setting in the meantime
    localStorage.setItem('rp:local:preferences', JSON.stringify({ ...SEED, exportId: 'theirs' }));
    storage.flushPendingSaves();
    expect(localDoc()).toMatchObject({ exportName: 'mine', exportId: 'theirs' });
  });

});

describe('the own-property walk (a defence: the refused segments never reach it)', () => {
  it('applyEntries creates a constructor key as an own property and leaves Object untouched', () => {
    const out = applyEntries({ projectPrefs: {} } as Record<string, unknown>, [{ path: ['projectPrefs', 'constructor', 'color'], value: 'x' }]);
    expect(JSON.parse(JSON.stringify(out))).toEqual({ projectPrefs: { constructor: { color: 'x' } } });
    expect((Object as unknown as Record<string, unknown>).color).toBeUndefined();
  });

  it('applyEntries never walks into Object.prototype through a __proto__ segment', () => {
    const out = applyEntries({} as Record<string, unknown>, [{ path: ['__proto__', 'color'], value: 'x' }]);
    expect(({} as Record<string, unknown>).color).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(out, '__proto__')).toBe(true);
  });
});

describe('the removal marker across module graphs (review -08)', () => {
  it('a REMOVE from a second module graph is a removal to the first', async () => {
    seed('cloud');
    vi.resetModules();
    const second = await import('../lib/prefEntries');
    expect(isRemoval(second.REMOVE)).toBe(true);
    const d = createFirestoreDriver('u');
    await d.writePreferences([{ path: ['exportId'], value: second.REMOVE }]);
    d.flushPendingSaves();
    expect('exportId' in (cloudDoc() ?? {})).toBe(false);
    expect(cloudDoc()).toMatchObject({ exportName: 'E' });
  });
});
