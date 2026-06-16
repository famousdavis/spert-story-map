// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import type { Product } from '../types';
import { applyAiOp, applyDrainOps, computeSafePrefix, type AiOpDoc } from '../lib/aiOps';
import {
  addNamedReleaseToProduct,
  allocateRibInProduct,
  sizeRibInProduct,
} from '../hooks/useProductMutations';
import { buildAiSnapshot } from '../lib/aiSnapshot';

function makeProduct(): Product {
  return {
    id: 'p1', name: 'P', description: '',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2, sizeMapping: [], releases: [], sprints: [],
    themes: [], _changeLog: [],
  };
}

const validPayload = {
  themes: [{
    themeId: 't1', name: 'Theme 1',
    backbones: [{
      backboneId: 'b1', name: 'Backbone 1',
      ribs: [
        { ribId: 'r1', name: 'Rib 1' },
        { ribId: 'r2', name: 'Rib 2', category: 'non-core', description: 'd', notes: 'n' },
      ],
    }],
  }],
};

describe('applyAiOp — bulk_import', () => {
  it('builds the full structure', () => {
    const prev = makeProduct();
    const next = applyAiOp(prev, 'bulk_import', validPayload);
    expect(next).not.toBe(prev);
    expect(next.themes.length).toBe(1);
    expect(next.themes[0]?.backboneItems.length).toBe(1);
    expect(next.themes[0]?.backboneItems[0]?.ribItems.length).toBe(2);
    const rib2 = next.themes[0]?.backboneItems[0]?.ribItems[1];
    expect(rib2?.category).toBe('non-core');
    expect(rib2?.notes).toBe('n');
  });

  it('collapses the changelog to exactly one import entry', () => {
    const prev = makeProduct();
    const next = applyAiOp(prev, 'bulk_import', validPayload);
    expect((next._changeLog ?? []).length).toBe((prev._changeLog ?? []).length + 1);
    const log = next._changeLog ?? [];
    const last = log[log.length - 1];
    expect(last?.op).toBe('import');
    expect(last?.entity).toBe('product');
    expect(last?.source).toBe('ai');
  });

  it('is idempotent: re-running with the same IDs is a ref-equal no-op', () => {
    const prev = makeProduct();
    const once = applyAiOp(prev, 'bulk_import', validPayload);
    const twice = applyAiOp(once, 'bulk_import', validPayload);
    expect(twice).toBe(once); // reference equality — no extra import entry
  });

  it('does not throw on malformed payloads (returns prev)', () => {
    const prev = makeProduct();
    expect(applyAiOp(prev, 'bulk_import', { themes: undefined })).toBe(prev);
    expect(applyAiOp(prev, 'bulk_import', { themes: [] })).toBe(prev);
    expect(applyAiOp(prev, 'bulk_import', { themes: [null] })).toBe(prev);
    expect(applyAiOp(prev, 'bulk_import', {})).toBe(prev);
  });
});

describe('applyAiOp — fine-grained ops', () => {
  it('creates theme, backbone, rib in sequence', () => {
    let p = makeProduct();
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    expect(p.themes.length).toBe(1);
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    expect(p.themes[0]?.backboneItems.length).toBe(1);
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' });
    expect(p.themes[0]?.backboneItems[0]?.ribItems.length).toBe(1);
  });

  it('create_rib is idempotent on a duplicate ID', () => {
    let p = makeProduct();
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' });
    const p2 = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R again' });
    expect(p2.themes[0]?.backboneItems[0]?.ribItems.length).toBe(1);
    expect(p2.themes[0]?.backboneItems[0]?.ribItems[0]?.name).toBe('R');
  });

  it('unknown op is a no-op', () => {
    const prev = makeProduct();
    expect(applyAiOp(prev, 'frobnicate', {})).toBe(prev);
  });
});

describe('computeSafePrefix', () => {
  it('returns the full ops array for Phase 1 (all no-throw)', () => {
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'create_theme', payload: { themeId: 't1', name: 'T' } },
      { seq: 2, op: 'bulk_import', payload: validPayload },
    ];
    const { safeOps, nextSeq } = computeSafePrefix(makeProduct(), ops);
    expect(safeOps.length).toBe(ops.length);
    expect(nextSeq).toBe(2);
  });

  it('nextSeq is 0 for an empty ops array', () => {
    const { safeOps, nextSeq } = computeSafePrefix(makeProduct(), []);
    expect(safeOps.length).toBe(0);
    expect(nextSeq).toBe(0);
  });
});

// ── Helper ─────────────────────────────────────────────────────────────────
function makeProductWithContent(): Product {
  let p: Product = {
    ...makeProduct(),
    sizeMapping: [
      { label: 'S', points: 10 },
      { label: 'M', points: 20 },
      { label: 'L', points: 40 },
    ],
  };
  p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'Theme' });
  p = applyAiOp(p, 'create_backbone', {
    themeId: 't1', backboneId: 'b1',
    name: 'Backbone', description: 'Original desc',
  });
  p = applyAiOp(p, 'create_rib', {
    themeId: 't1', backboneId: 'b1', ribId: 'r1',
    name: 'Rib', category: 'core',
  });
  return p;
}

// Module-scope builder for Phase 2 tests.
// Uses addNamedReleaseToProduct (pure, Task 2) for the release,
// and existing Phase 1 applyAiOp calls for structure.
// Must be at module scope — consumed by allocate_rib, unassign_rib, drain,
// and buildAiSnapshot describe blocks.
function makeProductWithRelease(): Product {
  let p = makeProduct();
  p = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1' });
  p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
  p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'Rib' });
  return p;
}

// Module-scope builder for Phase 3 tests.
// IMPORTANT: makeProduct() uses sizeMapping:[] — size_rib calls against it
// no-op via Guard 1 (no valid labels). This matters most for tests that assert
// ref-equal no-ops: the fixture must have a real mapping so Guard 1 is bypassable
// and the rib-walk guards are reachable.
function makeProductWithSizing(): Product {
  const p: Product = {
    ...makeProduct(),
    sizeMapping: [
      { label: 'S', points: 10 },
      { label: 'M', points: 20 },
      { label: 'L', points: 40 },
    ],
  };
  let result = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
  result = applyAiOp(result, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
  result = applyAiOp(result, 'create_rib', {
    themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'Rib',
  });
  return result;
}

/**
 * Two releases + three ribs in varying states for bulk_allocate tests.
 *   r1 — unlocked, unallocated (happy-path)
 *   r2 — locked (skip candidate)
 *   r3 — already allocated to rel-1 (additive-skip candidate)
 */
function makeProductWithReleasesAndRibs(): Product {
  let p = makeProduct();
  p = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1' });
  p = addNamedReleaseToProduct(p, 'rel-2', { name: 'R2' });
  p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
  p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'Rib1' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r2', name: 'Rib2' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r3', name: 'Rib3' });
  // Lock r2 via recorded progress.
  p = { ...p, themes: p.themes.map(t => ({ ...t, backboneItems: t.backboneItems.map(b => ({
    ...b, ribItems: b.ribItems.map(r => r.id !== 'r2' ? r : {
      ...r, progressHistory: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 }],
    }),
  })) })) };
  // Pre-allocate r3 to rel-1.
  return allocateRibInProduct(p, 'r3', 'rel-1');
}

