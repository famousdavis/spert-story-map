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
  moveRibInProduct,
  appendRibNoteInProduct,
} from '../lib/productTransforms';
import { buildAiSnapshot, selectSnapshotForWrite } from '../lib/aiSnapshot';

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

describe('applyAiOp — payload type hardening (defense-in-depth)', () => {
  // A product with one theme/backbone/rib, built through the create ops.
  function seeded(): Product {
    let p = makeProduct();
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' });
    return p;
  }

  it('create ops drop non-string required fields (no cast-laundering)', () => {
    const prev = makeProduct();
    expect(applyAiOp(prev, 'create_theme', { themeId: 't1', name: 42 })).toBe(prev);
    expect(applyAiOp(prev, 'create_theme', { themeId: 't1' })).toBe(prev);
    expect(applyAiOp(prev, 'create_theme', { themeId: { evil: 1 }, name: 'T' })).toBe(prev);
  });

  it('create_rib coerces non-string optional fields and invalid category', () => {
    let p = makeProduct();
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R',
      description: 99, category: 'bogus', notes: { x: 1 },
    });
    const rib = p.themes[0]?.backboneItems[0]?.ribItems[0];
    expect(rib?.description).toBe('');   // 99 dropped → default ''
    expect(rib?.category).toBe('core');  // 'bogus' dropped → default 'core'
    expect(rib?.notes).toBe('');         // object dropped → default ''
  });

  it('update_rib drops non-string fields and the invalid category enum', () => {
    const p = seeded();
    // All-invalid update applies nothing → ref-equal no-op.
    expect(applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 42, category: 'bogus',
    })).toBe(p);
    // Mixed: the valid name applies; the invalid category is dropped.
    const next = applyAiOp(p, 'update_rib', {
      themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'New', category: 'bogus',
    });
    const rib = next.themes[0]?.backboneItems[0]?.ribItems[0];
    expect(rib?.name).toBe('New');
    expect(rib?.category).toBe('core');  // 'bogus' never written
  });

  it('update_theme / update_backbone drop non-string names', () => {
    const p = seeded();
    expect(applyAiOp(p, 'update_theme', { themeId: 't1', name: 42 })).toBe(p);
    expect(applyAiOp(p, 'update_backbone', { themeId: 't1', backboneId: 'b1', name: 42 })).toBe(p);
  });

  it('bulk_import skips entities with non-string id/name, keeps valid siblings', () => {
    const prev = makeProduct();
    const mixed = {
      themes: [
        { themeId: 't1', name: 42, backbones: [] },               // bad name → skipped
        { themeId: 't2', name: 'Good', backbones: [
          { backboneId: 'b1', name: 'B', ribs: [
            { ribId: 'r1', name: 'R1' },                          // valid
            { ribId: 'r2', name: { x: 1 } },                      // bad name → skipped
          ] },
        ] },
      ],
    };
    const next = applyAiOp(prev, 'bulk_import', mixed);
    expect(next.themes.length).toBe(1);
    expect(next.themes[0]?.name).toBe('Good');
    expect(next.themes[0]?.backboneItems[0]?.ribItems.length).toBe(1);
    expect(next.themes[0]?.backboneItems[0]?.ribItems[0]?.name).toBe('R1');
  });

  it('bulk_import with all-invalid entities is a ref-equal no-op', () => {
    const prev = makeProduct();
    expect(applyAiOp(prev, 'bulk_import', {
      themes: [{ themeId: 't1', name: 99, backbones: [] }],
    })).toBe(prev);
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

/**
 * One release + three ribs in varying states for bulk_unassign tests.
 *   r1 — allocated + unlocked (happy-path: should clear)
 *   r2 — allocated + locked   (Guard 2 isolation: should skip)
 *   r3 — unallocated          (Guard 3 isolation: should skip — already unassigned)
 *
 * Build order for r2: allocate FIRST (while unlocked), THEN inject progressHistory.
 * Reason: allocateRibInProduct Guard 3 blocks re-allocation of a locked rib — doing
 * lock-then-allocate silently produces locked+unallocated, which is the wrong state.
 */
function makeProductForBulkUnassign(): Product {
  let p = makeProduct();
  p = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1' });
  p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
  p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'Rib1' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r2', name: 'Rib2' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r3', name: 'Rib3' });
  p = allocateRibInProduct(p, 'r1', 'rel-1');
  p = allocateRibInProduct(p, 'r2', 'rel-1');
  // Lock r2 after allocation.
  return {
    ...p,
    themes: p.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => r.id !== 'r2' ? r : {
          ...r,
          progressHistory: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 }],
        }),
      })),
    })),
  };
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

  // ── Phase 7 additions (D25: partial) ──────────────────────────────────────
  it('per-rib partial is true for a single sub-100% allocation', () => {
    const p = makeProductWithRelease();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations = [
      { releaseId: 'rel-1', percentage: 60 },
    ];
    const rib = buildAiSnapshot(p).themes[0]!.backboneItems[0]!.ribItems[0]!;
    expect(rib.partial).toBe(true);
    expect(rib.releaseIds).toEqual(['rel-1']); // indistinguishable from 100% without partial
  });

  it('per-rib partial is false for a single 100% allocation and for zero allocations', () => {
    // Zero allocations (fresh fixture rib).
    const unallocated = buildAiSnapshot(makeProductWithRelease());
    expect(unallocated.themes[0]!.backboneItems[0]!.ribItems[0]!.partial).toBe(false);
    // Single 100% allocation.
    const p = applyAiOp(makeProductWithRelease(), 'allocate_rib',
      { ribId: 'r1', releaseId: 'rel-1' });
    expect(buildAiSnapshot(p).themes[0]!.backboneItems[0]!.ribItems[0]!.partial).toBe(false);
  });

  it('per-rib partial is false for a split allocation (releaseIds carries that signal)', () => {
    let p = makeProductWithRelease();
    p = addNamedReleaseToProduct(p, 'rel-2', { name: 'R2' });
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations = [
      { releaseId: 'rel-1', percentage: 60 },
      { releaseId: 'rel-2', percentage: 40 },
    ];
    const rib = buildAiSnapshot(p).themes[0]!.backboneItems[0]!.ribItems[0]!;
    expect(rib.partial).toBe(false);
    expect(rib.releaseIds).toHaveLength(2); // the split signal
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

// ── bulk_unassign ─────────────────────────────────────────────────────────
describe('applyAiOp — bulk_unassign', () => {
  it('clears allocations from an allocated, unlocked rib', () => {
    const p = makeProductForBulkUnassign();
    const next = applyAiOp(p, 'bulk_unassign', { ribIds: ['r1'] });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toEqual([]);
  });
  it('mixed batch: only the allocated-unlocked rib clears; locked / unassigned / ghost skip', () => {
    const p = makeProductForBulkUnassign();
    const next = applyAiOp(p, 'bulk_unassign', { ribIds: ['r1', 'r2', 'r3', 'ghost'] });
    expect(next).not.toBe(p);
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toEqual([]);    // r1 cleared
    expect(next.themes[0]!.backboneItems[0]!.ribItems[1]!.releaseAllocations).toHaveLength(1); // r2 locked → unchanged
    expect(next.themes[0]!.backboneItems[0]!.ribItems[2]!.releaseAllocations).toEqual([]);    // r3 already empty
  });
  it('all-skip batch is a ref-equal no-op', () => {
    const p = makeProductForBulkUnassign();
    expect(applyAiOp(p, 'bulk_unassign', { ribIds: ['r2', 'r3', 'ghost'] })).toBe(p);
  });
  it('no-op on empty / non-array / non-string entries', () => {
    const p = makeProductForBulkUnassign();
    expect(applyAiOp(p, 'bulk_unassign', { ribIds: [] })).toBe(p);
    expect(applyAiOp(p, 'bulk_unassign', { ribIds: 'r1' })).toBe(p);
    expect(applyAiOp(p, 'bulk_unassign', { ribIds: [null] })).toBe(p);
    expect(applyAiOp(p, 'bulk_unassign', { ribIds: [''] })).toBe(p);
    expect(applyAiOp(p, 'bulk_unassign', {})).toBe(p);
  });
  it('partial batch (1 applies, 1 locked-skip) → exactly 1 changelog entry', () => {
    const p = makeProductForBulkUnassign();
    const prevLen = (p._changeLog ?? []).length;
    // r1 applies; r2 is locked and skips.
    const next = applyAiOp(p, 'bulk_unassign', { ribIds: ['r1', 'r2'] });
    expect(next).not.toBe(p);
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);
  });
  it('N→1 collapse: 2 fresh unassignments → exactly 1 changelog entry', () => {
    let p = makeProduct();
    p = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1' });
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R1' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r2', name: 'R2' });
    p = allocateRibInProduct(p, 'r1', 'rel-1');
    p = allocateRibInProduct(p, 'r2', 'rel-1');
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_unassign', { ribIds: ['r1', 'r2'] });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toEqual([]);
    expect(next.themes[0]!.backboneItems[0]!.ribItems[1]!.releaseAllocations).toEqual([]);
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);
  });
  it('changelog: op:update, entity:rib, source:ai, no id field', () => {
    const next = applyAiOp(makeProductForBulkUnassign(), 'bulk_unassign', { ribIds: ['r1'] });
    const log = next._changeLog ?? [];
    const entry = log[log.length - 1]!;
    expect(entry.op).toBe('update');
    expect(entry.entity).toBe('rib');
    expect(entry.source).toBe('ai');
    expect(entry.id).toBeUndefined();
  });
  it('idempotency: second identical call is ref-equal', () => {
    const first = applyAiOp(makeProductForBulkUnassign(), 'bulk_unassign', { ribIds: ['r1'] });
    expect(applyAiOp(first, 'bulk_unassign', { ribIds: ['r1'] })).toBe(first);
  });
  it('releaseCardOrder: unassigned rib is stripped from all release buckets', () => {
    let p = makeProductForBulkUnassign();
    p = { ...p, releaseCardOrder: { 'rel-1': ['r1', 'r2'] } };
    const next = applyAiOp(p, 'bulk_unassign', { ribIds: ['r1'] });
    expect(next.releaseCardOrder!['rel-1']).not.toContain('r1'); // r1 stripped
    expect(next.releaseCardOrder!['rel-1']).toContain('r2');     // r2 locked → stays
  });
  it('[Guard isolation] locked+allocated rib is NOT cleared — Guard 2 isolates lock', () => {
    const p = makeProductForBulkUnassign();
    const next = applyAiOp(p, 'bulk_unassign', { ribIds: ['r2'] });
    expect(next).toBe(p); // all-skip → ref-equal
    expect(p.themes[0]!.backboneItems[0]!.ribItems[1]!.releaseAllocations).toHaveLength(1);
  });
  it('[multi-release] rib allocated to 2 releases has ALL allocations cleared', () => {
    // Construct a rib with a user-set percentage split (bypasses allocateRibInProduct Guard 4).
    let p = makeProduct();
    p = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1' });
    p = addNamedReleaseToProduct(p, 'rel-2', { name: 'R2' });
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R1' });
    p = {
      ...p,
      themes: p.themes.map(t => ({
        ...t,
        backboneItems: t.backboneItems.map(b => ({
          ...b,
          ribItems: b.ribItems.map(r => r.id !== 'r1' ? r : {
            ...r,
            releaseAllocations: [
              { releaseId: 'rel-1', percentage: 60 },
              { releaseId: 'rel-2', percentage: 40 },
            ],
          }),
        })),
      })),
    };
    const next = applyAiOp(p, 'bulk_unassign', { ribIds: ['r1'] });
    // Both allocations cleared — this is the behavior the copyPrompt warning is about.
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toEqual([]);
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

// ── Drain / no-throw — Phase 5 (bulk_unassign) ───────────────────────────
describe('applyDrainOps — Phase 5 (bulk_unassign)', () => {
  it('computeSafePrefix includes bulk_unassign (no-throw)', () => {
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'bulk_unassign', payload: { ribIds: ['ghost'] } },
    ];
    const { safeOps, nextSeq } = computeSafePrefix(makeProduct(), ops);
    expect(safeOps).toHaveLength(1);
    expect(nextSeq).toBe(1);
  });
  it('bulk_allocate then bulk_unassign in drain: ribs end unallocated (move workflow)', () => {
    let p = makeProduct();
    p = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1' });
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' });
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'bulk_allocate', payload: { allocations: [{ ribId: 'r1', releaseId: 'rel-1' }] } },
      { seq: 2, op: 'bulk_unassign', payload: { ribIds: ['r1'] } },
    ];
    const { product: result, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(2);
    expect(result.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toEqual([]);
  });
  it('re-applying bulk_unassign drain is ref-equal (idempotency)', () => {
    let p = makeProduct();
    p = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1' });
    p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
    p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'R' });
    p = allocateRibInProduct(p, 'r1', 'rel-1');
    const ops: AiOpDoc[] = [{ seq: 1, op: 'bulk_unassign', payload: { ribIds: ['r1'] } }];
    const { product: once } = applyDrainOps(p, ops);
    expect(once.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toEqual([]);
    const { product: twice } = applyDrainOps(once, ops);
    expect(twice).toBe(once);
  });
  it('all-invalid bulk_unassign in drain: cursor advances, product unchanged', () => {
    const p = makeProduct();
    const ops: AiOpDoc[] = [
      { seq: 7, op: 'bulk_unassign', payload: { ribIds: ['ghost'] } },
    ];
    const { product: result, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(7);
    expect(result).toBe(p);
  });
});

