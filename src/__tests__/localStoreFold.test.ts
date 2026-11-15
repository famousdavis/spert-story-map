// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
//
// v0.56.1 (R71, R-3): the fold that moves a signed-in person's products, kept by an earlier version in
// rp:{uid}, into rp:local. Over the real storage module and real localStorage (jsdom).

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { foldOwnProducts, foldLocalStore } from '../lib/localStoreFold';
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
function made(name: string): Product {
  const p = storage.createNewProduct(name);
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

  it('two folds started together run one after the other under the lock: no copy', async () => {
    let chain = Promise.resolve();
    let inside = 0;
    let overlap = false;
    vi.stubGlobal('navigator', {
      ...navigator,
      locks: {
        request: (_name: string, cb: () => unknown) => {
          const run = chain.then(async () => {
            inside++; if (inside > 1) overlap = true;
            try { await cb(); } finally { inside--; }
          });
          chain = run.catch(() => {});
          return run;
        },
      },
    });
    keep(U, made('Lab 3'));
    keep(U, made('Lab 4'));
    const [a, b] = await Promise.all([foldLocalStore(U), foldLocalStore(U)]);
    expect(overlap).toBe(false);
    expect(a.moved + b.moved).toBe(2);
    expect({ listed: listed(), local: keys('local'), uid: keys(U) }).toEqual({ listed: ['Lab 3', 'Lab 4'], local: 2, uid: 0 });
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

  it('a product it cannot read is skipped and left in rp:{uid}; the rest move', () => {
    localStorage.setItem(`rp:${U}:product_bad`, '{not json');
    keep(U, made('Good'));
    expect(foldOwnProducts(U)).toEqual({ moved: 1, copies: 0, unreadable: 1, stopped: false });
    expect(localStorage.getItem(`rp:${U}:product_bad`)).toBe('{not json');
    expect(listed()).toEqual(['Good']);
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