/**
 * sizeMapping {S,M,L} + three ribs in varying states for bulk_size tests.
 *   r1 — unsized, unlocked (happy-path)
 *   r2 — already sized 'M' (Form-B skip candidate)
 *   r3 — locked (skip candidate)
 */
function makeProductWithSizingMultiRib(): Product {
  const base: Product = { ...makeProduct(), sizeMapping: [
    { label: 'S', points: 10 }, { label: 'M', points: 20 }, { label: 'L', points: 40 },
  ] };
  let p = applyAiOp(base, 'create_theme', { themeId: 't1', name: 'T' });
  p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'Rib1' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r2', name: 'Rib2' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r3', name: 'Rib3' });
  p = sizeRibInProduct(p, 'r2', 'M');
  // Lock r3 via recorded progress.
  return { ...p, themes: p.themes.map(t => ({ ...t, backboneItems: t.backboneItems.map(b => ({
    ...b, ribItems: b.ribItems.map(r => r.id !== 'r3' ? r : {
      ...r, progressHistory: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 10 }],
    }),
  })) })) };
}

// ── update_theme ──────────────────────────────────────────────────────────
describe('applyAiOp — update_theme', () => {
  it('updates name and appends a changelog entry', () => {
    const p = makeProductWithContent();
    const next = applyAiOp(p, 'update_theme', { themeId: 't1', name: 'New Theme' });
    expect(next.themes[0]?.name).toBe('New Theme');
    const log = next._changeLog ?? [];
    const last = log[log.length - 1];
    expect(last?.op).toBe('update');
    expect(last?.entity).toBe('theme');
    expect(last?.id).toBe('t1');
    expect(last?.source).toBe('ai');
  });
  it('is ref-equal no-op when themeId does not match', () => {
    const p = makeProductWithContent();
    expect(applyAiOp(p, 'update_theme', { themeId: 'ghost', name: 'X' })).toBe(p);
  });
  it('is ref-equal no-op when name is absent', () => {
    const p = makeProductWithContent();
    expect(applyAiOp(p, 'update_theme', { themeId: 't1' })).toBe(p);
  });
});

// ── update_backbone ───────────────────────────────────────────────────────
describe('applyAiOp — update_backbone', () => {
  it('updates name only, preserves description', () => {
    const p = makeProductWithContent();
    const next = applyAiOp(p, 'update_backbone', {
      themeId: 't1', backboneId: 'b1', name: 'New Backbone',
    });
    expect(next.themes[0]?.backboneItems[0]?.name).toBe('New Backbone');
    expect(next.themes[0]?.backboneItems[0]?.description).toBe('Original desc');
  });
  it('updates description only, preserves name', () => {
    const p = makeProductWithContent();
    const next = applyAiOp(p, 'update_backbone', {
      themeId: 't1', backboneId: 'b1', description: 'New desc',
    });
    expect(next.themes[0]?.backboneItems[0]?.name).toBe('Backbone');
    expect(next.themes[0]?.backboneItems[0]?.description).toBe('New desc');
  });
  it('updates both name and description', () => {
    const p = makeProductWithContent();
    const next = applyAiOp(p, 'update_backbone', {
      themeId: 't1', backboneId: 'b1', name: 'N', description: 'D',
    });
    expect(next.themes[0]?.backboneItems[0]?.name).toBe('N');
    expect(next.themes[0]?.backboneItems[0]?.description).toBe('D');
  });
  it('appends a changelog entry', () => {
    const p = makeProductWithContent();
    const next = applyAiOp(p, 'update_backbone', {
      themeId: 't1', backboneId: 'b1', name: 'N',
    });
    const log = next._changeLog ?? [];
    const last = log[log.length - 1];
    expect(last?.op).toBe('update');
    expect(last?.entity).toBe('backbone');
    expect(last?.id).toBe('b1');
    expect(last?.source).toBe('ai');
  });
  it('is ref-equal no-op when no fields provided', () => {
    const p = makeProductWithContent();
    expect(
      applyAiOp(p, 'update_backbone', { themeId: 't1', backboneId: 'b1' })
    ).toBe(p);
  });
  it('is ref-equal no-op when backboneId does not match', () => {
    const p = makeProductWithContent();
    expect(
      applyAiOp(p, 'update_backbone', { themeId: 't1', backboneId: 'ghost', name: 'N' })
    ).toBe(p);
  });
});

// ── update_rib ────────────────────────────────────────────────────────────
describe('applyAiOp — update_rib', () => {
  it('updates name only, other fields unchanged', () => {
    const p = makeProductWithContent();
    const next = applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'New Rib',
    });
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.name).toBe('New Rib');
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.category).toBe('core');
  });
  it('updates size on an unlocked rib', () => {
    const p = makeProductWithContent();
    const next = applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', size: 'M',
    });
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBe('M');
  });
  it('silently ignores size on a locked (in-progress) rib', () => {
    let p = makeProduct();
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    // Inject a rib with progress directly (tests the lock guard, not the
    // progress-recording machinery).
    const ribWithProgress = {
      id: 'r1', name: 'Rib', description: '', order: 1, size: null,
      category: 'core' as const,
      releaseAllocations: [],
      progressHistory: [{ sprintId: 's1', releaseId: 'rel1', percentComplete: 50 }],
    };
    p = {
      ...p,
      themes: p.themes.map(t => ({
        ...t,
        backboneItems: t.backboneItems.map(b => ({
          ...b, ribItems: [...b.ribItems, ribWithProgress],
        })),
      })),
    };
    const next = applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', size: 'L',
    });
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBeNull();
  });
  it('handles missing progressHistory (null guard)', () => {
    // Imported/hand-edited products may have progressHistory absent.
    let p = makeProduct();
    p = { ...p, sizeMapping: [{ label: 'S', points: 10 }] };
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    const ribNoProgress = {
      id: 'r1', name: 'Rib', description: '', order: 1, size: null,
      category: 'core' as const,
      releaseAllocations: [],
      progressHistory: undefined as unknown as [],
    };
    p = {
      ...p,
      themes: p.themes.map(t => ({
        ...t,
        backboneItems: t.backboneItems.map(b => ({
          ...b, ribItems: [...b.ribItems, ribNoProgress],
        })),
      })),
    };
    // Must not throw; size should apply (undefined treated as empty = not locked).
    expect(() =>
      applyAiOp(p, 'update_rib', {
        themeId: 't1', backboneId: 'b1', ribId: 'r1', size: 'S',
      })
    ).not.toThrow();
    const next = applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', size: 'S',
    });
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBe('S');
  });
  it('clears size to null on an unlocked rib', () => {
    const p = makeProductWithContent();
    const sized = applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', size: 'L',
    });
    expect(sized.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBe('L');
    const cleared = applyAiOp(sized, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', size: null,
    });
    expect(cleared.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBeNull();
  });
  it('appends a changelog entry', () => {
    const p = makeProductWithContent();
    const next = applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R',
    });
    const log = next._changeLog ?? [];
    const last = log[log.length - 1];
    expect(last?.op).toBe('update');
    expect(last?.entity).toBe('rib');
    expect(last?.id).toBe('r1');
    expect(last?.source).toBe('ai');
  });
  it('is ref-equal no-op when no fields provided', () => {
    const p = makeProductWithContent();
    expect(
      applyAiOp(p, 'update_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1' })
    ).toBe(p);
  });
  it('is ref-equal no-op when ribId does not match', () => {
    const p = makeProductWithContent();
    expect(
      applyAiOp(p, 'update_rib', {
        themeId: 't1', backboneId: 'b1', ribId: 'ghost', name: 'N',
      })
    ).toBe(p);
  });
  it('drops a size not in sizeMapping while still applying name (Fix 2)', () => {
    // makeProductWithContent has sizeMapping {S,M,L}; 'Bogus' is not a valid label.
    const p = makeProductWithContent();
    const next = applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'New', size: 'Bogus',
    });
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.name).toBe('New');
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBeNull();
  });
  it('null-clear still works when sizeMapping is populated (Fix 2)', () => {
    const p = makeProductWithContent();
    const sized = applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', size: 'M',
    });
    expect(sized.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBe('M');
    const cleared = applyAiOp(sized, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', size: null,
    });
    expect(cleared.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBeNull();
  });
  it('size-only-invalid-label call still produces a changelog entry (accepted wart)', () => {
    // didUpdate fires on rib-ID match before field application, so an invalid-label
    // size-only update still appends a spurious entry and is NOT ref-equal to prev.
    const p = makeProductWithContent();
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', size: 'Bogus',
    });
    expect(next).not.toBe(p);
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBeNull();
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);
  });
});

