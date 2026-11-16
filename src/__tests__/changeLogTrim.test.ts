// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// R73 v0.56.2, R-1: the one trim rule, unit table. `trimChangeLog` keeps every origin entry and each
// upload unit whole, then the newest entries, with one `compact` marker per removed stretch.
import { describe, it, expect } from 'vitest';
import { trimChangeLog } from '../lib/changeLogTrim';
import { validateProduct } from '../lib/validateProduct';
import { guardCloudProduct } from '../lib/cloudLoadGuard';
import type { ChangeLogEntry } from '../types';

type E = Record<string, unknown>;
const T0 = 1_700_000_000;
let n = 0;
const at = (op: string, extra: E = {}): E => ({ t: T0 + n, op, seq: `s${n++}`, ...extra });
const edit = (): E => at('add', { entity: 'rib', id: `r${n}` });
const create = (): E => at('create', { entity: 'product' });
const imported = (): E => at('import', { entity: 'product', source: 'file' });
const copied = (): E => at('duplicate', { entity: 'product', source: 'p0' });
const upload = (): E => at('cloud-migration', { uid: 'u1', source: 'p0' });
const ribClone = (): E => at('duplicate', { entity: 'rib', id: `c${n}`, source: 'r1' });
const edits = (k: number): E[] => Array.from({ length: k }, edit);

const isMarker = (e: unknown) => (e as E)?.op === 'compact';
const markers = (log: unknown[]) => log.filter(isMarker) as E[];
const noAdjacentMarkers = (log: unknown[]) => log.every((e, i) => !(isMarker(e) && isMarker(log[i + 1])));
/** Entries a log stands for: each kept entry once, each marker its count. */
const represented = (log: unknown[]) =>
  log.reduce<number>((sum, e) => sum + (isMarker(e) ? Number((e as E).source) : 1), 0);

describe('trimChangeLog: at or under the cap', () => {
  it('returns the same array, untouched', () => {
    for (const len of [0, 3, 499, 500]) {
      const log = edits(len);
      expect(trimChangeLog(log, 500)).toBe(log);
    }
  });

  it('a cap that is not a finite number trims nothing; a non-list comes back as it is', () => {
    const log = edits(10);
    expect(trimChangeLog(log, Number.NaN)).toBe(log);
    expect(trimChangeLog(log, Infinity)).toBe(log);
    expect(trimChangeLog('x' as unknown as E[], 2)).toBe('x');
  });

  it('a cap below 3 keeps the last entries and adds no marker', () => {
    const log = edits(10);
    expect(trimChangeLog(log, 2)).toEqual(log.slice(8));
    expect(trimChangeLog(log, 1)).toEqual(log.slice(9));
    expect(trimChangeLog(log, 0)).toEqual([]);
  });
});

describe('trimChangeLog: origin entries survive at every length', () => {
  for (const len of [501, 5_000, 50_000]) {
    it(`create, import, copy and the upload unit at ${len}`, () => {
      const c = create();
      const head = edits(Math.floor(len / 10));
      const imp = imported();
      const mid = edits(Math.floor(len / 10));
      const dup = copied();
      const pred = edit();
      const up = upload();
      const log: E[] = [c, ...head, imp, ...mid, dup, pred, up];
      log.push(...edits(len - log.length));
      const out = trimChangeLog(log, 500);
      expect(out).toHaveLength(500);
      for (const kept of [c, imp, dup, pred, up]) expect(out).toContain(kept);
      expect(out[out.indexOf(up) - 1]).toBe(pred);
      // the newest entries are kept, and the log ends with the newest one
      expect(out.slice(-400)).toEqual(log.slice(-400));
      expect(noAdjacentMarkers(out)).toBe(true);
      expect(represented(out)).toBe(len);
    });
  }
});