// Module-scope builder for Phase 6 bulk_update_ribs tests.
// r1: unlocked, description:'Desc1', notes:'Notes1', category:'core'
// r2: LOCKED (percentComplete:50), description:'Desc2', notes:'', category:'non-core'
// r3: unlocked, description:'', notes:'', category:'core'  (blank-slate rib)
function makeProductForBulkUpdateRibs(): Product {
  let p = makeProduct();
  p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T' });
  p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B' });
  p = applyAiOp(p, 'create_rib', {
    themeId: 't1', backboneId: 'b1', ribId: 'r1',
    name: 'Rib1', description: 'Desc1', notes: 'Notes1', category: 'core',
  });
  p = applyAiOp(p, 'create_rib', {
    themeId: 't1', backboneId: 'b1', ribId: 'r2',
    name: 'Rib2', description: 'Desc2', notes: '', category: 'non-core',
  });
  p = applyAiOp(p, 'create_rib', {
    themeId: 't1', backboneId: 'b1', ribId: 'r3',
    name: 'Rib3', description: '', notes: '', category: 'core',
  });
  // Lock r2: any progressHistory entry with percentComplete > 0.
  return {
    ...p,
    themes: p.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => r.id !== 'r2' ? r : {
          ...r,
          progressHistory: [
            { sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 },
          ],
        }),
      })),
    })),
  };
}