// ── applyDrainOps ─────────────────────────────────────────────────────────
describe('applyDrainOps', () => {
  it('applies ops in document order and returns final product + nextSeq', () => {
    const p = makeProduct();
    const drainOps: AiOpDoc[] = [
      { seq: 1, op: 'create_theme', payload: { themeId: 't1', name: 'T' } },
      { seq: 2, op: 'create_backbone',
        payload: { themeId: 't1', backboneId: 'b1', name: 'B' } },
      { seq: 3, op: 'create_rib',
        payload: { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' } },
    ];
    const { product: next, nextSeq } = applyDrainOps(p, drainOps);
    expect(nextSeq).toBe(3);
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.name).toBe('R');
  });
  it('recovers ops that were no-ops due to missing preconditions', () => {
    // Simulate: create_theme was in the null window (never applied).
    // create_backbone arrived post-window as a no-op (theme missing).
    const base = makeProduct();
    const afterNoOp = applyAiOp(base, 'create_backbone', {
      themeId: 't1', backboneId: 'b1', name: 'B',
    });
    expect(afterNoOp).toBe(base); // confirmed: no theme t1 → ref-equal no-op
    const { product: drained } = applyDrainOps(afterNoOp, [
      { seq: 1, op: 'create_theme', payload: { themeId: 't1', name: 'T' } },
      { seq: 2, op: 'create_backbone',
        payload: { themeId: 't1', backboneId: 'b1', name: 'B' } },
    ]);
    expect(drained.themes.length).toBe(1);
    expect(drained.themes[0]?.backboneItems[0]?.name).toBe('B');
  });
  it('re-applying already-applied create ops is idempotent', () => {
    let built = makeProduct();
    built = applyAiOp(built, 'create_theme', { themeId: 't1', name: 'T' });
    built = applyAiOp(built, 'create_backbone', {
      themeId: 't1', backboneId: 'b1', name: 'B',
    });
    const { product: drained } = applyDrainOps(built, [
      { seq: 1, op: 'create_theme', payload: { themeId: 't1', name: 'T' } },
      { seq: 2, op: 'create_backbone',
        payload: { themeId: 't1', backboneId: 'b1', name: 'B' } },
    ]);
    expect(drained.themes.length).toBe(1);
    expect(drained.themes[0]?.backboneItems.length).toBe(1);
  });
  it('returns original product ref and nextSeq 0 for an empty ops array', () => {
    const p = makeProduct();
    const { product: next, nextSeq } = applyDrainOps(p, []);
    expect(next).toBe(p);
    expect(nextSeq).toBe(0);
  });
  it('advances cursor past unknown ops (default: logs warn, returns prev, does not throw)', () => {
    // Unknown ops are folded into safeOps (default case never throws).
    // nextSeq advances to the unknown op's seq — permanently skipping it
    // from the listener's perspective. This is the correct behavior for
    // version-skew; it reinforces why SM #86 must deploy before LP #52.
    const p = makeProductWithContent();
    const { product: next, nextSeq } = applyDrainOps(p, [
      { seq: 7, op: 'frobnicate', payload: {} },
    ]);
    expect(nextSeq).toBe(7); // cursor advances past unknown op
    expect(next.themes.length).toBe(p.themes.length); // state unchanged
  });
});

// ── create_release ────────────────────────────────────────────────────────
describe('applyAiOp — create_release', () => {
  it('creates a release with correct id, name, order, and empty description', () => {
    const next = applyAiOp(makeProduct(), 'create_release', { releaseId: 'rel-1', name: 'R1' });
    expect(next.releases).toHaveLength(1);
    expect(next.releases[0]).toMatchObject({ id: 'rel-1', name: 'R1', order: 1, description: '' });
    expect(next.releases[0]).not.toHaveProperty('targetDate');
  });

  it('is idempotent on duplicate releaseId — ref-equal, no second log entry', () => {
    const p = applyAiOp(makeProduct(), 'create_release', { releaseId: 'rel-1', name: 'R1' });
    const logLen = (p._changeLog ?? []).length;
    const again = applyAiOp(p, 'create_release', { releaseId: 'rel-1', name: 'R1' });
    expect(again).toBe(p);
    expect((again._changeLog ?? []).length).toBe(logLen);
  });

  it('no-op on missing releaseId, empty releaseId, or missing name', () => {
    const p = makeProduct();
    expect(applyAiOp(p, 'create_release', {})).toBe(p);
    expect(applyAiOp(p, 'create_release', { releaseId: 'rel-1' })).toBe(p);
    expect(applyAiOp(p, 'create_release', { name: 'R1' })).toBe(p);
    expect(applyAiOp(p, 'create_release', { releaseId: '', name: 'R1' })).toBe(p);
  });

  it('changelog: op:add, entity:release, id correct, no source field', () => {
    const next = applyAiOp(makeProduct(), 'create_release', { releaseId: 'rel-1', name: 'R1' });
    const log = next._changeLog ?? [];
    const entry = log[log.length - 1]!;
    expect(entry.op).toBe('add');
    expect(entry.entity).toBe('release');
    expect(entry.id).toBe('rel-1');
    expect(entry).not.toHaveProperty('source');
  });
});

// ── allocate_rib ──────────────────────────────────────────────────────────
describe('applyAiOp — allocate_rib', () => {
  it('allocates an unallocated, unlocked rib 100% to the release', () => {
    const next = applyAiOp(makeProductWithRelease(), 'allocate_rib',
      { ribId: 'r1', releaseId: 'rel-1' });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]);
  });

  it('[CRITICAL] no-op when release does not exist — ref-equal, no orphan allocation', () => {
    const p = makeProductWithRelease();
    const next = applyAiOp(p, 'allocate_rib', { ribId: 'r1', releaseId: 'ghost' });
    expect(next).toBe(p);
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toHaveLength(0);
  });

  it('no-op on locked rib', () => {
    const p = makeProductWithRelease();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory = [
      { sprintId: 's1', releaseId: 'rel-1', percentComplete: 50, comment: '' },
    ];
    expect(applyAiOp(p, 'allocate_rib', { ribId: 'r1', releaseId: 'rel-1' })).toBe(p);
  });

  it('no-op on already-allocated rib (additive guard)', () => {
    const once = applyAiOp(makeProductWithRelease(), 'allocate_rib',
      { ribId: 'r1', releaseId: 'rel-1' });
    expect(applyAiOp(once, 'allocate_rib', { ribId: 'r1', releaseId: 'rel-1' })).toBe(once);
  });

  it('no-op on missing or empty ribId / releaseId', () => {
    const p = makeProductWithRelease();
    expect(applyAiOp(p, 'allocate_rib', {})).toBe(p);
    expect(applyAiOp(p, 'allocate_rib', { ribId: 'r1' })).toBe(p);
    expect(applyAiOp(p, 'allocate_rib', { releaseId: 'rel-1' })).toBe(p);
  });

  it('changelog: op:update, entity:rib, source:ai', () => {
    const next = applyAiOp(makeProductWithRelease(), 'allocate_rib',
      { ribId: 'r1', releaseId: 'rel-1' });
    const log = next._changeLog ?? [];
    expect(log[log.length - 1]).toMatchObject(
      { op: 'update', entity: 'rib', id: 'r1', source: 'ai' }
    );
  });
});