describe('trimChangeLog: rib clones are ordinary edits', () => {
  for (let rate = 2; rate <= 25; rate++) {
    it(`one rib clone in ${rate}: create, import, the upload unit and the newest entries kept`, () => {
      const c = create();
      const imp = imported();
      const pred = edit();
      const up = upload();
      const log: E[] = [c, ...edits(300), imp, ...edits(300), pred, up];
      while (log.length < 5_000) log.push(log.length % rate === 0 ? ribClone() : edit());
      const out = trimChangeLog(log, 500);
      expect(out.length).toBeLessThanOrEqual(500);
      expect(out).toContain(c);
      expect(out).toContain(imp);
      expect(out[out.indexOf(up) - 1]).toBe(pred);
      expect(out.slice(-450)).toEqual(log.slice(-450));
      expect(represented(out)).toBe(5_000);
    });
  }

  it('import and duplicate with another entity are not kept for their op', () => {
    const ribImport = at('import', { entity: 'rib' });
    const noEntity = at('duplicate');
    const log: E[] = [create(), ribImport, noEntity, ...edits(600)];
    const out = trimChangeLog(log, 500);
    expect(out).not.toContain(ribImport);
    expect(out).not.toContain(noEntity);
  });
});

describe('trimChangeLog: upload units', () => {
  it('an origin entry just before an upload is in its unit; a run of uploads is one unit', () => {
    const imp = imported();
    const up1 = upload();
    const up2 = upload();
    const log: E[] = [create(), ...edits(300), imp, up1, up2, ...edits(700)];
    const out = trimChangeLog(log, 500);
    const at1 = out.indexOf(up1);
    expect(out.slice(at1 - 1, at1 + 2)).toEqual([imp, up1, up2]);
  });

  it('an upload just after a marker is a unit on its own: the marker is not kept for it', () => {
    const oldMarker: E = { t: T0, op: 'compact', entity: 'product', id: String(T0), source: '7', seq: 'compact:x' };
    const up = upload();
    const log: E[] = [create(), ...edits(50), oldMarker, up, ...edits(600)];
    const out = trimChangeLog(log, 500);
    expect(out).toContain(up);
    expect(isMarker(out[out.indexOf(up) - 1])).toBe(true);
    expect(out).not.toContain(oldMarker); // folded into the stretch with the edits before it
    expect(represented(out)).toBe(represented(log));
  });

  it('origin entries over the cap: the newest upload unit whole, then oldest first, never above the cap', () => {
    const c = create();
    const pred = edit();
    const up = upload();
    const imps: E[] = [];
    const log: E[] = [c, ...edits(50), pred, up];
    for (let i = 0; i < 600; i++) { const imp = imported(); imps.push(imp); log.push(imp, edit()); }
    const out = trimChangeLog(log, 500);
    expect(out.length).toBeLessThanOrEqual(500);
    expect(out[out.indexOf(up) - 1]).toBe(pred);
    expect(out).toContain(c);
    const keptImps = imps.filter(i => out.includes(i));
    expect(keptImps.length).toBeGreaterThan(200);
    // oldest first, stopping at the first that does not fit
    expect(keptImps).toEqual(imps.slice(0, keptImps.length));
    expect(noAdjacentMarkers(out)).toBe(true);
    expect(represented(out)).toBe(represented(log));
  });
});

describe('trimChangeLog: origin entries over the cap, upload unit last', () => {
  // [create, 50 edits, (import, edit) x 600, pred, upload, a late import, 20 edits]. The unit and
  // create take 5 slots; each older import costs 2 (itself and a marker), so 247 fit and the 248th
  // does not. The late import would cost 1, but the trim has stopped by then.
  it('keeps the newest upload unit first, then imports oldest first, and stops at the first that does not fit', () => {
    const c = create();
    const log: E[] = [c, ...edits(50)];
    const imps: E[] = [];
    for (let i = 0; i < 600; i++) { const imp = imported(); imps.push(imp); log.push(imp, edit()); }
    const pred = edit();
    const up = upload();
    const late = imported();
    log.push(pred, up, late, ...edits(20));
    const out = trimChangeLog(log, 500);
    expect(out).toHaveLength(499);
    expect(out[out.indexOf(up) - 1]).toBe(pred);
    expect(out).toContain(c);
    expect(imps.filter(i => out.includes(i))).toEqual(imps.slice(0, 247));
    expect(out).not.toContain(late);
    expect(noAdjacentMarkers(out)).toBe(true);
    expect(represented(out)).toBe(represented(log));
  });
});

