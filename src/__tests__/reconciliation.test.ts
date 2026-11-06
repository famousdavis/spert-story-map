// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { getReconciliationRows, getStrandedRows } from '../lib/reconciliation';
import type { ReconciliationKind } from '../lib/reconciliation';
import type { Product, ReleaseAllocation, RibItem } from '../types';
import { entry, makeProduct, makeRib } from './fixtures/progressIntegrity';

const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });
const kinds = (rows: { kind: ReconciliationKind }[]) => rows.map(r => r.kind);
const nonCore = (rib: RibItem): RibItem => ({ ...rib, category: 'non-core' });

describe('getReconciliationRows', () => {
  it('is only the total when the releases add up', () => {
    const rows = getReconciliationRows(makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 25)])]));
    expect(kinds(rows)).toEqual(['total']);
    expect(rows[0]).toMatchObject({ points: 40, core: 40, nonCore: 0, completed: 10, percentComplete: 25, remaining: 30 });
  });

  it('adds Unallocated for a partial allocation and a parked rib, split by category', () => {
    const rows = getReconciliationRows(makeProduct([
      makeRib('r', [on('R1', 60)], []),
      nonCore(makeRib('s', [], [], 'M')),
    ]));
    expect(kinds(rows)).toEqual(['unallocated', 'total']);
    expect(rows[0]).toMatchObject({ points: 36, core: 16, nonCore: 20, completed: 0, percentComplete: null, remaining: 36 });
  });

  it('gives Over-allocated its negative points, and −(O − V) remaining, not −O', () => {
    const rows = getReconciliationRows(makeProduct([
      makeRib('c', [on('R2'), on('R3', 30)], [entry('S1', 'R2', 90), entry('S1', 'R3', 30)], 'M'),
    ]), 'S1');
    expect(kinds(rows)).toEqual(['over-allocated', 'total']);
    // O = 6. Shares 120, completion 100, so V = 4.
    const over = rows[0];
    expect(over?.points).toBeCloseTo(-6);
    expect(over?.completed).toBeCloseTo(-4);
    expect(over?.remaining).toBeCloseTo(-2);
    expect(over?.percentComplete).toBeNull();
    expect(over?.core).toBeCloseTo(-6);
    expect(over?.nonCore).toBeCloseTo(0);
    expect(over?.label).toBe('Over-allocated');
  });

  it('gives Over-allocated its negative non-core points too', () => {
    const rows = getReconciliationRows(makeProduct([nonCore(makeRib('c', [on('R2'), on('R3', 30)], [], 'M'))]));
    expect(rows[0]?.nonCore).toBeCloseTo(-6);
    expect(rows[0]?.core).toBeCloseTo(0);
  });

  it('splits an unknown release by category', () => {
    const rows = getReconciliationRows(makeProduct([nonCore(makeRib('r', [on('GONE', 50), on('LOST', 50)], []))]));
    expect(rows[0]).toMatchObject({ kind: 'unknown-release', core: 0, nonCore: 40 });
  });

  it('adds an Unknown release line for an allocation to a release that no longer exists', () => {
    const rows = getReconciliationRows(makeProduct([makeRib('r', [on('GONE')], [entry('S1', 'GONE', 30)])]));
    expect(kinds(rows)).toEqual(['unknown-release', 'total']);
    expect(rows[0]).toMatchObject({ label: 'Unknown release', points: 40, core: 40, completed: 12, percentComplete: 30, remaining: 28 });
  });

  it('adds several unknown releases into one line', () => {
    const rows = getReconciliationRows(makeProduct([makeRib('r', [on('GONE', 50), on('LOST', 50)], [entry('S1', 'GONE', 10), entry('S1', 'LOST', 30)])]));
    expect(kinds(rows)).toEqual(['unknown-release', 'total']);
    expect(rows[0]).toMatchObject({ points: 40, completed: 16 });
  });

  it('reads the sprint it is given, and the latest with none', () => {
    const product = makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 10), entry('S2', 'R1', 50)])]);
    const total = (rows: ReturnType<typeof getReconciliationRows>) => rows.find(r => r.kind === 'total');
    expect(total(getReconciliationRows(product, 'S1'))?.completed).toBeCloseTo(4);
    expect(total(getReconciliationRows(product))?.completed).toBeCloseTo(20);
  });

  it('has no percentage to divide by in an empty project', () => {
    expect(getReconciliationRows(makeProduct([]))[0]).toMatchObject({ kind: 'total', points: 0, percentComplete: 0 });
  });

  it('gives an unknown release of 0 points a 0 percentage', () => {
    const rows = getReconciliationRows(makeProduct([makeRib('r', [on('GONE', 0)], [])]));
    expect(rows[0]).toMatchObject({ kind: 'unknown-release', points: 0, percentComplete: 0 });
  });
});

describe('getStrandedRows', () => {
  it('names the rib, its backbone, the release, the sprints and what would count', () => {
    const product = makeProduct([makeRib('r', [on('R2')], [entry('S1', 'R1', 10), entry('S2', 'R1', 30)])]);
    expect(getStrandedRows(product)).toEqual([{
      ribId: 'r', ribName: 'r', backboneName: 'B', releaseId: 'R1', releaseName: 'Release R1',
      sprintNames: ['S1', 'S2'], wouldCount: 30,
    }]);
  });

  it('gives one row per (rib, release)', () => {
    const product = makeProduct([
      makeRib('a', [], [entry('S1', 'R1', 10), entry('S1', 'R2', 20)]),
      makeRib('b', [on('R3')], [entry('S1', 'R1', 5)]),
    ]);
    expect(getStrandedRows(product).map(r => [r.ribId, r.releaseId])).toEqual([['a', 'R1'], ['a', 'R2'], ['b', 'R1']]);
  });

  it('does not throw on a hand-edited product with no sprints', () => {
    const product = makeProduct([makeRib('r', [], [entry('S1', 'R1', 10)])]);
    delete (product as Partial<Product>).sprints;
    expect(getStrandedRows(product)).toEqual([]);
  });

  it('is empty when every record counts', () => {
    expect(getStrandedRows(makeProduct([makeRib('r', [on('R1')], [entry('S1', 'R1', 10)])]))).toEqual([]);
  });
});