// ── unassign_rib ──────────────────────────────────────────────────────────
describe('applyAiOp — unassign_rib', () => {
  it('clears allocations from an allocated, unlocked rib', () => {
    let p = makeProductWithRelease();
    p = applyAiOp(p, 'allocate_rib', { ribId: 'r1', releaseId: 'rel-1' });
    const next = applyAiOp(p, 'unassign_rib', { ribId: 'r1' });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toEqual([]);
  });

  it('is idempotent: unassigning an unassigned rib returns ref-equal', () => {
    let p = makeProductWithRelease();
    p = applyAiOp(p, 'allocate_rib', { ribId: 'r1', releaseId: 'rel-1' });
    const once = applyAiOp(p, 'unassign_rib', { ribId: 'r1' });
    expect(applyAiOp(once, 'unassign_rib', { ribId: 'r1' })).toBe(once);
  });

  it('no-op on locked rib', () => {
    let p = makeProductWithRelease();
    p = applyAiOp(p, 'allocate_rib', { ribId: 'r1', releaseId: 'rel-1' });
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory = [
      { sprintId: 's1', releaseId: 'rel-1', percentComplete: 50, comment: '' },
    ];
    expect(applyAiOp(p, 'unassign_rib', { ribId: 'r1' })).toBe(p);
  });

  it('no-op on missing or empty ribId', () => {
    const p = makeProductWithRelease();
    expect(applyAiOp(p, 'unassign_rib', {})).toBe(p);
    expect(applyAiOp(p, 'unassign_rib', { ribId: '' })).toBe(p);
  });
});

// ── size_rib ──────────────────────────────────────────────────────────────
describe('applyAiOp — size_rib', () => {
  it('sizes an unsized, unlocked rib to a valid label', () => {
    const next = applyAiOp(makeProductWithSizing(), 'size_rib', { ribId: 'r1', size: 'M' });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.size).toBe('M');
  });

  it('appends changelog {op:update, entity:rib, id, source:ai}', () => {
    const next = applyAiOp(makeProductWithSizing(), 'size_rib', { ribId: 'r1', size: 'M' });
    const log = next._changeLog ?? [];
    expect(log[log.length - 1]).toMatchObject({
      op: 'update', entity: 'rib', id: 'r1', source: 'ai',
    });
  });

  it('[additive] no-op when rib already has a valid size — ref-equal', () => {
    const sized = applyAiOp(makeProductWithSizing(), 'size_rib', { ribId: 'r1', size: 'M' });
    // Form B: already validly sized → skip, even to a different valid label.
    expect(applyAiOp(sized, 'size_rib', { ribId: 'r1', size: 'L' })).toBe(sized);
  });

  it('[CRITICAL] no-op when label not in sizeMapping — ref-equal', () => {
    const p = makeProductWithSizing(); // mapping is {S, M, L}
    expect(applyAiOp(p, 'size_rib', { ribId: 'r1', size: 'XL' })).toBe(p);       // enum label absent from mapping
    expect(applyAiOp(p, 'size_rib', { ribId: 'r1', size: 'GIGANTIC' })).toBe(p); // invented label
  });

  it('no-op when rib is locked — ref-equal', () => {
    const p = makeProductWithSizing();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory = [
      { sprintId: 's1', releaseId: 'rel1', percentComplete: 50 },
    ];
    expect(applyAiOp(p, 'size_rib', { ribId: 'r1', size: 'M' })).toBe(p);
  });

  it('no-op on missing/empty/non-string ribId or size', () => {
    const p = makeProductWithSizing();
    expect(applyAiOp(p, 'size_rib', {})).toBe(p);
    expect(applyAiOp(p, 'size_rib', { ribId: 'r1' })).toBe(p);
    expect(applyAiOp(p, 'size_rib', { size: 'M' })).toBe(p);
    expect(applyAiOp(p, 'size_rib', { ribId: '', size: 'M' })).toBe(p);
    expect(applyAiOp(p, 'size_rib', { ribId: 'r1', size: '' })).toBe(p);
    expect(applyAiOp(p, 'size_rib', { ribId: 123 as unknown as string, size: 'M' })).toBe(p);
  });

  it('no-op when ribId matches no rib — ref-equal', () => {
    const p = makeProductWithSizing();
    expect(applyAiOp(p, 'size_rib', { ribId: 'ghost', size: 'M' })).toBe(p);
  });

  it('[EDGE] rib with size "" (post-import orphan clear) is sizeable — Form B treats it as unsized', () => {
    // validateProduct.ts:225 persists orphan sizes as '' not null.
    // Form B: '' is falsy → not "already validly sized" → sizeable.
    // A guard of !== null would skip this rib despite the UI showing it as unsized.
    const p = makeProductWithSizing();
    (p.themes[0]!.backboneItems[0]!.ribItems[0]! as Record<string, unknown>).size = '';
    const next = applyAiOp(p, 'size_rib', { ribId: 'r1', size: 'M' });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.size).toBe('M');
  });

  it('[EDGE] custom (non-enum) label succeeds; enum label absent from mapping fails', () => {
    // Proves validation is against product.sizeMapping at runtime, not the Size union.
    let p: Product = {
      ...makeProduct(),
      sizeMapping: [{ label: 'Tiny', points: 1 }, { label: 'Huge', points: 100 }],
    };
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' });
    expect(
      applyAiOp(p, 'size_rib', { ribId: 'r1', size: 'Tiny' })
        .themes[0]!.backboneItems[0]!.ribItems[0]!.size,
    ).toBe('Tiny');
    // 'M' is in the Size enum but NOT in this product's mapping → no-op
    expect(applyAiOp(p, 'size_rib', { ribId: 'r1', size: 'M' })).toBe(p);
  });

  it('[EDGE] no-op when sizeMapping is absent — ref-equal, no throw', () => {
    // sizeMapping is required by the type but can be absent on hand-edited products.
    // The ?? [] guard in sizeRibInProduct must prevent a throw.
    const p = makeProductWithSizing();
    (p as Record<string, unknown>).sizeMapping = undefined;
    expect(() => applyAiOp(p, 'size_rib', { ribId: 'r1', size: 'M' })).not.toThrow();
    expect(applyAiOp(p, 'size_rib', { ribId: 'r1', size: 'M' })).toBe(p);
  });

  it('is idempotent: second identical call is ref-equal (no duplicate changelog entry)', () => {
    const once = applyAiOp(makeProductWithSizing(), 'size_rib', { ribId: 'r1', size: 'S' });
    const logLen = (once._changeLog ?? []).length;
    const twice = applyAiOp(once, 'size_rib', { ribId: 'r1', size: 'S' });
    expect(twice).toBe(once);
    expect((twice._changeLog ?? []).length).toBe(logLen);
  });
});