describe('trimChangeLog: markers', () => {
  it('one marker per removed stretch, holding the count, the first removed time and the last seq', () => {
    const c = create();
    const older = edits(10);
    const log: E[] = [c, ...older, ...edits(491)];
    const out = trimChangeLog(log, 500);
    expect(out).toHaveLength(500);
    expect(markers(out)).toHaveLength(1);
    // 502 entries into 500 slots, one of them the marker: the three oldest edits go
    expect(out[1]).toEqual({
      t: older[2]!.t, op: 'compact', entity: 'product', id: String(older[0]!.t), source: '3', seq: `compact:${older[2]!.seq}`,
    });
    expect(out[2]).toBe(older[3]);
  });

  it('never adjacent, counts add up, and ten re-trims never nest a seq', () => {
    let log: E[] = [create(), ...edits(200), imported(), ...edits(800), edit(), upload(), ...edits(300)];
    for (let round = 0; round < 10; round++) {
      log = trimChangeLog(log, 500) as E[];
      expect(log.length).toBeLessThanOrEqual(500);
      expect(noAdjacentMarkers(log)).toBe(true);
      for (const m of markers(log)) {
        expect(String(m.seq).startsWith('compact:compact:')).toBe(false);
        expect(String(m.seq).length).toBeLessThanOrEqual(128);
      }
      log = [...log, ...edits(120)];
    }
    const total = 1 + 200 + 1 + 800 + 2 + 300 + 10 * 120;
    expect(represented(log)).toBe(total);
  });

  it('trimming a trimmed log gives it back; the same input gives the same output', () => {
    const log: E[] = [create(), ...edits(3_000), imported(), ...edits(900)];
    const once = trimChangeLog(structuredClone(log), 500);
    expect(trimChangeLog(once, 500)).toBe(once);
    expect(trimChangeLog(structuredClone(log), 500)).toEqual(once);
    const grown = [...once, ...edits(50)];
    expect(trimChangeLog(structuredClone(grown), 500)).toEqual(trimChangeLog(structuredClone(grown), 500));
  });

  it('a stretch of markers folds into one: summed count, earliest id, the last marker\'s t and seq', () => {
    const m1: E = { t: T0 + 5, op: 'compact', entity: 'product', id: String(T0 + 1), source: '10', seq: 'compact:a' };
    const m2: E = { t: T0 + 9, op: 'compact', entity: 'product', id: String(T0 + 6), source: 'junk', seq: 'compact:b' };
    const log: E[] = [create(), m1, m2, ...edits(4)];
    const out = trimChangeLog(log, 6);
    expect(out[1]).toEqual({ t: T0 + 9, op: 'compact', entity: 'product', id: String(T0 + 1), source: '11', seq: 'compact:b' });
    expect(out).toHaveLength(6);
  });

  it('a stretch that is exactly one existing marker keeps it unchanged', () => {
    const m: E = { t: T0, op: 'compact', entity: 'product', id: String(T0), source: '3', seq: 'compact:z' };
    const c = create();
    const log: E[] = [c, m, ...edits(10)];
    const out = trimChangeLog(log, 8);
    expect(out[1]).not.toBe(m); // the newest fill never keeps a marker: it joins the edits after it
    expect(noAdjacentMarkers(out)).toBe(true);
    const lone: E[] = [create(), m, imported(), ...edits(10)];
    const kept = trimChangeLog(lone, 8);
    expect(kept[1]).toBe(m);
  });

  it('a 128-character seq never makes a marker seq over 128', () => {
    const long = (): E => ({ ...edit(), seq: 'q'.repeat(128) });
    const log: E[] = [create(), ...Array.from({ length: 700 }, long)];
    const out = trimChangeLog(log, 500);
    for (const m of markers(out)) expect(String(m.seq).length).toBe(128);
  });

  it('non-objects and entries without an op are removed like any other entry, and counted', () => {
    const odd: unknown[] = ['text', null, 7, { t: T0, entity: 'product' }, [1]];
    const log: unknown[] = [create(), ...odd, ...edits(20)];
    const out = trimChangeLog(log, 10);
    for (const o of odd) expect(out).not.toContain(o);
    expect(out).toHaveLength(10);
    expect(represented(out)).toBe(log.length);
  });

  it('fuzz: never above the cap, never two markers side by side, counts add up', () => {
    let seed = 7;
    const rand = () => { seed = (seed * 1_103_515_245 + 12_345) % 2_147_483_648; return seed / 2_147_483_648; };
    const kinds = [edit, edit, edit, edit, ribClone, imported, upload, copied];
    for (let round = 0; round < 300; round++) {
      const cap = 3 + Math.floor(rand() * 40);
      const log: E[] = [create()];
      const len = Math.floor(rand() * 120);
      for (let i = 0; i < len; i++) {
        log.push(rand() < 0.05
          ? { t: T0, op: 'compact', entity: 'product', id: String(T0), source: '2', seq: 'compact:f' }
          : kinds[Math.floor(rand() * kinds.length)]!());
      }
      const out = trimChangeLog(log, cap);
      if (log.length <= cap) { expect(out).toBe(log); continue; }
      expect(out.length).toBeLessThanOrEqual(cap);
      expect(noAdjacentMarkers(out)).toBe(true);
      expect(represented(out)).toBe(represented(log));
    }
  });
});

