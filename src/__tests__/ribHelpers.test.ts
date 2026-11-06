// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { forEachRib, reduceRibs, isRibLocked, computeRibSiblingName, ribSizeLockNote, sizeLockNote, transferAllocation } from '../lib/ribHelpers';
import type { ProgressEntry, ReleaseAllocation, RibItem, Sprint } from '../types';
import { req } from './testHelpers';

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

describe('sizeLockNote', () => {
  it('names the sprint', () => {
    expect(sizeLockNote('Sprint 4')).toBe('Size locked: progress recorded in Sprint 4');
  });

  it('still reads as a sentence with no sprint to name', () => {
    expect(sizeLockNote(null)).toBe('Size locked: progress recorded');
  });
});

describe('ribSizeLockNote', () => {
  const sprints: Sprint[] = [
    { id: 's1', name: 'Sprint 1', order: 1, endDate: null },
    { id: 's2', name: 'Sprint 2', order: 2, endDate: null },
  ];
  const onR1 = [{ releaseId: 'r1', percentage: 100 }];
  const at = (sprintId: string, releaseId: string, percentComplete: number) => ({ sprintId, releaseId, percentComplete });

  it('names the latest sprint above 0, reading sprint order rather than array position', () => {
    const rib = { releaseAllocations: onR1, progressHistory: [at('s1', 'r1', 10), at('s2', 'r1', 20)] };
    expect(ribSizeLockNote(rib, [...sprints].reverse())).toBe('Size locked: progress recorded in Sprint 2');
  });

  it('is null on a rib whose only record is on a release it left', () => {
    expect(ribSizeLockNote({ releaseAllocations: onR1, progressHistory: [at('s1', 'r2', 30)] }, sprints)).toBeNull();
  });

  it('does not throw on a hand-edited rib or product', () => {
    expect(ribSizeLockNote({ releaseAllocations: onR1, progressHistory: [at('s1', 'r1', 30)] }, undefined)).toBeNull();
    expect(ribSizeLockNote({} as Pick<RibItem, 'progressHistory' | 'releaseAllocations'>, sprints)).toBeNull();
  });

  it.each<[string, ReleaseAllocation[], ProgressEntry[]]>([
    ['locked', onR1, [at('s1', 'r1', 10)]],
    ['locked by an earlier sprint', onR1, [at('s1', 'r1', 10), at('s2', 'r1', 0)]],
    ['a typed 0', onR1, [at('s1', 'r1', 0)]],
    ['no progress', onR1, []],
    ['parked', [], [at('s1', 'r1', 10)]],
  ])('agrees with isRibLocked: %s', (_case, releaseAllocations, progressHistory) => {
    const rib = { releaseAllocations, progressHistory };
    expect(ribSizeLockNote(rib, sprints) !== null).toBe(isRibLocked(rib, sprints));
  });
});