// ── Drain / no-throw — Phase 2 ────────────────────────────────────────────
describe('applyDrainOps — Phase 2 ops', () => {
  it('computeSafePrefix includes all three new ops (all no-throw)', () => {
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'create_release', payload: { releaseId: 'rel-1', name: 'R1' } },
      { seq: 2, op: 'allocate_rib', payload: { ribId: 'r1', releaseId: 'rel-1' } },
      { seq: 3, op: 'unassign_rib', payload: { ribId: 'r1' } },
    ];
    const { safeOps, nextSeq } = computeSafePrefix(makeProductWithRelease(), ops);
    expect(safeOps).toHaveLength(3);
    expect(nextSeq).toBe(3);
  });

  it('create_release then allocate_rib in drain order: allocation lands', () => {
    let p = makeProduct();
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' });
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'create_release', payload: { releaseId: 'rel-1', name: 'R1' } },
      { seq: 2, op: 'allocate_rib', payload: { ribId: 'r1', releaseId: 'rel-1' } },
    ];
    const { product: result, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(2);
    expect(result.releases).toHaveLength(1);
    expect(result.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]);
  });

  it('create_release: re-applying the same drain is ref-equal (idempotency)', () => {
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'create_release', payload: { releaseId: 'rel-1', name: 'R1' } },
    ];
    const { product: once } = applyDrainOps(makeProduct(), ops);
    expect(once.releases).toHaveLength(1);
    const { product: twice } = applyDrainOps(once, ops);
    expect(twice).toBe(once);
  });

  it('allocate_rib before create_release: no-op but cursor advances (accepted ordering risk)', () => {
    const p = makeProduct();
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'allocate_rib', payload: { ribId: 'r1', releaseId: 'rel-1' } },
    ];
    const { product: result, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(1);
    expect(result).toBe(p);
  });

  it('re-applying allocate_rib drain is ref-equal (no duplicate changelog)', () => {
    const p = makeProductWithRelease();
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'allocate_rib', payload: { ribId: 'r1', releaseId: 'rel-1' } },
    ];
    const { product: once } = applyDrainOps(p, ops);
    const { product: twice } = applyDrainOps(once, ops);
    expect(twice).toBe(once);
  });
});

// ── Drain / no-throw — Phase 3 ────────────────────────────────────────────
describe('applyDrainOps — Phase 3 (size_rib)', () => {
  it('computeSafePrefix includes size_rib (no-throw — satisfies drain two-call coupling)', () => {
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'size_rib', payload: { ribId: 'r1', size: 'M' } },
    ];
    const { safeOps, nextSeq } = computeSafePrefix(makeProductWithSizing(), ops);
    expect(safeOps).toHaveLength(1);
    expect(nextSeq).toBe(1);
  });

  it('create_rib then size_rib in drain order: size lands', () => {
    let p: Product = { ...makeProduct(), sizeMapping: [{ label: 'M', points: 20 }] };
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'create_rib', payload: { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' } },
      { seq: 2, op: 'size_rib', payload: { ribId: 'r1', size: 'M' } },
    ];
    const { product: result, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(2);
    expect(result.themes[0]!.backboneItems[0]!.ribItems[0]!.size).toBe('M');
  });

  it('re-applying size_rib drain is ref-equal (idempotency, no duplicate changelog)', () => {
    const p = makeProductWithSizing();
    const ops: AiOpDoc[] = [{ seq: 1, op: 'size_rib', payload: { ribId: 'r1', size: 'M' } }];
    const { product: once } = applyDrainOps(p, ops);
    expect(once.themes[0]!.backboneItems[0]!.ribItems[0]!.size).toBe('M');
    const { product: twice } = applyDrainOps(once, ops);
    expect(twice).toBe(once);
  });

  it('size_rib with invalid label in drain: no-op, cursor advances', () => {
    const ops: AiOpDoc[] = [
      { seq: 5, op: 'size_rib', payload: { ribId: 'r1', size: 'INVALID' } },
    ];
    const { product: result, nextSeq } = applyDrainOps(makeProductWithSizing(), ops);
    expect(nextSeq).toBe(5);
    expect(result.themes[0]!.backboneItems[0]!.ribItems[0]!.size).toBeNull();
  });

  it('size_rib on absent sizeMapping in drain: no-op, no throw, cursor advances', () => {
    const p = makeProductWithSizing();
    (p as Record<string, unknown>).sizeMapping = undefined;
    const ops: AiOpDoc[] = [{ seq: 1, op: 'size_rib', payload: { ribId: 'r1', size: 'M' } }];
    expect(() => applyDrainOps(p, ops)).not.toThrow();
    const { nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(1);
  });
});

