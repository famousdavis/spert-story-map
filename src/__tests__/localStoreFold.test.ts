// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
//
// v0.56.1 (R71, R-3): the fold that moves a signed-in person's products, kept by an earlier version in
// rp:{uid}, into rp:local. Over the real storage module and real localStorage (jsdom).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { foldOwnProducts, foldLocalStore } from '../lib/localStoreFold';
import { foldCopyId } from '../lib/foldCopyId';
import * as storage from '../lib/storage';
import { AI_SESSION_KEY_PREFIX } from '../lib/aiConstants';
import { getPendingSessionEnds } from '../lib/aiSessionTeardown';
import type { Product } from '../types';

const U = 'uA';
function keep(ns: string, p: Product, indexed = true): void {
  localStorage.setItem(`rp:${ns}:product_${p.id}`, JSON.stringify(p));
  if (!indexed) return;
  const idx = JSON.parse(localStorage.getItem(`rp:${ns}:products_index`) ?? '[]') as unknown[];
  localStorage.setItem(`rp:${ns}:products_index`, JSON.stringify([...idx, { id: p.id, name: p.name, updatedAt: p.updatedAt }]));
}
const listed = () => (JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]') as { name: string }[]).map(e => e.name).sort();
const keys = (ns: string) => Object.keys(localStorage).filter(k => k.startsWith(`rp:${ns}:product_`)).length;
/** A product made in the past: a copy that restamped `createdAt` with the time of the fold cannot match it (review -05, K12). */
function made(name: string): Product {
  const p = { ...storage.createNewProduct(name), createdAt: '2026-01-05T09:30:00.000Z' };
  return { ...p, _changeLog: storage.appendChangeLogEntry(p, { op: 'add', entity: 'theme', id: 't1' }) };
}