// ── bulk_update_ribs ──────────────────────────────────────────────────────
describe('applyAiOp — bulk_update_ribs', () => {
  // Guard / skip cases
  it('is ref-equal no-op for empty updates array', () => {
    const p = makeProductForBulkUpdateRibs();
    expect(applyAiOp(p, 'bulk_update_ribs', { updates: [] })).toBe(p);
  });
  it('is ref-equal no-op for missing updates key', () => {
    const p = makeProductForBulkUpdateRibs();
    expect(applyAiOp(p, 'bulk_update_ribs', {})).toBe(p);
  });
  it('skips a non-object entry and applies valid entries', () => {
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [null, { ribId: 'r1', description: 'Updated' }],
    });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.description)
      .toBe('Updated');
  });
  it('skips an entry with missing ribId', () => {
    const p = makeProductForBulkUpdateRibs();
    expect(applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ description: 'Orphan' }],
    })).toBe(p);
  });
  it('skips an entry with a ribId that does not exist in the product', () => {
    const p = makeProductForBulkUpdateRibs();
    expect(applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'ghost', description: 'X' }],
    })).toBe(p);
  });
  it('skips a per-entry all-undefined-fields entry (no-op guard)', () => {
    // A bare {ribId} with no text fields must not dirty the product.
    const p = makeProductForBulkUpdateRibs();
    expect(applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r1' }],
    })).toBe(p);
  });
  // Per-field undefined-means-skip
  it('updates description only; notes and category untouched', () => {
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r1', description: 'New desc' }],
    });
    const r1 = next.themes[0]!.backboneItems[0]!.ribItems[0]!;
    expect(r1.description).toBe('New desc');
    expect(r1.notes).toBe('Notes1');      // untouched
    expect(r1.category).toBe('core');     // untouched
  });
  it('updates notes only; description and category untouched', () => {
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r1', notes: 'New notes' }],
    });
    const r1 = next.themes[0]!.backboneItems[0]!.ribItems[0]!;
    expect(r1.notes).toBe('New notes');
    expect(r1.description).toBe('Desc1'); // untouched
    expect(r1.category).toBe('core');     // untouched
  });
  it('updates category core→non-core; description and notes untouched', () => {
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r1', category: 'non-core' }],
    });
    const r1 = next.themes[0]!.backboneItems[0]!.ribItems[0]!;
    expect(r1.category).toBe('non-core');
    expect(r1.description).toBe('Desc1'); // untouched
    expect(r1.notes).toBe('Notes1');      // untouched
  });
  it('updates category non-core→core (exercises the "core" branch of the enum guard)', () => {
    // r2 is non-core; this exercises the === 'core' branch of the guard.
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r2', category: 'core' }],
    });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[1]!.category).toBe('core');
  });
  it('updates all three text fields in one entry', () => {
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r1', description: 'D', category: 'non-core', notes: 'N' }],
    });
    const r1 = next.themes[0]!.backboneItems[0]!.ribItems[0]!;
    expect(r1.description).toBe('D');
    expect(r1.category).toBe('non-core');
    expect(r1.notes).toBe('N');
  });
  // Empty-string clear
  it('clears description to empty string when "" is provided', () => {
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r1', description: '' }],
    });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.description).toBe('');
  });
  it('clears notes to empty string when "" is provided', () => {
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r1', notes: '' }],
    });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.notes).toBe('');
  });
  // Category guard
  it('silently drops an invalid category value; other fields still apply', () => {
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r1', category: 'invalid', description: 'New' }],
    });
    const r1 = next.themes[0]!.backboneItems[0]!.ribItems[0]!;
    expect(r1.category).toBe('core');    // unchanged — invalid value dropped
    expect(r1.description).toBe('New'); // still applied
  });
  it('invalid-category-only entry produces one changelog entry (accepted wart)', () => {
    // didUpdate fires on ribId match before the category guard drops 'bogus',
    // so the product is rebuilt and one summary entry is appended even though
    // no field changed. Mirrors update_rib:472 accepted wart. (CLAUDE.md #54)
    const p = makeProductForBulkUpdateRibs();
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r1', category: 'bogus' }],
    });
    expect(next).not.toBe(p);
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.category).toBe('core');
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);
  });
  it('non-string description/notes are dropped; wart fires (both type guards exercised)', () => {
    // description:42 and notes:false pass the all-undefined check (they are !== undefined)
    // but fail the typeof === 'string' guards, so neither field is applied.
    // didUpdate still fires on ribId match → product rebuilt, one entry appended (wart).
    const p = makeProductForBulkUpdateRibs();
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{ ribId: 'r1', description: 42, notes: false }],
    });
    expect(next).not.toBe(p);                                               // wart: new object
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.description)
      .toBe('Desc1');                                                        // unchanged
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.notes)
      .toBe('Notes1');                                                       // unchanged
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);               // wart: one entry
  });
  // Locked rib
  it('updates description, category, and notes on a LOCKED rib', () => {
    // r2 is locked (percentComplete:50). Text fields must still apply —
    // the key differentiator from storymap_size_rib / storymap_bulk_size.
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [{
        ribId: 'r2',
        description: 'Locked updated',
        category: 'core',
        notes: 'AC details here',
      }],
    });
    const r2 = next.themes[0]!.backboneItems[0]!.ribItems[1]!;
    expect(r2.description).toBe('Locked updated');
    expect(r2.category).toBe('core');
    expect(r2.notes).toBe('AC details here');
    expect(r2.progressHistory[0]!.percentComplete).toBe(50); // locked state unchanged
  });
  // Multi-rib and mixed-batch
  it('updates multiple ribs in one call', () => {
    // This test guards the load-bearing `next.themes.map` source: if the map source
    // were `prev.themes`, only the last entry's update would survive (r1 would be lost).
    const p = makeProductForBulkUpdateRibs();
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [
        { ribId: 'r1', description: 'D1', notes: 'N1' },
        { ribId: 'r3', description: 'D3', notes: 'N3' },
      ],
    });
    const ribs = next.themes[0]!.backboneItems[0]!.ribItems;
    expect(ribs[0]!.description).toBe('D1');
    expect(ribs[0]!.notes).toBe('N1');
    expect(ribs[2]!.description).toBe('D3');
    expect(ribs[2]!.notes).toBe('N3');
    expect(ribs[1]!.description).toBe('Desc2'); // r2 untouched
  });
  it('mixed batch: valid entry applies, ghost entry skipped; one changelog entry', () => {
    const p = makeProductForBulkUpdateRibs();
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [
        { ribId: 'r1', description: 'X' },   // matches → applies
        { ribId: 'ghost', description: 'Y' }, // no such rib → skip
      ],
    });
    expect(next).not.toBe(p);
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.description).toBe('X');
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);
  });
  // Changelog collapse
  it('collapses N rib updates to exactly one changelog entry (no id field)', () => {
    const p = makeProductForBulkUpdateRibs();
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_update_ribs', {
      updates: [
        { ribId: 'r1', description: 'D1' },
        { ribId: 'r3', description: 'D3' },
      ],
    });
    const log = next._changeLog ?? [];
    expect(log.length).toBe(prevLen + 1);
    const last = log[log.length - 1]!;
    expect(last.op).toBe('update');
    expect(last.entity).toBe('rib');
    expect(last.source).toBe('ai');
    expect(last.id).toBeUndefined();
  });
  // All-skip ref-equality
  it('is ref-equal when all entries have no matching ribId', () => {
    const p = makeProductForBulkUpdateRibs();
    expect(applyAiOp(p, 'bulk_update_ribs', {
      updates: [
        { ribId: 'ghost1', description: 'X' },
        { ribId: 'ghost2', description: 'Y' },
      ],
    })).toBe(p);
  });
});