describe('trimChangeLog: three cases the first tests could not see (review Opus-PR247-1-05)', () => {
  it('a removed stretch that ends in an existing marker takes its seq from its last removed entry, never the marker', () => {
    const c = create();
    const e = edit();
    const old: E = { t: T0, op: 'compact', entity: 'product', id: String(T0), source: '4', seq: 'compact:old' };
    const imp = imported();
    const log: E[] = [c, e, old, imp, ...edits(600)];
    const out = trimChangeLog(log, 500);
    expect(out[0]).toBe(c);
    expect(out[2]).toBe(imp);
    expect(out[1]).toMatchObject({ op: 'compact', source: '5', seq: `compact:${String(e.seq)}` });
  });

  it('a marker seq cut to 128 characters keeps its compact: prefix', () => {
    const long = (): E => ({ ...edit(), seq: 'q'.repeat(128) });
    const out = trimChangeLog([create(), ...Array.from({ length: 700 }, long)], 500);
    const [m] = markers(out);
    expect(m?.seq).toBe(`compact:${'q'.repeat(120)}`);
  });

  // [create, import, upload, (product copy, edit) x 600], cap 500: protected entries alone overflow. The
  // import just before the upload is in the upload's unit, so it is counted once: create, the unit and
  // the first copy take 4, each later copy 2 (itself and a marker), the trailing marker 1, so 248 copies.
  it('rule 4: an origin entry just before an upload is counted once, in its unit', () => {
    const c = create();
    const imp = imported();
    const up = upload();
    const log: E[] = [c, imp, up];
    const copies: E[] = [];
    for (let i = 0; i < 600; i++) { const cp = copied(); copies.push(cp); log.push(cp, edit()); }
    const out = trimChangeLog(log, 500);
    expect(out.slice(0, 3)).toEqual([c, imp, up]);
    expect(out.filter(x => x === imp)).toHaveLength(1);
    expect(copies.filter(x => out.includes(x))).toEqual(copies.slice(0, 248));
    expect(out).toHaveLength(499);
    expect(noAdjacentMarkers(out)).toBe(true);
    expect(represented(out)).toBe(represented(log));
  });
});

describe('trimChangeLog: a marker is a valid entry everywhere', () => {
  it('passes validateProduct with every field, and guardCloudProduct reports nothing', () => {
    const log = trimChangeLog([create(), ...edits(800)], 500) as ChangeLogEntry[];
    const [m] = markers(log);
    const product = {
      id: 'p1', name: 'P', description: '', createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z', schemaVersion: 2, sizeMapping: [], releases: [],
      sprints: [], themes: [], _changeLog: log,
    };
    const valid = validateProduct(structuredClone(product));
    expect(valid._changeLog?.[1]).toEqual(m);
    expect(guardCloudProduct(structuredClone(product))).toEqual([]);
  });

  it('a bad timestamp in a removed stretch still refuses the file', () => {
    const bad: E = { ...edit(), t: -5 };
    const log: E[] = [create(), bad, ...edits(700)];
    const product = {
      id: 'p1', name: 'P', description: '', createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z', schemaVersion: 2, sizeMapping: [], releases: [],
      sprints: [], themes: [], _changeLog: log,
    };
    expect(() => validateProduct(product)).toThrow('Changelog entry timestamp must be a valid Unix timestamp');
  });
});
