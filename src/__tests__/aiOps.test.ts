// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import type { Product } from '../types';
import { applyAiOp, applyDrainOps, computeSafePrefix, type AiOpDoc } from '../lib/aiOps';
import { addNamedReleaseToProduct } from '../hooks/useProductMutations';
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
  let p = makeProduct();
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
});