// ── Drain / no-throw — Phase 6 (bulk_update_ribs) ─────────────────────────
describe('applyDrainOps — Phase 6 (bulk_update_ribs)', () => {
  it('computeSafePrefix includes bulk_update_ribs (no-throw)', () => {
    const ops: AiOpDoc[] = [
      {
        seq: 1,
        op: 'bulk_update_ribs',
        payload: { updates: [{ ribId: 'ghost', description: 'X' }] },
      },
    ];
    const { safeOps, nextSeq } = computeSafePrefix(makeProduct(), ops);
    expect(safeOps).toHaveLength(1);
    expect(nextSeq).toBe(1);
  });
  it('bulk_update_ribs in drain applies and advances cursor', () => {
    const p = makeProductForBulkUpdateRibs();
    const ops: AiOpDoc[] = [
      {
        seq: 3,
        op: 'bulk_update_ribs',
        payload: { updates: [{ ribId: 'r1', description: 'Drained' }] },
      },
    ];
    const { product: result, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(3);
    expect(result.themes[0]!.backboneItems[0]!.ribItems[0]!.description)
      .toBe('Drained');
  });
  it('re-applying bulk_update_ribs drain is NOT ref-equal (replace semantics)', () => {
    // Unlike additive bulk ops, re-applying is NOT ref-equal: the ribId match fires
    // didUpdate regardless of value, rebuilding the product and appending one entry.
    // Consequence: unlike additive ops, a null-window re-application overwrites the
    // current field values rather than being a no-op. (CLAUDE.md #54)
    const p = makeProductForBulkUpdateRibs();
    const ops: AiOpDoc[] = [
      {
        seq: 1,
        op: 'bulk_update_ribs',
        payload: { updates: [{ ribId: 'r1', description: 'X' }] },
      },
    ];
    const { product: once } = applyDrainOps(p, ops);
    expect(once.themes[0]!.backboneItems[0]!.ribItems[0]!.description).toBe('X');
    const { product: twice } = applyDrainOps(once, ops);
    expect(twice.themes[0]!.backboneItems[0]!.ribItems[0]!.description).toBe('X');
    expect(twice).not.toBe(once);                              // not ref-equal
    const onceLen = (once._changeLog ?? []).length;
    expect((twice._changeLog ?? []).length).toBe(onceLen + 1); // appends one entry
  });
  it('all-ghost bulk_update_ribs in drain: cursor advances, product ref-equal', () => {
    const p = makeProductForBulkUpdateRibs();
    const ops: AiOpDoc[] = [
      {
        seq: 9,
        op: 'bulk_update_ribs',
        payload: { updates: [{ ribId: 'ghost', description: 'X' }] },
      },
    ];
    const { product: result, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(9);
    expect(result).toBe(p);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Phase 7 — move_rib / bulk_move_ribs
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Two themes / three backbones + two releases + five ribs in varying states
 * for Phase 7 move tests.
 *   t1: b1 (r1..r5), b2 (empty)
 *   t2: b3 (empty)                              — cross-theme target (D22)
 *   rel-1, rel-2
 *   r1 — unlocked, unallocated                  (backbone / from-unassigned happy paths)
 *   r2 — unlocked, single 100% → rel-1          (release reassignment happy path)
 *   r3 — LOCKED,   single 100% → rel-1          (REL-3; backbone leg still applies)
 *   r4 — unlocked, split 60/40 rel-1/rel-2      (REL-4 split)
 *   r5 — unlocked, single 60% → rel-1           (REL-4 partial)
 * Build order for r3: allocate FIRST (while unlocked), THEN inject progress —
 * allocateRibInProduct Guard 3 blocks allocation on an already-locked rib.
 */
function makeProductForMove(): Product {
  let p = makeProduct();
  p = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1' });
  p = addNamedReleaseToProduct(p, 'rel-2', { name: 'R2' });
  p = applyAiOp(p, 'create_theme', { themeId: 't1', name: 'T1' });
  p = applyAiOp(p, 'create_theme', { themeId: 't2', name: 'T2' });
  p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b1', name: 'B1' });
  p = applyAiOp(p, 'create_backbone', { themeId: 't1', backboneId: 'b2', name: 'B2' });
  p = applyAiOp(p, 'create_backbone', { themeId: 't2', backboneId: 'b3', name: 'B3' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r1', name: 'Rib1' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r2', name: 'Rib2' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r3', name: 'Rib3' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r4', name: 'Rib4' });
  p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r5', name: 'Rib5' });
  p = allocateRibInProduct(p, 'r2', 'rel-1');
  p = allocateRibInProduct(p, 'r3', 'rel-1');
  // Lock r3 after allocation; inject r4's split and r5's partial directly.
  return {
    ...p,
    themes: p.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => {
          if (r.id === 'r3') {
            return {
              ...r,
              progressHistory: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 }],
            };
          }
          if (r.id === 'r4') {
            return {
              ...r,
              releaseAllocations: [
                { releaseId: 'rel-1', percentage: 60 },
                { releaseId: 'rel-2', percentage: 40 },
              ],
            };
          }
          if (r.id === 'r5') {
            return { ...r, releaseAllocations: [{ releaseId: 'rel-1', percentage: 60 }] };
          }
          return r;
        }),
      })),
    })),
  };
}

/** Locate a rib anywhere in the product; returns its parent ids for placement asserts. */
function locateRib(p: Product, ribId: string) {
  for (const t of p.themes) {
    for (const b of t.backboneItems) {
      const rib = b.ribItems.find(r => r.id === ribId);
      if (rib) return { themeId: t.id, backboneId: b.id, rib };
    }
  }
  return undefined;
}

/** Seed a releaseCardOrder for the card-order strip tests (D12/D19/D24). */
function withCardOrder(p: Product): Product {
  return { ...p, releaseCardOrder: { 'rel-1': ['r2', 'r3', 'r5'], 'rel-2': ['r4'] } };
}