// ── buildAiSnapshot ───────────────────────────────────────────────────────
describe('buildAiSnapshot', () => {
  it('includes releases sorted by order ascending', () => {
    let p = makeProduct();
    p = addNamedReleaseToProduct(p, 'rel-a', { name: 'RA' });
    p = addNamedReleaseToProduct(p, 'rel-b', { name: 'RB' });
    p.releases[0]!.order = 2;
    p.releases[1]!.order = 1;
    const snap = buildAiSnapshot(p);
    expect(snap.releases[0]?.id).toBe('rel-b');
    expect(snap.releases[1]?.id).toBe('rel-a');
  });

  it('releases do not include targetDate or description', () => {
    const p = addNamedReleaseToProduct(makeProduct(), 'rel-1', { name: 'R1' });
    const snap = buildAiSnapshot(p);
    expect(snap.releases[0]).not.toHaveProperty('targetDate');
    expect(snap.releases[0]).not.toHaveProperty('description');
  });

  it('per-rib releaseIds is empty for an unallocated rib', () => {
    const snap = buildAiSnapshot(makeProductWithRelease());
    expect(snap.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseIds).toEqual([]);
  });

  it('per-rib locked is false when no progress', () => {
    const snap = buildAiSnapshot(makeProductWithRelease());
    expect(snap.themes[0]!.backboneItems[0]!.ribItems[0]!.locked).toBe(false);
  });

  it('per-rib releaseIds contains the allocated release id', () => {
    let p = makeProductWithRelease();
    p = applyAiOp(p, 'allocate_rib', { ribId: 'r1', releaseId: 'rel-1' });
    const snap = buildAiSnapshot(p);
    expect(snap.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseIds).toEqual(['rel-1']);
  });

  it('per-rib releaseIds exposes both ids for a split allocation', () => {
    let p = makeProductWithRelease();
    p = addNamedReleaseToProduct(p, 'rel-2', { name: 'R2' });
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations = [
      { releaseId: 'rel-1', percentage: 60 },
      { releaseId: 'rel-2', percentage: 40 },
    ];
    const snap = buildAiSnapshot(p);
    expect(snap.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseIds).toEqual(['rel-1', 'rel-2']);
  });

  it('per-rib locked is true when any progress entry has percentComplete > 0', () => {
    const p = makeProductWithRelease();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory = [
      { sprintId: 's1', releaseId: 'rel-1', percentComplete: 50, comment: '' },
    ];
    expect(buildAiSnapshot(p).themes[0]!.backboneItems[0]!.ribItems[0]!.locked).toBe(true);
  });

  it('result round-trips through JSON without data loss', () => {
    let p = makeProductWithRelease();
    p = applyAiOp(p, 'allocate_rib', { ribId: 'r1', releaseId: 'rel-1' });
    const snap = buildAiSnapshot(p);
    const rt = JSON.parse(JSON.stringify(snap)) as typeof snap;
    expect(rt).toEqual(snap);
  });

  // ── Phase 3 additions ─────────────────────────────────────────────────────
  it('top-level sizeMapping is present and sorted by points ascending', () => {
    const p: Product = {
      ...makeProduct(),
      sizeMapping: [
        { label: 'L', points: 40 },
        { label: 'S', points: 10 },
        { label: 'M', points: 20 },
      ],
    };
    expect(buildAiSnapshot(p).sizeMapping).toEqual([
      { label: 'S', points: 10 },
      { label: 'M', points: 20 },
      { label: 'L', points: 40 },
    ]);
  });

  it('sizeMapping is [] for a product with empty sizeMapping (not omitted)', () => {
    const snap = buildAiSnapshot(makeProduct()); // makeProduct() has sizeMapping:[]
    expect(snap.sizeMapping).toEqual([]);
    expect(snap).toHaveProperty('sizeMapping');
  });

  it('[EDGE] sizeMapping is [] and no throw for absent sizeMapping', () => {
    // ?? [] guard in buildAiSnapshot covers hand-edited products.
    const p = makeProduct();
    (p as Record<string, unknown>).sizeMapping = undefined;
    expect(() => buildAiSnapshot(p)).not.toThrow();
    expect(buildAiSnapshot(p).sizeMapping).toEqual([]);
  });

  it('per-rib size is null for an unsized rib', () => {
    expect(
      buildAiSnapshot(makeProductWithSizing()).themes[0]!.backboneItems[0]!.ribItems[0]!.size,
    ).toBeNull();
  });

  it('per-rib size reflects label after sizing', () => {
    const p = applyAiOp(makeProductWithSizing(), 'size_rib', { ribId: 'r1', size: 'M' });
    expect(
      buildAiSnapshot(p).themes[0]!.backboneItems[0]!.ribItems[0]!.size,
    ).toBe('M');
  });

  it('[EDGE] per-rib size is null for a rib with size "" (empty-string orphan)', () => {
    const p = makeProductWithSizing();
    (p.themes[0]!.backboneItems[0]!.ribItems[0]! as Record<string, unknown>).size = '';
    expect(
      buildAiSnapshot(p).themes[0]!.backboneItems[0]!.ribItems[0]!.size,
    ).toBeNull();
  });

  it('[EDGE] per-rib size is null for an orphan-size rib (label absent from mapping)', () => {
    const p = makeProductWithSizing(); // mapping is {S, M, L}
    (p.themes[0]!.backboneItems[0]!.ribItems[0]! as Record<string, unknown>).size = 'XXL';
    expect(
      buildAiSnapshot(p).themes[0]!.backboneItems[0]!.ribItems[0]!.size,
    ).toBeNull();
  });

  it('snapshot size:null reflects what size_rib will see as unsized (unlocked rib)', () => {
    // For an unsized, unlocked rib: snapshot reports null AND size_rib acts.
    // Full agreement also requires locked:false (locked unsized ribs have null
    // in snapshot but size_rib does not act on them — Guard 3).
    const p = makeProductWithSizing();
    const ribSnap = buildAiSnapshot(p).themes[0]!.backboneItems[0]!.ribItems[0]!;
    expect(ribSnap.size).toBeNull();
    expect(ribSnap.locked).toBe(false);
    expect(applyAiOp(p, 'size_rib', { ribId: 'r1', size: 'M' })).not.toBe(p); // acted
  });

  it('JSON round-trip extended: sizeMapping and per-rib size survive JSON parse', () => {
    const p = applyAiOp(makeProductWithSizing(), 'size_rib', { ribId: 'r1', size: 'L' });
    const snap = buildAiSnapshot(p);
    const rt = JSON.parse(JSON.stringify(snap)) as typeof snap;
    expect(rt).toEqual(snap);
    expect(rt.sizeMapping).toEqual(snap.sizeMapping);
    expect(rt.themes[0]!.backboneItems[0]!.ribItems[0]!.size).toBe('L');
  });
});

