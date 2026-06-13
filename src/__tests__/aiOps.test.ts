// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import type { Product } from '../types';
import { applyAiOp, computeSafePrefix, type AiOpDoc } from '../lib/aiOps';

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
