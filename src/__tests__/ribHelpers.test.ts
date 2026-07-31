// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { forEachRib, reduceRibs, isRibLocked, computeRibSiblingName } from '../lib/ribHelpers';
import type { ProgressEntry } from '../types';

const product = {
  themes: [
    {
      id: 't1', name: 'Theme 1', order: 1,
      backboneItems: [
        {
          id: 'b1', name: 'Backbone 1', description: '', order: 1,
          ribItems: [
            { id: 'r1', name: 'Rib 1', description: '', order: 1, size: null, category: 'core' as const, releaseAllocations: [], progressHistory: [] },
            { id: 'r2', name: 'Rib 2', description: '', order: 2, size: null, category: 'core' as const, releaseAllocations: [], progressHistory: [] },
          ],
        },
        {
          id: 'b2', name: 'Backbone 2', description: '', order: 2,
          ribItems: [{ id: 'r3', name: 'Rib 3', description: '', order: 3, size: null, category: 'core' as const, releaseAllocations: [], progressHistory: [] }],
        },
      ],
    },
    {
      id: 't2', name: 'Theme 2', order: 2,
      backboneItems: [
        {
          id: 'b3', name: 'Backbone 3', description: '', order: 1,
          ribItems: [{ id: 'r4', name: 'Rib 4', description: '', order: 4, size: null, category: 'core' as const, releaseAllocations: [], progressHistory: [] }],
        },
      ],
    },
  ],
};

describe('forEachRib', () => {
  it('visits every rib with correct context', () => {
    const visited: Array<{ ribId: string; themeId: string; backboneId: string }> = [];
    forEachRib(product, (rib, { theme, backbone }) => {
      visited.push({ ribId: rib.id, themeId: theme.id, backboneId: backbone.id });
    });
    expect(visited).toEqual([
      { ribId: 'r1', themeId: 't1', backboneId: 'b1' },
      { ribId: 'r2', themeId: 't1', backboneId: 'b1' },
      { ribId: 'r3', themeId: 't1', backboneId: 'b2' },
      { ribId: 'r4', themeId: 't2', backboneId: 'b3' },
    ]);
  });

  it('handles empty themes', () => {
    const visited: string[] = [];
    forEachRib({ themes: [] }, (rib) => visited.push(rib.id));
    expect(visited).toEqual([]);
  });

  it('handles themes with no backbones', () => {
    const visited: string[] = [];
    forEachRib({ themes: [{ id: 't1', name: 'Theme 1', order: 1, backboneItems: [] }] }, (rib) => visited.push(rib.id));
    expect(visited).toEqual([]);
  });
});

describe('reduceRibs', () => {
  it('accumulates across all ribs', () => {
    const count = reduceRibs(product, (sum) => sum + 1, 0);
    expect(count).toBe(4);
  });

  it('provides context in reducer', () => {
    const names = reduceRibs(product, (acc, rib, { backbone }) => {
      acc.push(`${backbone.name}/${rib.name}`);
      return acc;
    }, [] as string[]);
    expect(names).toEqual([
      'Backbone 1/Rib 1',
      'Backbone 1/Rib 2',
      'Backbone 2/Rib 3',
      'Backbone 3/Rib 4',
    ]);
  });

  it('returns initial value for empty product', () => {
    const result = reduceRibs({ themes: [] }, (sum) => sum + 1, 42);
    expect(result).toBe(42);
  });
});

describe('isRibLocked', () => {
  it('returns false for an empty progressHistory', () => {
    expect(isRibLocked({ progressHistory: [] })).toBe(false);
  });
  it('returns false when percentComplete is 0', () => {
    expect(isRibLocked({
      progressHistory: [{ sprintId: 's1', releaseId: 'r1', percentComplete: 0 } as ProgressEntry],
    })).toBe(false);
  });
  it('returns false when percentComplete is null', () => {
    expect(isRibLocked({
      progressHistory: [{ sprintId: 's1', releaseId: 'r1', percentComplete: null } as ProgressEntry],
    })).toBe(false);
  });
  it('returns true when any entry has percentComplete > 0', () => {
    expect(isRibLocked({
      progressHistory: [{ sprintId: 's1', releaseId: 'r1', percentComplete: 50 } as ProgressEntry],
    })).toBe(true);
  });
  it('returns false when progressHistory is absent (hand-edited rib)', () => {
    // as unknown as ProgressEntry[] — established no-any pattern (aiOps.test.ts:258)
    const noHistory = { progressHistory: undefined as unknown as ProgressEntry[] };
    expect(isRibLocked(noHistory)).toBe(false);
  });
});

describe('computeRibSiblingName', () => {
  // ── Clone (keepOriginal=true): original never renamed ──────────────────────
  it('clones an unsuffixed name to (1)', () => {
    expect(computeRibSiblingName([{ name: 'Foo' }], 'Foo', true))
      .toEqual({ originalName: 'Foo', newName: 'Foo (1)' });
  });

  it('clones to (2) when (1) already exists', () => {
    expect(computeRibSiblingName([{ name: 'Foo' }, { name: 'Foo (1)' }], 'Foo', true))
      .toEqual({ originalName: 'Foo', newName: 'Foo (2)' });
  });

  it('clones an already-suffixed name without renaming the original', () => {
    expect(computeRibSiblingName([{ name: 'Foo (2)' }], 'Foo (2)', true))
      .toEqual({ originalName: 'Foo (2)', newName: 'Foo (3)' });
  });

  // ── Split (keepOriginal=false) ─────────────────────────────────────────────
  it('splits an unsuffixed name into (1) and (2)', () => {
    expect(computeRibSiblingName([{ name: 'Foo' }], 'Foo', false))
      .toEqual({ originalName: 'Foo (1)', newName: 'Foo (2)' });
  });

  it('splits a suffixed sibling without renaming it, avoiding collisions', () => {
    // siblings [Foo (1), Foo (2)]; split Foo (1) → keeps Foo (1), new Foo (3)
    expect(computeRibSiblingName(
      [{ name: 'Foo (1)' }, { name: 'Foo (2)' }], 'Foo (1)', false,
    )).toEqual({ originalName: 'Foo (1)', newName: 'Foo (3)' });
  });

  it('splits a lone suffixed name, keeping it and appending the next number', () => {
    expect(computeRibSiblingName([{ name: 'Foo (1)' }], 'Foo (1)', false))
      .toEqual({ originalName: 'Foo (1)', newName: 'Foo (2)' });
  });

  // ── Regex-special prefix: verifies escapedPrefix ───────────────────────────
  it('handles a prefix containing regex metacharacters', () => {
    expect(computeRibSiblingName([{ name: 'Cost ($)' }], 'Cost ($)', true))
      .toEqual({ originalName: 'Cost ($)', newName: 'Cost ($) (1)' });
  });
});
