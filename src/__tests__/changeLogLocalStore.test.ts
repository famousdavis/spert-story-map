// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
// R73 v0.56.2, R-3 (R102, O48): the local store trims what it writes; memory keeps this session's
// entries; an append no longer drops the oldest entry.
import { describe, it, expect, beforeEach } from 'vitest';
import {
  appendChangeLogEntry, flushPendingSaves, loadProduct, saveProduct, saveProductImmediate,
  saveProductImmediateOrThrow,
} from '../lib/storage';
import { CHANGELOG_MAX_ENTRIES } from '../lib/constants';
import type { Product } from '../types';
import { ALL_KEPT, fileProduct, originKept } from './fixtures/changeLogFiles';

const CAP = CHANGELOG_MAX_ENTRIES;
const rawStored = (id: string) => JSON.parse(localStorage.getItem(`rp:local:product_${id}`) ?? 'null') as Product | null;

beforeEach(() => { localStorage.clear(); });

describe('an append keeps every entry', () => {
  it('a 500-entry log becomes 501, and create stays', () => {
    const p = fileProduct('p1', 'P', CAP);
    const log = appendChangeLogEntry(p, { op: 'add', entity: 'theme', id: 'new' });
    expect(log).toHaveLength(CAP + 1);
    expect(log[0]?.op).toBe('create');
    expect(log[CAP]?.id).toBe('new');
  });
});

describe('each local write trims the stored copy, never the product in memory', () => {
  const writers: Array<[string, (p: Product) => Product]> = [
    ['saveProduct (debounced)', p => { const r = saveProduct(p); flushPendingSaves(); return r; }],
    ['saveProductImmediate', saveProductImmediate],
    ['saveProductImmediateOrThrow', saveProductImmediateOrThrow],
  ];
  for (const [name, write] of writers) {
    it(name, () => {
      const p = fileProduct('p1', 'P', 800);
      const memory = structuredClone(p._changeLog);
      const returned = write(p);
      expect(p._changeLog).toEqual(memory);
      expect(returned._changeLog).toHaveLength(800);
      const stored = rawStored('p1');
      expect(stored?._changeLog?.length).toBeLessThanOrEqual(CAP);
      expect(originKept(stored?._changeLog)).toEqual(ALL_KEPT);
      expect(stored?._changeLog?.some(e => e.op === 'compact')).toBe(true);
      // a reload reads what was stored
      expect(loadProduct('p1')?._changeLog).toEqual(stored?._changeLog);
    });
  }

  it('a session that appends past 500 keeps every entry in memory and 500 in the store', () => {
    let p = fileProduct('p1', 'P', CAP);
    saveProductImmediate(p);
    for (let i = 0; i < 30; i++) {
      p = { ...p, _changeLog: appendChangeLogEntry(p, { op: 'add', entity: 'rib', id: `n${i}` }) };
      saveProduct(p);
    }
    flushPendingSaves();
    expect(p._changeLog).toHaveLength(CAP + 30);
    const reloaded = loadProduct('p1');
    expect(reloaded?._changeLog).toHaveLength(CAP);
    expect(originKept(reloaded?._changeLog)).toEqual(ALL_KEPT);
    expect(reloaded?._changeLog?.[CAP - 1]?.id).toBe('n29');
  });
});