// ── moveRibInProduct — guards ─────────────────────────────────────────────
describe('moveRibInProduct — guards (Phase 7)', () => {
  it('[CALL-1] no targets provided is a ref-equal no-op', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'r1', {})).toBe(p);
  });
  it('[CALL-2] unknown ribId is a ref-equal no-op even with valid targets', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'ghost',
      { targetBackboneId: 'b2', targetReleaseId: 'rel-2' })).toBe(p);
  });
  it('[CALL-3] both legs skipped (BB-2 + REL-5) is a ref-equal no-op', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'r2',
      { targetBackboneId: 'b1', targetReleaseId: 'rel-1' })).toBe(p);
  });
  it('[BB-1] unknown targetBackboneId alone is a ref-equal no-op', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'r1', { targetBackboneId: 'ghost' })).toBe(p);
  });
  it('[BB-2] targetBackboneId equal to the current backbone is a ref-equal no-op', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'r1', { targetBackboneId: 'b1' })).toBe(p);
  });
  it('[REL-1] a backbone-only move leaves release allocations untouched', () => {
    const p = makeProductForMove();
    const next = moveRibInProduct(p, 'r2', { targetBackboneId: 'b2' });
    expect(locateRib(next, 'r2')?.rib.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]);
  });
  it('[REL-2] unknown targetReleaseId alone is a ref-equal no-op', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'r1', { targetReleaseId: 'ghost' })).toBe(p);
  });
  it('[REL-3] locked rib skips a release-only move (ref-equal)', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'r3', { targetReleaseId: 'rel-2' })).toBe(p);
  });
  it('[REL-4] split allocation skips a release-only move (ref-equal)', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'r4', { targetReleaseId: 'rel-2' })).toBe(p);
  });
  it('[REL-4] single sub-100% allocation to the SAME release skips (never bumped to 100)', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'r5', { targetReleaseId: 'rel-1' })).toBe(p);
  });
  it('[REL-4] single sub-100% allocation to a DIFFERENT release skips (not flattened)', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'r5', { targetReleaseId: 'rel-2' })).toBe(p);
  });
  it('[REL-5] sole 100% allocation already at target is a ref-equal no-op', () => {
    const p = makeProductForMove();
    expect(moveRibInProduct(p, 'r2', { targetReleaseId: 'rel-1' })).toBe(p);
  });
  it('backbone-only happy path: rib leaves source, appends to target with order = length', () => {
    const p = makeProductForMove();
    const next = moveRibInProduct(p, 'r1', { targetBackboneId: 'b2' });
    const b1 = next.themes[0]!.backboneItems[0]!;
    const b2 = next.themes[0]!.backboneItems[1]!;
    expect(b1.ribItems.some(r => r.id === 'r1')).toBe(false);
    expect(b2.ribItems[b2.ribItems.length - 1]!.id).toBe('r1');
    expect(b2.ribItems[b2.ribItems.length - 1]!.order).toBe(b2.ribItems.length);
  });
  it('release-only happy path from unassigned (D17): allocates 100% to target', () => {
    const p = makeProductForMove();
    const next = moveRibInProduct(p, 'r1', { targetReleaseId: 'rel-1' });
    expect(locateRib(next, 'r1')?.rib.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]);
    expect(locateRib(next, 'r1')?.backboneId).toBe('b1'); // backbone untouched
  });
  it('release-only happy path from 100%-elsewhere: replaces wholesale, drops memo (D18)', () => {
    const p = makeProductForMove();
    // Inject a memo on r2's existing allocation to prove the replace drops it.
    p.themes[0]!.backboneItems[0]!.ribItems[1]!.releaseAllocations = [
      { releaseId: 'rel-1', percentage: 100, memo: 'user note' },
    ];
    const next = moveRibInProduct(p, 'r2', { targetReleaseId: 'rel-2' });
    expect(locateRib(next, 'r2')?.rib.releaseAllocations)
      .toEqual([{ releaseId: 'rel-2', percentage: 100 }]); // no memo property
  });
  it('both-legs happy path: backbone and release change in one call', () => {
    const p = makeProductForMove();
    const next = moveRibInProduct(p, 'r2',
      { targetBackboneId: 'b2', targetReleaseId: 'rel-2' });
    const loc = locateRib(next, 'r2');
    expect(loc?.backboneId).toBe('b2');
    expect(loc?.rib.releaseAllocations).toEqual([{ releaseId: 'rel-2', percentage: 100 }]);
  });
  it('per-field independence: invalid release + valid backbone → backbone still applies', () => {
    const p = makeProductForMove();
    const next = moveRibInProduct(p, 'r2',
      { targetBackboneId: 'b2', targetReleaseId: 'ghost' });
    const loc = locateRib(next, 'r2');
    expect(loc?.backboneId).toBe('b2');
    expect(loc?.rib.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]); // untouched
  });
  it('per-field independence: invalid backbone + valid release → release still applies', () => {
    const p = makeProductForMove();
    const next = moveRibInProduct(p, 'r2',
      { targetBackboneId: 'ghost', targetReleaseId: 'rel-2' });
    const loc = locateRib(next, 'r2');
    expect(loc?.backboneId).toBe('b1'); // unmoved
    expect(loc?.rib.releaseAllocations).toEqual([{ releaseId: 'rel-2', percentage: 100 }]);
  });
  it('locked rib + both targets: backbone applies, release skips, exactly one changelog entry', () => {
    const p = makeProductForMove();
    const prevLen = (p._changeLog ?? []).length;
    const next = moveRibInProduct(p, 'r3',
      { targetBackboneId: 'b2', targetReleaseId: 'rel-2' });
    const loc = locateRib(next, 'r3');
    expect(loc?.backboneId).toBe('b2');                                       // D3: no lock on backbone leg
    expect(loc?.rib.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]);                    // REL-3: release untouched
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);
  });
  it('cross-theme target backbone succeeds (D22)', () => {
    const p = makeProductForMove();
    const next = moveRibInProduct(p, 'r1', { targetBackboneId: 'b3' });
    const loc = locateRib(next, 'r1');
    expect(loc?.themeId).toBe('t2');
    expect(loc?.backboneId).toBe('b3');
    // Gone from the source backbone in the source theme.
    expect(next.themes[0]!.backboneItems[0]!.ribItems.some(r => r.id === 'r1')).toBe(false);
  });
});

// ── moveRibInProduct — card order (D12/D19/D24) ───────────────────────────
describe('moveRibInProduct — card order (Phase 7)', () => {
  it('backbone-only move strips the rib from all releaseCardOrder buckets', () => {
    const p = withCardOrder(makeProductForMove());
    const next = moveRibInProduct(p, 'r2', { targetBackboneId: 'b2' });
    expect(next.releaseCardOrder!['rel-1']).toEqual(['r3', 'r5']);
    expect(next.releaseCardOrder!['rel-2']).toEqual(['r4']);
  });
  it('[D24] backbone-only move strips the rib from its UNCHANGED release bucket (intentional)', () => {
    // r2's release membership does not change, yet it is stripped from rel-1's
    // bucket — demoting it to the bottom of its Release Planning column. This is
    // the accepted cross-view trade-off documented in CLAUDE.md #57, not a bug.
    const p = withCardOrder(makeProductForMove());
    const next = moveRibInProduct(p, 'r2', { targetBackboneId: 'b2' });
    expect(locateRib(next, 'r2')?.rib.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]); // membership unchanged
    expect(next.releaseCardOrder!['rel-1']).not.toContain('r2'); // bucket stripped anyway
  });
  it('release-only move strips the rib from releaseCardOrder', () => {
    const p = withCardOrder(makeProductForMove());
    const next = moveRibInProduct(p, 'r2', { targetReleaseId: 'rel-2' });
    expect(next.releaseCardOrder!['rel-1']).toEqual(['r3', 'r5']);
  });
  it('both-legs move: rib absent from every bucket, sibling order preserved', () => {
    const p = withCardOrder(makeProductForMove());
    const next = moveRibInProduct(p, 'r2',
      { targetBackboneId: 'b2', targetReleaseId: 'rel-2' });
    for (const ids of Object.values(next.releaseCardOrder!)) {
      expect(ids).not.toContain('r2');
    }
    expect(next.releaseCardOrder!['rel-1']).toEqual(['r3', 'r5']); // relative order kept
    expect(next.releaseCardOrder!['rel-2']).toEqual(['r4']);
  });
  it('[CALL-3] no-op leaves releaseCardOrder reference-unchanged', () => {
    const p = withCardOrder(makeProductForMove());
    const next = moveRibInProduct(p, 'r2',
      { targetBackboneId: 'b1', targetReleaseId: 'rel-1' });
    expect(next).toBe(p);
    expect(next.releaseCardOrder).toBe(p.releaseCardOrder);
  });
});

// ── moveRibInProduct — changelog shape ────────────────────────────────────
describe('moveRibInProduct — changelog shape (Phase 7)', () => {
  it('a successful move appends exactly one entry with the rib id', () => {
    const p = makeProductForMove();
    const prevLen = (p._changeLog ?? []).length;
    const next = moveRibInProduct(p, 'r1', { targetBackboneId: 'b2' });
    const log = next._changeLog ?? [];
    expect(log.length).toBe(prevLen + 1);
    const last = log[log.length - 1]!;
    expect(last.op).toBe('update');
    expect(last.entity).toBe('rib');
    expect(last.id).toBe('r1');
    expect(last.source).toBe('ai');
  });
  it('an all-skip call appends zero entries and returns prev ref-equal', () => {
    const p = makeProductForMove();
    const prevLen = (p._changeLog ?? []).length;
    const next = moveRibInProduct(p, 'r5', { targetReleaseId: 'rel-2' }); // REL-4 skip
    expect(next).toBe(p);
    expect((next._changeLog ?? []).length).toBe(prevLen);
  });
});