describe('isRibLocked', () => {
  const sprints: Sprint[] = ['s1', 's2'].map((id, i) => ({ id, name: id, order: i + 1, endDate: null }));
  const on = (releaseId: string) => [{ releaseId, percentage: 100 }];
  const entry = (sprintId: string, releaseId: string, percentComplete: number | null) =>
    ({ sprintId, releaseId, percentComplete }) as ProgressEntry;

  it('returns false for an empty progressHistory', () => {
    expect(isRibLocked({ releaseAllocations: on('r1'), progressHistory: [] }, sprints)).toBe(false);
  });
  it('returns false when percentComplete is 0', () => {
    expect(isRibLocked({ releaseAllocations: on('r1'), progressHistory: [entry('s1', 'r1', 0)] }, sprints)).toBe(false);
  });
  it('returns false when percentComplete is null', () => {
    expect(isRibLocked({ releaseAllocations: on('r1'), progressHistory: [entry('s1', 'r1', null)] }, sprints)).toBe(false);
  });
  it('returns true when an effective entry above 0 sits on a current allocation', () => {
    expect(isRibLocked({ releaseAllocations: on('r1'), progressHistory: [entry('s1', 'r1', 50)] }, sprints)).toBe(true);
  });
  it('stays locked when a later sprint reads 0', () => {
    expect(isRibLocked({ releaseAllocations: on('r1'), progressHistory: [entry('s1', 'r1', 50), entry('s2', 'r1', 0)] }, sprints)).toBe(true);
  });
  it('returns false when the only progress is on a release the rib has left', () => {
    expect(isRibLocked({ releaseAllocations: on('r2'), progressHistory: [entry('s1', 'r1', 50)] }, sprints)).toBe(false);
  });
  it('returns false for a parked rib', () => {
    expect(isRibLocked({ releaseAllocations: [], progressHistory: [entry('s1', 'r1', 50)] }, sprints)).toBe(false);
  });
  it('returns false for a sprint the product does not hold', () => {
    expect(isRibLocked({ releaseAllocations: on('r1'), progressHistory: [entry('gone', 'r1', 50)] }, sprints)).toBe(false);
  });
  it('reads only the first entry for a (sprint, release)', () => {
    expect(isRibLocked({ releaseAllocations: on('r1'), progressHistory: [entry('s1', 'r1', 0), entry('s1', 'r1', 50)] }, sprints)).toBe(false);
  });
  it('does not throw on a hand-edited rib or product', () => {
    // as unknown as — established no-any pattern (aiOps.test.ts:258)
    const bare = { progressHistory: undefined, releaseAllocations: undefined } as unknown as RibItem;
    expect(isRibLocked(bare, sprints)).toBe(false);
    expect(isRibLocked({ releaseAllocations: on('r1'), progressHistory: [entry('s1', 'r1', 50)] }, undefined)).toBe(false);
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

function makeRib(id: string, allocations: ReleaseAllocation[] = []): RibItem {
  return { id, name: `Rib ${id}`, description: '', releaseAllocations: allocations, size: null, category: 'core', order: 1, progressHistory: [] };
}

// Moved here from mapMutations.test.ts with the function (v0.53.17): this file is
// inside the Stryker scope and that one is not, so the tests have to follow it.
describe('transferAllocation', () => {
  it('clears allocations when moving to unassigned', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 100, memo: 'note' }]);
    expect(transferAllocation(rib, 'rel-A', null)).toEqual([]);
  });

  it('creates fresh allocation when moving from unassigned', () => {
    const rib = makeRib('r1');
    expect(transferAllocation(rib, null, 'rel-B')).toEqual([
      { releaseId: 'rel-B', percentage: 100, memo: '' },
    ]);
  });

  it('swaps allocation from one release to another', () => {
    const rib = makeRib('r1', [{ releaseId: 'rel-A', percentage: 60, memo: 'keep' }]);
    const result = req(transferAllocation(rib, 'rel-A', 'rel-B'), 'result');
    expect(result).toEqual([{ releaseId: 'rel-B', percentage: 60, memo: 'keep' }]);
  });

  it('returns null when rib already has the target release (duplicate guard)', () => {
    const rib = makeRib('r1', [
      { releaseId: 'rel-A', percentage: 50, memo: '' },
      { releaseId: 'rel-B', percentage: 50, memo: '' },
    ]);
    expect(transferAllocation(rib, 'rel-A', 'rel-B')).toBeNull();
  });

  it('preserves other allocations during release-to-release transfer', () => {
    const rib = makeRib('r1', [
      { releaseId: 'rel-A', percentage: 40, memo: '' },
      { releaseId: 'rel-C', percentage: 60, memo: 'other' },
    ]);
    const result = req(transferAllocation(rib, 'rel-A', 'rel-B'), 'result');
    expect(result).toHaveLength(2);
    expect(result.find(a => a.releaseId === 'rel-C')).toEqual({ releaseId: 'rel-C', percentage: 60, memo: 'other' });
    expect(result.find(a => a.releaseId === 'rel-B')).toEqual({ releaseId: 'rel-B', percentage: 40, memo: '' });
  });
});