// ── bulk_create_releases ──────────────────────────────────────────────────
describe('applyAiOp — bulk_create_releases', () => {
  it('creates N releases with correct id/name/order ascending, no targetDate', () => {
    const next = applyAiOp(makeProduct(), 'bulk_create_releases', {
      releases: [{ releaseId: 'rel-1', name: 'R1' }, { releaseId: 'rel-2', name: 'R2' }],
    });
    expect(next.releases).toHaveLength(2);
    expect(next.releases[0]).toMatchObject({ id: 'rel-1', name: 'R1', order: 1, description: '' });
    expect(next.releases[1]).toMatchObject({ id: 'rel-2', name: 'R2', order: 2 });
    expect(next.releases[0]).not.toHaveProperty('targetDate');
  });

  it('batch with a duplicate releaseId — new created, dup skipped', () => {
    const p = applyAiOp(makeProduct(), 'bulk_create_releases', {
      releases: [{ releaseId: 'rel-1', name: 'R1' }],
    });
    const next = applyAiOp(p, 'bulk_create_releases', {
      releases: [{ releaseId: 'rel-1', name: 'dup' }, { releaseId: 'rel-2', name: 'R2' }],
    });
    expect(next.releases).toHaveLength(2);
    expect(next.releases[0]?.name).toBe('R1'); // original wins, not 'dup'
  });

  it('all-duplicate batch is a ref-equal no-op', () => {
    const p = applyAiOp(makeProduct(), 'bulk_create_releases', {
      releases: [{ releaseId: 'rel-1', name: 'R1' }],
    });
    expect(applyAiOp(p, 'bulk_create_releases', {
      releases: [{ releaseId: 'rel-1', name: 'again' }],
    })).toBe(p);
  });

  it('no-op on empty array / non-array / null entry / missing field', () => {
    const p = makeProduct();
    expect(applyAiOp(p, 'bulk_create_releases', { releases: [] })).toBe(p);
    expect(applyAiOp(p, 'bulk_create_releases', { releases: 'x' })).toBe(p);
    expect(applyAiOp(p, 'bulk_create_releases', { releases: [null] })).toBe(p);
    expect(applyAiOp(p, 'bulk_create_releases', { releases: [{ name: 'no id' }] })).toBe(p);
    expect(applyAiOp(p, 'bulk_create_releases', {})).toBe(p);
  });

  it('N→1 collapse: 3 releases applied → exactly 1 changelog entry', () => {
    const p = makeProduct();
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_create_releases', {
      releases: [
        { releaseId: 'rel-a', name: 'A' },
        { releaseId: 'rel-b', name: 'B' },
        { releaseId: 'rel-c', name: 'C' },
      ],
    });
    expect(next.releases).toHaveLength(3);
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);
  });

  it('changelog: op:add, entity:release, source:ai, no id field', () => {
    const next = applyAiOp(makeProduct(), 'bulk_create_releases', {
      releases: [{ releaseId: 'rel-1', name: 'R1' }],
    });
    const log = next._changeLog ?? [];
    const entry = log[log.length - 1]!;
    expect(entry.op).toBe('add');
    expect(entry.entity).toBe('release');
    expect(entry.source).toBe('ai');
    expect(entry.id).toBeUndefined();
  });

  it('idempotency: second identical call is ref-equal', () => {
    const first = applyAiOp(makeProduct(), 'bulk_create_releases', {
      releases: [{ releaseId: 'rel-1', name: 'R1' }],
    });
    expect(applyAiOp(first, 'bulk_create_releases', {
      releases: [{ releaseId: 'rel-1', name: 'R1' }],
    })).toBe(first);
  });
});

// ── bulk_allocate ─────────────────────────────────────────────────────────
describe('applyAiOp — bulk_allocate', () => {
  it('allocates a fresh unlocked rib (single happy-path)', () => {
    const next = applyAiOp(makeProductWithReleasesAndRibs(), 'bulk_allocate', {
      allocations: [{ ribId: 'r1', releaseId: 'rel-1' }],
    });
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]);
  });

  it('mixed batch: only the fresh rib allocates; locked/allocated/ghost/bad-release skip', () => {
    const p = makeProductWithReleasesAndRibs();
    const next = applyAiOp(p, 'bulk_allocate', {
      allocations: [
        { ribId: 'r1', releaseId: 'rel-1' },        // fresh → allocates
        { ribId: 'r2', releaseId: 'rel-1' },        // locked → skip
        { ribId: 'r3', releaseId: 'rel-1' },        // already allocated → skip
        { ribId: 'ghost', releaseId: 'rel-1' },     // no such rib → skip
        { ribId: 'r1', releaseId: 'nonexistent' },  // no such release → skip
      ],
    });
    expect(next).not.toBe(p);
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]); // r1
    expect(next.themes[0]?.backboneItems[0]?.ribItems[1]?.releaseAllocations).toEqual([]); // r2
  });

  it('all-skip batch is a ref-equal no-op', () => {
    const p = makeProductWithReleasesAndRibs();
    expect(applyAiOp(p, 'bulk_allocate', {
      allocations: [
        { ribId: 'r2', releaseId: 'rel-1' },  // locked
        { ribId: 'r3', releaseId: 'rel-1' },  // already allocated
        { ribId: 'ghost', releaseId: 'rel-1' },
      ],
    })).toBe(p);
  });

  it('no-op on empty array / non-array / null entry', () => {
    const p = makeProductWithReleasesAndRibs();
    expect(applyAiOp(p, 'bulk_allocate', { allocations: [] })).toBe(p);
    expect(applyAiOp(p, 'bulk_allocate', { allocations: 'x' })).toBe(p);
    expect(applyAiOp(p, 'bulk_allocate', { allocations: [null] })).toBe(p);
  });

  it('N→1 collapse: 2 fresh allocations → exactly 1 changelog entry', () => {
    let p = addNamedReleaseToProduct(makeProduct(), 'rel-1', { name: 'R1' });
    p = addNamedReleaseToProduct(p, 'rel-2', { name: 'R2' });
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R1' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r2', name: 'R2' });
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_allocate', {
      allocations: [
        { ribId: 'r1', releaseId: 'rel-1' },
        { ribId: 'r2', releaseId: 'rel-2' },
      ],
    });
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.releaseAllocations).toHaveLength(1);
    expect(next.themes[0]?.backboneItems[0]?.ribItems[1]?.releaseAllocations).toHaveLength(1);
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);
  });

  it('changelog: op:update, entity:rib, source:ai, no id field', () => {
    const next = applyAiOp(makeProductWithReleasesAndRibs(), 'bulk_allocate', {
      allocations: [{ ribId: 'r1', releaseId: 'rel-1' }],
    });
    const log = next._changeLog ?? [];
    const entry = log[log.length - 1]!;
    expect(entry.op).toBe('update');
    expect(entry.entity).toBe('rib');
    expect(entry.source).toBe('ai');
    expect(entry.id).toBeUndefined();
  });

  it('idempotency: second identical call is ref-equal', () => {
    const first = applyAiOp(makeProductWithReleasesAndRibs(), 'bulk_allocate', {
      allocations: [{ ribId: 'r1', releaseId: 'rel-1' }],
    });
    expect(applyAiOp(first, 'bulk_allocate', {
      allocations: [{ ribId: 'r1', releaseId: 'rel-1' }],
    })).toBe(first);
  });

  it('does not introduce releaseCardOrder (inherits allocateRibInProduct contract)', () => {
    const next = applyAiOp(makeProductWithReleasesAndRibs(), 'bulk_allocate', {
      allocations: [{ ribId: 'r1', releaseId: 'rel-1' }],
    });
    expect(next.releaseCardOrder).toBeUndefined();
  });
});