// ── applyAiOp — move_rib ──────────────────────────────────────────────────
describe('applyAiOp — move_rib', () => {
  it('no-op on missing, empty, or non-string ribId', () => {
    const p = makeProductForMove();
    expect(applyAiOp(p, 'move_rib', { targetBackboneId: 'b2' })).toBe(p);
    expect(applyAiOp(p, 'move_rib', { ribId: '', targetBackboneId: 'b2' })).toBe(p);
    expect(applyAiOp(p, 'move_rib', { ribId: 42, targetBackboneId: 'b2' })).toBe(p);
  });
  it('delegates to the transform: backbone move applies', () => {
    const p = makeProductForMove();
    const next = applyAiOp(p, 'move_rib', { ribId: 'r1', targetBackboneId: 'b2' });
    expect(locateRib(next, 'r1')?.backboneId).toBe('b2');
  });
  it('non-string targetBackboneId degrades to undefined; valid release leg still applies', () => {
    const p = makeProductForMove();
    const next = applyAiOp(p, 'move_rib',
      { ribId: 'r1', targetBackboneId: 42, targetReleaseId: 'rel-1' });
    const loc = locateRib(next, 'r1');
    expect(loc?.backboneId).toBe('b1'); // unmoved
    expect(loc?.rib.releaseAllocations).toEqual([{ releaseId: 'rel-1', percentage: 100 }]);
  });
  it('both targets non-string degrade to undefined → CALL-1 ref-equal no-op', () => {
    const p = makeProductForMove();
    expect(applyAiOp(p, 'move_rib',
      { ribId: 'r1', targetBackboneId: 42, targetReleaseId: null })).toBe(p);
  });
  it('ghost ribId passes through as a ref-equal no-op', () => {
    const p = makeProductForMove();
    expect(applyAiOp(p, 'move_rib', { ribId: 'ghost', targetBackboneId: 'b2' })).toBe(p);
  });
  it('changelog entry via the op carries the rib id and source ai', () => {
    const p = makeProductForMove();
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'move_rib', { ribId: 'r1', targetBackboneId: 'b2' });
    const log = next._changeLog ?? [];
    expect(log.length).toBe(prevLen + 1);
    expect(log[log.length - 1]).toMatchObject({
      op: 'update', entity: 'rib', id: 'r1', source: 'ai',
    });
  });
});

// ── applyAiOp — bulk_move_ribs ────────────────────────────────────────────
describe('applyAiOp — bulk_move_ribs', () => {
  it('is ref-equal no-op for an empty moves array', () => {
    const p = makeProductForMove();
    expect(applyAiOp(p, 'bulk_move_ribs', { moves: [] })).toBe(p);
  });
  it('is ref-equal no-op for missing or non-array moves', () => {
    const p = makeProductForMove();
    expect(applyAiOp(p, 'bulk_move_ribs', {})).toBe(p);
    expect(applyAiOp(p, 'bulk_move_ribs', { moves: 'r1' })).toBe(p);
  });
  it('skips malformed entries (null / string / missing ribId) and applies valid siblings', () => {
    const p = makeProductForMove();
    const next = applyAiOp(p, 'bulk_move_ribs', {
      moves: [null, 'junk', { targetBackboneId: 'b2' }, { ribId: 'r1', targetBackboneId: 'b2' }],
    });
    expect(locateRib(next, 'r1')?.backboneId).toBe('b2');
  });
  it('multi-entry happy path: two moves in one call', () => {
    const p = makeProductForMove();
    const next = applyAiOp(p, 'bulk_move_ribs', {
      moves: [
        { ribId: 'r1', targetBackboneId: 'b2' },
        { ribId: 'r2', targetReleaseId: 'rel-2' },
      ],
    });
    expect(locateRib(next, 'r1')?.backboneId).toBe('b2');
    expect(locateRib(next, 'r2')?.rib.releaseAllocations)
      .toEqual([{ releaseId: 'rel-2', percentage: 100 }]);
  });
  it('per-entry skip does not affect siblings (ghost ribId + valid entry)', () => {
    const p = makeProductForMove();
    const next = applyAiOp(p, 'bulk_move_ribs', {
      moves: [
        { ribId: 'ghost', targetBackboneId: 'b2' },
        { ribId: 'r1', targetBackboneId: 'b2' },
      ],
    });
    expect(locateRib(next, 'r1')?.backboneId).toBe('b2');
  });
  it('entry with invalid targets is skipped silently; sibling applies', () => {
    const p = makeProductForMove();
    const next = applyAiOp(p, 'bulk_move_ribs', {
      moves: [
        { ribId: 'r1', targetBackboneId: 99 },       // degrades to no targets → CALL-1 skip
        { ribId: 'r2', targetReleaseId: 'rel-2' },
      ],
    });
    expect(locateRib(next, 'r1')?.backboneId).toBe('b1'); // unmoved
    expect(locateRib(next, 'r2')?.rib.releaseAllocations)
      .toEqual([{ releaseId: 'rel-2', percentage: 100 }]);
  });
  it('all-skip batch is ref-equal (mixed skip reasons, no changelog entry)', () => {
    const p = makeProductForMove();
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_move_ribs', {
      moves: [
        { ribId: 'ghost', targetBackboneId: 'b2' },   // CALL-2
        { ribId: 'r2', targetBackboneId: 'b1' },      // BB-2
        { ribId: 'r4', targetReleaseId: 'rel-2' },    // REL-4 split
        { ribId: 'r3', targetReleaseId: 'rel-2' },    // REL-3 locked
      ],
    });
    expect(next).toBe(p);
    expect((next._changeLog ?? []).length).toBe(prevLen);
  });
  it('collapses N moves to exactly one summary changelog entry (no id, prev-base)', () => {
    const p = makeProductForMove();
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_move_ribs', {
      moves: [
        { ribId: 'r1', targetBackboneId: 'b2' },
        { ribId: 'r2', targetReleaseId: 'rel-2' },
      ],
    });
    const log = next._changeLog ?? [];
    expect(log.length).toBe(prevLen + 1); // prev-base collapse, not prevLen + 2
    const last = log[log.length - 1]!;
    expect(last.op).toBe('update');
    expect(last.entity).toBe('rib');
    expect(last.source).toBe('ai');
    expect(last.id).toBeUndefined();
  });
  it('re-running the same bulk move is ref-equal (BB-2/REL-5 idempotence)', () => {
    const p = makeProductForMove();
    const moves = [
      { ribId: 'r1', targetBackboneId: 'b2' },
      { ribId: 'r2', targetReleaseId: 'rel-2' },
    ];
    const once = applyAiOp(p, 'bulk_move_ribs', { moves });
    expect(once).not.toBe(p);
    expect(applyAiOp(once, 'bulk_move_ribs', { moves })).toBe(once);
  });
});