beforeEach(() => { localStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('the fold', () => {
  it('moves every rp:{uid} product key, listed in its index or not, and empties rp:{uid}', () => {
    keep(U, made('Indexed'));
    keep(U, made('Not indexed'), false);
    const out = foldOwnProducts(U);
    expect(out).toEqual({ moved: 2, copies: 0, unreadable: 0, stopped: false });
    expect(listed()).toEqual(['Indexed', 'Not indexed']);
    expect({ local: keys('local'), uid: keys(U), index: localStorage.getItem(`rp:${U}:products_index`) }).toEqual({ local: 2, uid: 0, index: null });
  });

  for (const at of [1, 2, 3, 4]) {
    it(`a fold interrupted at its write #${at}, then run again: listed once, one rp:local key, nothing left in rp:{uid}`, () => {
      keep(U, made('Lab 3'));
      let n = 0;
      const setItem = Storage.prototype.setItem;
      const removeItem = Storage.prototype.removeItem;
      const fail = () => { if (++n === at) throw new DOMException('full', 'QuotaExceededError'); };
      const s = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) { fail(); setItem.call(this, k, v); });
      const r = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, k: string) { fail(); removeItem.call(this, k); });
      expect(foldOwnProducts(U).stopped).toBe(true);
      s.mockRestore(); r.mockRestore();
      foldOwnProducts(U);
      expect({ listed: listed(), local: keys('local'), uid: keys(U) }).toEqual({ listed: ['Lab 3'], local: 1, uid: 0 });
    });
  }

  // Two tabs folding at once, modelled by starting the second fold from inside the first, at the
  // moment the first writes its copy. The fold is synchronous, so two calls made one after the other
  // in one tab never overlap whatever the lock does. Without the lock the second fold finds the
  // source still there and mints a second copy.
  async function secondFoldStartedInsideFirst(): Promise<void> {
    const p = made('Lab 3');
    keep('local', { ...p, description: 'someone else’s copy' });
    keep(U, p);
    let second: Promise<unknown> | null = null;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      setItem.call(this, k, v);
      if (!second && k.startsWith('rp:local:product_') && k !== `rp:local:product_${p.id}`) second = foldLocalStore(U);
    });
    const first = await foldLocalStore(U);
    const other = await second;
    expect({ first, other }).toEqual({ first: { moved: 1, copies: 1, unreadable: 0, stopped: false }, other: { moved: 0, copies: 0, unreadable: 0, stopped: false } });
    expect({ listed: listed(), local: keys('local'), uid: keys(U) }).toEqual({ listed: ['Lab 3', 'Lab 3 (Copy)'], local: 2, uid: 0 });
  }

  it('a second fold started while the first runs waits for the Web Lock: one copy, not two', async () => {
    let chain: Promise<unknown> = Promise.resolve();
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: {
        // Exclusive: each callback starts only after the one before it has finished.
        request: (_name: string, cb: () => unknown) => {
          const run = chain.then(() => cb());
          chain = run.catch(() => {});
          return run;
        },
      },
    });
    await secondFoldStartedInsideFirst();
  });

  it('without Web Locks, a second fold started while the first runs waits for the timestamp lock: one copy, not two', async () => {
    expect((navigator as Navigator & { locks?: unknown }).locks).toBeUndefined(); // jsdom has none: the fallback runs
    await secondFoldStartedInsideFirst();
    expect(localStorage.getItem('_rp:local-fold-in-progress')).toBeNull();
  });

  // The copy branch's writes: #1 the copy, #2 its index entry, #3 removing the source key, #4 removing
  // the source's index entry. #3 models a stop between listing the copy and removing its source (a
  // full store cannot cause it: removeItem never fails for space; a tab closed there can).
  for (const at of [1, 2, 3, 4]) {
    it(`a fold interrupted at the copy branch’s write #${at}, then run again: one copy, listed once`, () => {
      const p = made('Lab 3');
      keep('local', { ...p, description: 'someone else’s copy' });
      keep(U, p);
      let n = 0;
      const setItem = Storage.prototype.setItem;
      const removeItem = Storage.prototype.removeItem;
      const fail = () => { if (++n === at) throw new DOMException('full', 'QuotaExceededError'); };
      const s = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) { fail(); setItem.call(this, k, v); });
      const r = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, k: string) { fail(); removeItem.call(this, k); });
      expect(foldOwnProducts(U).stopped).toBe(true);
      s.mockRestore(); r.mockRestore();
      foldOwnProducts(U);
      expect({ listed: listed(), local: keys('local'), uid: keys(U) }).toEqual({ listed: ['Lab 3', 'Lab 3 (Copy)'], local: 2, uid: 0 });
    });
  }

  it('a copy edited in rp:local after a fold stopped before removing its source: the next fold keeps both, under another id', () => {
    const p = made('Lab 3');
    keep('local', { ...p, description: 'someone else’s copy' });
    keep(U, p);
    let n = 0;
    const removeItem = Storage.prototype.removeItem;
    const r = vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(function (this: Storage, k: string) {
      if (k === `rp:${U}:product_${p.id}` && ++n === 1) throw new DOMException('stop', 'QuotaExceededError');
      removeItem.call(this, k);
    });
    expect(foldOwnProducts(U).stopped).toBe(true);
    r.mockRestore();
    const copyId = (JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]') as { id: string; name: string }[]).find(e => e.name === 'Lab 3 (Copy)')?.id ?? '';
    const copy = storage.loadProduct(copyId) as Product;
    storage.saveProductImmediate({ ...copy, description: 'edited here' });
    foldOwnProducts(U);
    expect({ listed: listed(), local: keys('local'), uid: keys(U) }).toEqual({ listed: ['Lab 3', 'Lab 3 (Copy 2)', 'Lab 3 (Copy)'], local: 3, uid: 0 });
    expect((storage.loadProduct(copyId) as Product).description).toBe('edited here');
  });

  it('the copy id is derived from the uid, the source id and the source text, and reads as a UUID', () => {
    const a = foldCopyId(U, 'p1', '{"x":1}');
    expect(a).toBe(foldCopyId(U, 'p1', '{"x":1}'));
    expect(new Set([a, foldCopyId('uB', 'p1', '{"x":1}'), foldCopyId(U, 'p2', '{"x":1}'), foldCopyId(U, 'p1', '{"x":2}')]).size).toBe(4);
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  });

  it('an index write this tab has pending when the fold runs cannot drop the folded entry', () => {
    vi.useFakeTimers();
    const mine = storage.createNewProduct('Signed-out work');
    storage.saveProductImmediate(mine);
    keep(U, made('Folded'));
    storage.saveProduct({ ...mine, description: 'typed' }); // index written 100 ms later
    foldOwnProducts(U);
    vi.advanceTimersByTime(500);
    expect(listed()).toEqual(['Folded', 'Signed-out work']);
  });

  it('another tab’s index write, read before the fold and landing after it, does not hide a moved product: the next fold lists it', () => {
    keep('local', made('Signed-out work'));
    const stale = localStorage.getItem('rp:local:products_index') ?? '[]';
    const p = made('Made signed in');
    keep(U, p);
    foldOwnProducts(U);
    localStorage.setItem('rp:local:products_index', stale); // the other tab's debounced index write lands
    expect(listed()).toEqual(['Signed-out work']);
    foldOwnProducts(U);
    expect({ listed: listed(), local: keys('local'), uid: keys(U) }).toEqual({ listed: ['Made signed in', 'Signed-out work'], local: 2, uid: 0 });
  });

  it('an unlisted rp:local key that cannot be read is left unlisted', () => {
    localStorage.setItem('rp:local:product_bad', '{not json');
    keep(U, made('Good'));
    foldOwnProducts(U);
    expect(listed()).toEqual(['Good']);
    expect(localStorage.getItem('rp:local:product_bad')).toBe('{not json');
  });

  it('an identical copy already in rp:local (moved, never listed) is listed and the source removed, with no copy', () => {
    const p = made('Lab 3');
    keep(U, p);
    keep('local', p, false);
    expect(foldOwnProducts(U)).toEqual({ moved: 1, copies: 0, unreadable: 0, stopped: false });
    expect({ listed: listed(), local: keys('local'), uid: keys(U) }).toEqual({ listed: ['Lab 3'], local: 1, uid: 0 });
  });

  it('any difference keeps both: a rename made in rp:local after a fold, then an older tab’s write to rp:{uid}', () => {
    const p = made('Lab 3');
    keep(U, p);
    foldOwnProducts(U);
    const here = storage.loadProduct(p.id) as Product;
    storage.saveProductImmediate({ ...here, name: 'Lab 3 (renamed here)' });
    keep(U, { ...p, description: 'edited in the older tab' });
    const out = foldOwnProducts(U);
    expect(out).toEqual({ moved: 1, copies: 1, unreadable: 0, stopped: false });
    expect(listed()).toEqual(['Lab 3 (Copy)', 'Lab 3 (renamed here)']);
    const index = JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]') as { id: string; name: string }[];
    const copyId = index.find(e => e.name === 'Lab 3 (Copy)')?.id ?? '';
    const copy = storage.loadProduct(copyId) as Product;
    expect(copyId).not.toBe(p.id);
    expect({ id: copy.id, d: copy.description, o: copy._originRef, c: copy.createdAt, log: copy._changeLog })
      .toEqual({ id: copyId, d: 'edited in the older tab', o: p._originRef, c: p.createdAt, log: p._changeLog });
    expect((storage.loadProduct(p.id) as Product).name).toBe('Lab 3 (renamed here)');
  });

  it('a product it cannot read is set aside unchanged, reported once, never moved; the rest move', () => {
    localStorage.setItem(`rp:${U}:product_bad`, '{not json');
    keep(U, made('Good'));
    expect(foldOwnProducts(U)).toEqual({ moved: 1, copies: 0, unreadable: 1, stopped: false });
    expect(localStorage.getItem(`rp:${U}:unreadable_product_bad`)).toBe('{not json');
    expect(localStorage.getItem(`rp:${U}:product_bad`)).toBeNull();
    expect(listed()).toEqual(['Good']);
    expect(foldOwnProducts(U)).toEqual({ moved: 0, copies: 0, unreadable: 0, stopped: false });
    expect(localStorage.getItem(`rp:${U}:unreadable_product_bad`)).toBe('{not json');
  });

  it('a second unreadable product with the same id is set aside beside the first, not over it', () => {
    localStorage.setItem(`rp:${U}:product_bad`, '{first');
    foldOwnProducts(U);
    localStorage.setItem(`rp:${U}:product_bad`, '{second');
    expect(foldOwnProducts(U).unreadable).toBe(1);
    expect([localStorage.getItem(`rp:${U}:unreadable_product_bad`), localStorage.getItem(`rp:${U}:unreadable_product_bad~2`)]).toEqual(['{first', '{second']);
  });

  it('with only a set-aside product, a fold writes no pending save: a setting typed before a driver swap is still cancelled', () => {
    vi.useFakeTimers();
    localStorage.setItem(`rp:${U}:product_bad`, '{not json');
    foldOwnProducts(U); // sets it aside
    storage.writePreferences([{ path: ['exportName'], value: 'typed' }], 'local');
    foldOwnProducts(U);
    expect(JSON.parse(localStorage.getItem('rp:local:preferences') ?? '{}').exportName).toBeUndefined();
    storage.cancelPendingSaves();
  });

  it('a write that fails stops the fold without throwing, and leaves the rest in rp:{uid}', async () => {
    keep(U, made('First'));
    keep(U, made('Second'));
    let products = 0;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      if (k.startsWith('rp:local:product_') && ++products === 2) throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, k, v);
    });
    const out = await foldLocalStore(U);
    expect(out).toEqual({ moved: 1, copies: 0, unreadable: 0, stopped: true });
    expect({ local: keys('local'), uid: keys(U), listed: listed().length }).toEqual({ local: 1, uid: 1, listed: 1 });
  });

  it('another uid’s store is untouched', () => {
    keep(U, made('Mine'));
    keep('uB', made('Theirs'));
    foldOwnProducts(U);
    expect({ theirs: keys('uB'), listed: listed() }).toEqual({ theirs: 1, listed: ['Mine'] });
    expect(foldOwnProducts('local')).toEqual({ moved: 0, copies: 0, unreadable: 0, stopped: false });
  });

  it('a fold that stops part way still takes the person’s colour and order to the copies it made (review -05, K27)', () => {
    const p = made('Lab 3');
    const q = made('Lab 4');
    keep('local', { ...p, description: 'someone else’s copy' });
    keep('local', { ...q, description: 'someone else’s copy' });
    keep(U, p);
    keep(U, q);
    localStorage.setItem(`rp:${U}:preferences`, JSON.stringify({ projectOrder: [p.id, q.id], projectPrefs: { [p.id]: { color: 'rose' }, [q.id]: { color: 'teal' } } }));
    let copiesWritten = 0;
    const setItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, k: string, v: string) {
      const copy = k.startsWith('rp:local:product_') && k !== `rp:local:product_${p.id}` && k !== `rp:local:product_${q.id}`;
      if (copy && ++copiesWritten === 2) throw new DOMException('full', 'QuotaExceededError');
      setItem.call(this, k, v);
    });
    expect(foldOwnProducts(U)).toEqual({ moved: 1, copies: 1, unreadable: 0, stopped: true });
    const index = JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]') as { id: string; name: string }[];
    const to = index.find(e => e.name === 'Lab 3 (Copy)')?.id ?? 'no copy';
    expect(JSON.parse(localStorage.getItem(`rp:${U}:preferences`) ?? '{}')).toEqual({
      projectOrder: [to, q.id], projectPrefs: { [to]: { color: 'rose' }, [q.id]: { color: 'teal' } },
    });
  });

  it('a copy under a fresh id takes the person’s tile order, colour and archive with it; the old id’s AI record is ended', async () => {
    const p = made('Lab 3');
    const q = made('Other');
    keep('local', { ...p, description: 'someone else’s copy' });
    keep(U, p);
    keep(U, q);
    localStorage.setItem(`rp:${U}:preferences`, JSON.stringify({ exportName: 'Ben', projectOrder: [q.id, p.id], projectPrefs: { [p.id]: { color: 'rose', archived: true } } }));
    localStorage.setItem(AI_SESSION_KEY_PREFIX + p.id, JSON.stringify({ sessionId: 's-old', productName: 'Lab 3', startedAt: 1 }));
    foldOwnProducts(U);
    const index = JSON.parse(localStorage.getItem('rp:local:products_index') ?? '[]') as { id: string; name: string }[];
    const to = index.find(e => e.name === 'Lab 3 (Copy)')?.id;
    expect(to).toBeTruthy();
    expect(JSON.parse(localStorage.getItem(`rp:${U}:preferences`) ?? '{}')).toEqual({
      exportName: 'Ben', projectOrder: [q.id, to], projectPrefs: { [to as string]: { color: 'rose', archived: true } },
    });
    expect(localStorage.getItem(AI_SESSION_KEY_PREFIX + p.id)).toBeNull();
    await new Promise(r => setTimeout(r, 0));
    expect(getPendingSessionEnds()).toContain('s-old'); // no Firebase in this test: the server end is parked for retry
  });
});