// ── bulk_size ─────────────────────────────────────────────────────────────
describe('applyAiOp — bulk_size', () => {
  it('sizes a fresh unsized unlocked rib (single happy-path)', () => {
    const next = applyAiOp(makeProductWithSizingMultiRib(), 'bulk_size', {
      sizes: [{ ribId: 'r1', size: 'L' }],
    });
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBe('L');
  });

  it('mixed batch: only the fresh rib sizes; already-sized/locked/ghost/bad-label skip', () => {
    const p = makeProductWithSizingMultiRib();
    const next = applyAiOp(p, 'bulk_size', {
      sizes: [
        { ribId: 'r1', size: 'L' },        // unsized → sizes
        { ribId: 'r2', size: 'S' },        // already sized 'M' → skip
        { ribId: 'r3', size: 'L' },        // locked → skip
        { ribId: 'ghost', size: 'L' },     // no such rib → skip
        { ribId: 'r1', size: 'Bogus' },    // unknown label → skip (r1 already sized)
      ],
    });
    expect(next).not.toBe(p);
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBe('L'); // r1
    expect(next.themes[0]?.backboneItems[0]?.ribItems[1]?.size).toBe('M'); // r2 unchanged
    expect(next.themes[0]?.backboneItems[0]?.ribItems[2]?.size).toBeNull(); // r3 unchanged
  });

  it('[EDGE] a rib with size "" (orphan clear) is sizeable — Form B treats it as unsized', () => {
    const p = makeProductWithSizingMultiRib();
    (p.themes[0]!.backboneItems[0]!.ribItems[0]! as Record<string, unknown>).size = '';
    const next = applyAiOp(p, 'bulk_size', { sizes: [{ ribId: 'r1', size: 'M' }] });
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBe('M');
  });

  it('[EDGE] no-op when sizeMapping is absent — ref-equal, no throw', () => {
    const p = makeProductWithSizingMultiRib();
    (p as Record<string, unknown>).sizeMapping = undefined;
    expect(() => applyAiOp(p, 'bulk_size', { sizes: [{ ribId: 'r1', size: 'M' }] })).not.toThrow();
    expect(applyAiOp(p, 'bulk_size', { sizes: [{ ribId: 'r1', size: 'M' }] })).toBe(p);
  });

  it('[EDGE] custom-label project: Tiny lands, default M (absent from mapping) skipped', () => {
    let p: Product = {
      ...makeProduct(),
      sizeMapping: [{ label: 'Tiny', points: 1 }, { label: 'Huge', points: 100 }],
    };
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' });
    expect(applyAiOp(p, 'bulk_size', { sizes: [{ ribId: 'r1', size: 'Tiny' }] })
      .themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBe('Tiny');
    expect(applyAiOp(p, 'bulk_size', { sizes: [{ ribId: 'r1', size: 'M' }] })).toBe(p);
  });

  it('no-op on all-skip / empty / non-array / null entry', () => {
    const p = makeProductWithSizingMultiRib();
    expect(applyAiOp(p, 'bulk_size', {
      sizes: [{ ribId: 'r2', size: 'S' }, { ribId: 'r3', size: 'L' }, { ribId: 'ghost', size: 'M' }],
    })).toBe(p);
    expect(applyAiOp(p, 'bulk_size', { sizes: [] })).toBe(p);
    expect(applyAiOp(p, 'bulk_size', { sizes: 'x' })).toBe(p);
    expect(applyAiOp(p, 'bulk_size', { sizes: [null] })).toBe(p);
  });

  it('N→1 collapse: 2 fresh sizings → exactly 1 changelog entry', () => {
    const base: Product = { ...makeProduct(), sizeMapping: [
      { label: 'S', points: 10 }, { label: 'M', points: 20 },
    ] };
    let p = applyAiOp(base, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R1' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r2', name: 'R2' });
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_size', {
      sizes: [{ ribId: 'r1', size: 'S' }, { ribId: 'r2', size: 'M' }],
    });
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBe('S');
    expect(next.themes[0]?.backboneItems[0]?.ribItems[1]?.size).toBe('M');
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);
  });

  it('changelog: op:update, entity:rib, source:ai, no id field', () => {
    const next = applyAiOp(makeProductWithSizingMultiRib(), 'bulk_size', {
      sizes: [{ ribId: 'r1', size: 'L' }],
    });
    const log = next._changeLog ?? [];
    const entry = log[log.length - 1]!;
    expect(entry.op).toBe('update');
    expect(entry.entity).toBe('rib');
    expect(entry.source).toBe('ai');
    expect(entry.id).toBeUndefined();
  });

  it('idempotency: second identical call is ref-equal', () => {
    const first = applyAiOp(makeProductWithSizingMultiRib(), 'bulk_size', {
      sizes: [{ ribId: 'r1', size: 'L' }],
    });
    expect(applyAiOp(first, 'bulk_size', {
      sizes: [{ ribId: 'r1', size: 'L' }],
    })).toBe(first);
  });
});

// ── Drain / no-throw — Phase 4 bulk ops ───────────────────────────────────
describe('applyDrainOps — Phase 4 bulk ops', () => {
  it('no-op bulk payloads still advance the cursor without throwing', () => {
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'bulk_create_releases', payload: { releases: [{}] } },
      { seq: 2, op: 'bulk_allocate', payload: { allocations: [{}] } },
      { seq: 3, op: 'bulk_size', payload: { sizes: [{}] } },
    ];
    const { safeOps, nextSeq } = computeSafePrefix(makeProduct(), ops);
    expect(safeOps).toHaveLength(3);
    expect(nextSeq).toBe(3);
  });

  it('bulk_create_releases then bulk_allocate in drain: allocation lands (cross-op dependency)', () => {
    let p = makeProduct();
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' });
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'bulk_create_releases', payload: { releases: [{ releaseId: 'rel-1', name: 'R1' }] } },
      { seq: 2, op: 'bulk_allocate', payload: { allocations: [{ ribId: 'r1', releaseId: 'rel-1' }] } },
    ];
    const { product: result, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(2);
    expect(result.releases).toHaveLength(1);
    expect(result.themes[0]?.backboneItems[0]?.ribItems[0]?.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]);
  });

  it('bulk_create_releases meaningful drain: ref-equal on idempotent re-apply', () => {
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'bulk_create_releases', payload: { releases: [{ releaseId: 'rel-1', name: 'R1' }] } },
    ];
    const { product: once } = applyDrainOps(makeProduct(), ops);
    expect(once.releases).toHaveLength(1);
    const { product: twice } = applyDrainOps(once, ops);
    expect(twice).toBe(once);
  });

  it('bulk_size in drain with all-invalid entries: cursor advances, product unchanged', () => {
    const ops: AiOpDoc[] = [
      { seq: 5, op: 'bulk_size', payload: { sizes: [{ ribId: 'r1', size: 'INVALID' }] } },
    ];
    const { product: result, nextSeq } = applyDrainOps(makeProductWithSizing(), ops);
    expect(nextSeq).toBe(5);
    expect(result.themes[0]?.backboneItems[0]?.ribItems[0]?.size).toBeNull();
  });
});