// ── Drain / no-throw — Phase 7 (move_rib / bulk_move_ribs) ────────────────
describe('applyDrainOps — Phase 7 (move_rib / bulk_move_ribs)', () => {
  it('computeSafePrefix includes both move ops (no-throw on ghost payloads)', () => {
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'move_rib', payload: { ribId: 'ghost', targetBackboneId: 'x' } },
      { seq: 2, op: 'bulk_move_ribs', payload: { moves: [{ ribId: 'ghost' }] } },
    ];
    const { safeOps, nextSeq } = computeSafePrefix(makeProduct(), ops);
    expect(safeOps).toHaveLength(2);
    expect(nextSeq).toBe(2);
  });
  it('move_rib in drain applies and advances cursor', () => {
    const p = makeProductForMove();
    const ops: AiOpDoc[] = [
      { seq: 5, op: 'move_rib', payload: { ribId: 'r1', targetBackboneId: 'b2' } },
    ];
    const { product: result, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(5);
    expect(locateRib(result, 'r1')?.backboneId).toBe('b2');
  });
  it('replaying an already-applied move drain is ref-equal with no duplicate entry', () => {
    // BB-2/REL-5 make "already there" a ref-equal no-op — the favorable
    // difference from bulk_update_ribs' replace-semantics replay profile.
    const p = makeProductForMove();
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'move_rib',
        payload: { ribId: 'r1', targetBackboneId: 'b2', targetReleaseId: 'rel-1' } },
    ];
    const { product: once } = applyDrainOps(p, ops);
    expect(locateRib(once, 'r1')?.backboneId).toBe('b2');
    const onceLen = (once._changeLog ?? []).length;
    const { product: twice } = applyDrainOps(once, ops);
    expect(twice).toBe(once);
    expect((twice._changeLog ?? []).length).toBe(onceLen);
  });
  it('all-ghost bulk_move_ribs in drain: cursor advances, product ref-equal', () => {
    const p = makeProductForMove();
    const ops: AiOpDoc[] = [
      { seq: 9, op: 'bulk_move_ribs',
        payload: { moves: [{ ribId: 'ghost', targetBackboneId: 'b2' }] } },
    ];
    const { product: result, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(9);
    expect(result).toBe(p);
  });
});

// ── Phase 8: appendRibNoteInProduct (transform) ──────────────────────────────
describe('appendRibNoteInProduct', () => {
  // makeProductWithContent has t1/b1/r1 (notes: ''). Seed r1's notes; pass
  // undefined to model an imported/hand-edited rib with no notes field at all.
  function withRibNotes(notes: string | undefined): Product {
    const p = makeProductWithContent();
    const rib = p.themes[0]!.backboneItems[0]!.ribItems[0]!;
    if (notes === undefined) delete rib.notes;   // absent — reads as undefined
    else rib.notes = notes;
    return p;
  }
  const ribNotesOf = (p: Product) => p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes;

  it('appends to a rib with existing notes, blank-line separated', () => {
    const p = withRibNotes('First line.');
    const next = appendRibNoteInProduct(p, 'r1', 'Second line.');
    expect(ribNotesOf(next)).toBe('First line.\n\nSecond line.');
    // +1: the single-entity changelog entry carries id: ribId
    const log = next._changeLog ?? [];
    const last = log[log.length - 1];
    expect(last?.op).toBe('update');
    expect(last?.entity).toBe('rib');
    expect(last?.id).toBe('r1');
    expect(last?.source).toBe('ai');
  });

  it('sets notes directly when existing notes are "" (no leading separator)', () => {
    const next = appendRibNoteInProduct(withRibNotes(''), 'r1', 'Only line.');
    expect(ribNotesOf(next)).toBe('Only line.');
  });

  it('sets notes directly when notes is undefined (imported/hand-edited)', () => {
    const next = appendRibNoteInProduct(withRibNotes(undefined), 'r1', 'Only line.');
    expect(ribNotesOf(next)).toBe('Only line.');
  });

  it('strips trailing whitespace from existing notes before joining', () => {
    const next = appendRibNoteInProduct(withRibNotes('First line.   \n\t '), 'r1', 'Second line.');
    expect(ribNotesOf(next)).toBe('First line.\n\nSecond line.');
  });

  it('trims the incoming text', () => {
    const next = appendRibNoteInProduct(withRibNotes('First.'), 'r1', '   Second.   ');
    expect(ribNotesOf(next)).toBe('First.\n\nSecond.');
  });

  it('APP-1: whitespace-only text is ref-equal', () => {
    const p = withRibNotes('First.');
    expect(appendRibNoteInProduct(p, 'r1', '   \n\t ')).toBe(p);
  });

  it('APP-2: unknown ribId is ref-equal', () => {
    const p = withRibNotes('First.');
    expect(appendRibNoteInProduct(p, 'ghost', 'Second.')).toBe(p);
  });

  it('APP-3 over: result > NOTES_MAX is ref-equal, rib notes byte-identical', () => {
    const base = 'x'.repeat(1990);
    const p = withRibNotes(base);
    const next = appendRibNoteInProduct(p, 'r1', 'y'.repeat(20)); // 1990 + 2 + 20 = 2012 > 2000
    expect(next).toBe(p);
    expect(ribNotesOf(next)).toBe(base);
  });

  it('APP-3 boundary: result === NOTES_MAX succeeds (empty base, 2000-char addition)', () => {
    const addition = 'z'.repeat(2000);
    const next = appendRibNoteInProduct(withRibNotes(''), 'r1', addition);
    expect(next).not.toBe(withRibNotes(''));
    expect(ribNotesOf(next)).toBe(addition);
    expect(ribNotesOf(next)!.length).toBe(2000);
  });

  it('APP-3 boundary with separator: base + 2 + addition === NOTES_MAX succeeds', () => {
    const base = 'a'.repeat(1000);
    const addition = 'b'.repeat(998); // 1000 + 2 + 998 = 2000
    const next = appendRibNoteInProduct(withRibNotes(base), 'r1', addition);
    expect(ribNotesOf(next)!.length).toBe(2000);
    expect(ribNotesOf(next)).toBe(`${base}\n\n${addition}`);
  });

  it('appends on a locked rib (D5: no lock guard)', () => {
    const p = withRibNotes('First.');
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory = [
      { sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 },
    ];
    const next = appendRibNoteInProduct(p, 'r1', 'Second.');
    expect(ribNotesOf(next)).toBe('First.\n\nSecond.');
  });
});

// ── Phase 8: append_rib_note (op) ────────────────────────────────────────────
describe('applyAiOp — append_rib_note', () => {
  it('delegates and appends', () => {
    const p = makeProductWithContent();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes = 'First.';
    const next = applyAiOp(p, 'append_rib_note', { ribId: 'r1', text: 'Second.' });
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.notes).toBe('First.\n\nSecond.');
  });

  it('non-string ribId is ref-equal', () => {
    const p = makeProductWithContent();
    expect(applyAiOp(p, 'append_rib_note', { ribId: 42, text: 'x' })).toBe(p);
  });

  it('non-string text is ref-equal', () => {
    const p = makeProductWithContent();
    expect(applyAiOp(p, 'append_rib_note', { ribId: 'r1', text: 42 })).toBe(p);
  });
});

