// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/** v0.55.15 (R72): the clear after an upload removes only the products that upload sent. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { removeLocalProducts, saveProductIndex, saveProduct } from '../lib/storage';

const index = (ns: string) => JSON.parse(localStorage.getItem(`rp:${ns}:products_index`) ?? '[]').map((e: { id: string }) => e.id);
const seed = (ns: string, ids: string[]) => {
  localStorage.setItem(`rp:${ns}:products_index`, JSON.stringify(ids.map(id => ({ id, name: id }))));
  for (const id of ids) localStorage.setItem(`rp:${ns}:product_${id}`, JSON.stringify({ id, name: id }));
};
afterEach(() => { vi.useRealTimers(); localStorage.clear(); });

describe('removeLocalProducts', () => {
  it('removes the named products and their index entries, keeping the rest in order, in that namespace only', () => {
    seed('local', ['a', 'b', 'c']);
    seed('u', ['b']);
    removeLocalProducts(['b', 'missing'], 'local');
    expect(index('local')).toEqual(['a', 'c']);
    expect(localStorage.getItem('rp:local:product_b')).toBeNull();
    expect(localStorage.getItem('rp:local:product_a')).not.toBeNull();
    expect(index('u')).toEqual(['b']);
  });

  it('a write not yet made cannot bring a removed product back, and a pending index is the one filtered', () => {
    vi.useFakeTimers();
    seed('local', ['a', 'b']);
    saveProduct({ id: 'b', name: 'b edited' } as never);
    saveProductIndex([{ id: 'a', name: 'a renamed' }, { id: 'b', name: 'b' }], 'local');
    removeLocalProducts(['b'], 'local');
    vi.runAllTimers();
    expect(localStorage.getItem('rp:local:product_b')).toBeNull();
    expect(JSON.parse(localStorage.getItem('rp:local:products_index')!)).toEqual([{ id: 'a', name: 'a renamed' }]);
  });
});