// ── Phase 8: bulk_append_rib_notes (op) ──────────────────────────────────────
describe('applyAiOp — bulk_append_rib_notes', () => {
  function twoRibs(): Product {
    let p = makeProductWithContent(); // t1/b1/r1
    p = applyAiOp(p, 'create_rib', { themeId: 't1', backboneId: 'b1', ribId: 'r2', name: 'Rib2' });
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes = 'A1.';
    p.themes[0]!.backboneItems[0]!.ribItems[1]!.notes = 'B1.';
    return p;
  }
  const notesById = (p: Product, id: string) =>
    p.themes[0]!.backboneItems[0]!.ribItems.find(r => r.id === id)!.notes;

  it('appends to multiple ribs in one call', () => {
    const next = applyAiOp(twoRibs(), 'bulk_append_rib_notes', {
      notes: [{ ribId: 'r1', text: 'A2.' }, { ribId: 'r2', text: 'B2.' }],
    });
    expect(notesById(next, 'r1')).toBe('A1.\n\nA2.');
    expect(notesById(next, 'r2')).toBe('B1.\n\nB2.');
  });

  it('N→1 changelog collapse: log grows by exactly one (catches prev-vs-next)', () => {
    const p = twoRibs();
    const prevLen = (p._changeLog ?? []).length;
    const next = applyAiOp(p, 'bulk_append_rib_notes', {
      notes: [{ ribId: 'r1', text: 'A2.' }, { ribId: 'r2', text: 'B2.' }],
    });
    expect((next._changeLog ?? []).length).toBe(prevLen + 1);
  });

  it('summary changelog entry has no id field', () => {
    const next = applyAiOp(twoRibs(), 'bulk_append_rib_notes', {
      notes: [{ ribId: 'r1', text: 'A2.' }, { ribId: 'r2', text: 'B2.' }],
    });
    const log = next._changeLog ?? [];
    const last = log[log.length - 1];
    expect(last?.op).toBe('update');
    expect(last?.entity).toBe('rib');
    expect(last?.source).toBe('ai');
    expect(last?.id).toBeUndefined();
  });

  it('all-unknown-ribId batch is ref-equal, no changelog entry', () => {
    const p = twoRibs();
    const next = applyAiOp(p, 'bulk_append_rib_notes', {
      notes: [{ ribId: 'ghost1', text: 'x' }, { ribId: 'ghost2', text: 'y' }],
    });
    expect(next).toBe(p);
  });

  it('malformed entries skipped, valid siblings apply', () => {
    const next = applyAiOp(twoRibs(), 'bulk_append_rib_notes', {
      notes: [null, { text: 'no ribId' }, { ribId: 'r1', text: 42 }, { ribId: 'r1', text: 'A2.' }],
    });
    expect(notesById(next, 'r1')).toBe('A1.\n\nA2.');
    expect(notesById(next, 'r2')).toBe('B1.'); // untouched
  });

  it('mixed batch with one over-cap rib: that rib unchanged, others append', () => {
    const p = twoRibs();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes = 'x'.repeat(1995); // r1 near cap
    const next = applyAiOp(p, 'bulk_append_rib_notes', {
      notes: [{ ribId: 'r1', text: 'yyyyy' }, { ribId: 'r2', text: 'B2.' }], // r1: 1995+2+5>2000 skip
    });
    expect(notesById(next, 'r1')).toBe('x'.repeat(1995)); // unchanged
    expect(notesById(next, 'r2')).toBe('B1.\n\nB2.');      // applied
  });

  it('not idempotent: same op twice yields the text twice (locks D2)', () => {
    const op = { notes: [{ ribId: 'r1', text: 'A2.' }] };
    const once = applyAiOp(twoRibs(), 'bulk_append_rib_notes', op);
    const twice = applyAiOp(once, 'bulk_append_rib_notes', op);
    expect(notesById(twice, 'r1')).toBe('A1.\n\nA2.\n\nA2.');
  });

  it('repeated ribId cumulative in array order', () => {
    const next = applyAiOp(twoRibs(), 'bulk_append_rib_notes', {
      notes: [{ ribId: 'r1', text: 'A2.' }, { ribId: 'r1', text: 'A3.' }],
    });
    expect(notesById(next, 'r1')).toBe('A1.\n\nA2.\n\nA3.');
  });

  it('position-dependent skip: first entry pushes near cap, second exceeds and skips', () => {
    const p = twoRibs();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes = 'a'.repeat(1000);
    const first = 'b'.repeat(990);  // 1000 + 2 + 990 = 1992 (applies)
    const second = 'c'.repeat(20);  // 1992 + 2 + 20 = 2014 > 2000 (skips)
    const next = applyAiOp(p, 'bulk_append_rib_notes', {
      notes: [{ ribId: 'r1', text: first }, { ribId: 'r1', text: second }],
    });
    expect(notesById(next, 'r1')).toBe(`${'a'.repeat(1000)}\n\n${first}`);
  });
});

// ── Phase 8: buildAiSnapshot notes / notesIncluded ───────────────────────────
describe('buildAiSnapshot — Phase 8 notes', () => {
  it('includes notes per rib by default; top-level notesIncluded === true', () => {
    const p = makeProductWithContent();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes = 'Hello.';
    const snap = buildAiSnapshot(p);
    expect(snap.notesIncluded).toBe(true);
    expect(snap.themes[0]!.backboneItems[0]!.ribItems[0]!.notes).toBe('Hello.');
  });

  it('normalizes absent notes to ""', () => {
    const p = makeProductWithContent();
    delete p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes;
    const snap = buildAiSnapshot(p);
    expect(snap.themes[0]!.backboneItems[0]!.ribItems[0]!.notes).toBe('');
  });

  it('{ includeNotes:false } omits every per-rib notes key', () => {
    const p = makeProductWithContent();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes = 'Hello.';
    const snap = buildAiSnapshot(p, { includeNotes: false });
    expect(snap.themes[0]!.backboneItems[0]!.ribItems[0]!).not.toHaveProperty('notes');
  });

  it('{ includeNotes:false } sets top-level notesIncluded === false', () => {
    expect(buildAiSnapshot(makeProductWithContent(), { includeNotes: false }).notesIncluded).toBe(false);
  });

  it('notesIncluded always present (both default and lean builds)', () => {
    expect(buildAiSnapshot(makeProductWithContent())).toHaveProperty('notesIncluded');
    expect(buildAiSnapshot(makeProductWithContent(), { includeNotes: false }))
      .toHaveProperty('notesIncluded');
  });
});

// ── Phase 8: selectSnapshotForWrite (bounded selection) ──────────────────────
describe('selectSnapshotForWrite', () => {
  const byteLen = (v: unknown) => new TextEncoder().encode(JSON.stringify(v)).length;

  it('huge limit → full snapshot, degraded:false, notes present', () => {
    const p = makeProductWithContent();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes = 'Hello.';
    const { snapshot, degraded } = selectSnapshotForWrite(p, 10_000_000);
    expect(degraded).toBe(false);
    expect(snapshot!.notesIncluded).toBe(true);
    expect(snapshot!.themes[0]!.backboneItems[0]!.ribItems[0]!.notes).toBe('Hello.');
  });

  it('limit between lean and full → lean, degraded:true, notesIncluded:false', () => {
    const p = makeProductWithContent();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes = 'x'.repeat(500);
    const fullLen = byteLen(buildAiSnapshot(p, { includeNotes: true }));
    const leanLen = byteLen(buildAiSnapshot(p, { includeNotes: false }));
    const limit = fullLen - 1;                 // full won't fit; lean will
    expect(leanLen).toBeLessThanOrEqual(limit);
    const { snapshot, degraded } = selectSnapshotForWrite(p, limit);
    expect(degraded).toBe(true);
    expect(snapshot!.notesIncluded).toBe(false);
  });

  it('limit below lean size → { snapshot:null, degraded:true }', () => {
    const { snapshot, degraded } = selectSnapshotForWrite(makeProductWithContent(), 10);
    expect(snapshot).toBeNull();
    expect(degraded).toBe(true);
  });
});

// ── Phase 8: drain / probe ───────────────────────────────────────────────────
describe('Phase 8 drain / probe', () => {
  it('applyDrainOps with an append_rib_note op applies it, returns right nextSeq', () => {
    const p = makeProductWithContent();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.notes = 'First.';
    const ops: AiOpDoc[] = [
      { seq: 7, op: 'append_rib_note', payload: { ribId: 'r1', text: 'Second.' } },
    ];
    const { product, nextSeq } = applyDrainOps(p, ops);
    expect(nextSeq).toBe(7);
    expect(product.themes[0]!.backboneItems[0]!.ribItems[0]!.notes).toBe('First.\n\nSecond.');
  });

  it('computeSafePrefix passes both new ops through (no-throw)', () => {
    const p = makeProductWithContent();
    const ops: AiOpDoc[] = [
      { seq: 1, op: 'append_rib_note', payload: { ribId: 'r1', text: 'x' } },
      { seq: 2, op: 'bulk_append_rib_notes', payload: { notes: [{ ribId: 'r1', text: 'y' }] } },
    ];
    const { safeOps, nextSeq } = computeSafePrefix(p, ops);
    expect(safeOps.length).toBe(2);
    expect(nextSeq).toBe(2);
  });
});
