// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, vi } from 'vitest';
import {
  splitRibInProduct, addNamedRibToProduct, cloneRibInProduct,
  addNamedReleaseToProduct, allocateRibInProduct, unassignRibInProduct,
  addNamedThemeToProduct, addNamedBackboneToProduct,
} from '../lib/productTransforms';
import type { Product, ReleaseAllocation, Theme, Backbone, RibItem, Size, Category } from '../types';

// Mock crypto.randomUUID
let uuidCounter = 0;
vi.stubGlobal('crypto', {
  randomUUID: () => `uuid-${++uuidCounter}`,
});

// We test the mutation logic extracted from useProductMutations by simulating
// the updateProduct callback pattern — same approach as mapMutations.test.ts.
// The hook itself just wraps these patterns in useCallback, so testing the
// updater functions directly covers the core logic.

function makeRib(id: string, { size = null, category = 'core' }: {
  size?: Size;
  category?: Category;
} = {}): RibItem {
  return {
    id,
    name: `Rib ${id}`,
    description: '',
    size,
    category,
    order: 1,
    releaseAllocations: [],
    progressHistory: [],
  };
}

function makeBackbone(id: string, ribs: RibItem[] = []): Backbone {
  return { id, name: `Backbone ${id}`, ribItems: ribs, order: 1 };
}

function makeTheme(id: string, backbones: Backbone[] = []): Theme {
  return { id, name: `Theme ${id}`, backboneItems: backbones, order: 1 };
}

function makeProduct({ themes = [] }: { themes?: Theme[] } = {}): Product {
  return {
    id: 'p1',
    name: 'Test Product',
    description: '',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2,
    themes,
    releases: [],
    sprints: [],
    sizeMapping: [],
  };
}

// Simulate updateTheme(themeId, updater) — returns the updated product
function applyUpdateTheme(product: Product, themeId: string, updater: ((t: Theme) => Theme) | Partial<Theme>): Product {
  return {
    ...product,
    themes: product.themes.map(t =>
      t.id === themeId ? (typeof updater === 'function' ? updater(t) : { ...t, ...updater }) : t
    ),
  };
}

function applyUpdateBackbone(product: Product, themeId: string, backboneId: string, updater: ((b: Backbone) => Backbone) | Partial<Backbone>): Product {
  return {
    ...product,
    themes: product.themes.map(t =>
      t.id === themeId
        ? {
          ...t,
          backboneItems: t.backboneItems.map(b =>
            b.id === backboneId ? (typeof updater === 'function' ? updater(b) : { ...b, ...updater }) : b
          ),
        }
        : t
    ),
  };
}

function applyUpdateRib(product: Product, themeId: string, backboneId: string, ribId: string, updater: ((r: RibItem) => RibItem) | Partial<RibItem>): Product {
  return {
    ...product,
    themes: product.themes.map(t =>
      t.id === themeId
        ? {
          ...t,
          backboneItems: t.backboneItems.map(b =>
            b.id === backboneId
              ? { ...b, ribItems: b.ribItems.map(r => r.id === ribId ? (typeof updater === 'function' ? updater(r) : { ...r, ...updater }) : r) }
              : b
          ),
        }
        : t
    ),
  };
}

function applyMoveItem<T extends { id: string; order: number }>(items: T[], id: string, direction: number, key: keyof T = 'id' as keyof T): T[] {
  const arr = [...items];
  const idx = arr.findIndex(item => item[key] === id);
  if (idx < 0) return items;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= arr.length) return items;
  // Both indices are in range (checked above), but indexed reads are
  // `T | undefined` under noUncheckedIndexedAccess — bind them explicitly
  // rather than swapping through possibly-undefined slots.
  const a = arr[idx];
  const b = arr[newIdx];
  if (a === undefined || b === undefined) return items;
  arr[idx] = b;
  arr[newIdx] = a;
  return arr.map((item, i) => ({ ...item, order: i + 1 }));
}

// --- updateTheme ---
describe('updateTheme', () => {
  it('updates theme with an object', () => {
    const product = makeProduct({ themes: [makeTheme('t1')] });
    const result = applyUpdateTheme(product, 't1', { name: 'Renamed Theme' });
    expect(result.themes[0].name).toBe('Renamed Theme');
  });

  it('updates theme with a function updater', () => {
    const product = makeProduct({ themes: [makeTheme('t1')] });
    const result = applyUpdateTheme(product, 't1', t => ({ ...t, name: t.name + ' Updated' }));
    expect(result.themes[0].name).toBe('Theme t1 Updated');
  });

  it('does not modify other themes', () => {
    const product = makeProduct({ themes: [makeTheme('t1'), makeTheme('t2')] });
    const result = applyUpdateTheme(product, 't1', { name: 'Changed' });
    expect(result.themes[1].name).toBe('Theme t2');
  });
});

// --- updateBackbone ---
describe('updateBackbone', () => {
  it('updates backbone within correct theme', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1'), makeBackbone('b2')])],
    });
    const result = applyUpdateBackbone(product, 't1', 'b1', { name: 'Updated BB' });
    expect(result.themes[0].backboneItems[0].name).toBe('Updated BB');
    expect(result.themes[0].backboneItems[1].name).toBe('Backbone b2');
  });

  it('ignores non-matching theme', () => {
    const product = makeProduct({
      themes: [
        makeTheme('t1', [makeBackbone('b1')]),
        makeTheme('t2', [makeBackbone('b2')]),
      ],
    });
    const result = applyUpdateBackbone(product, 't1', 'b1', { name: 'Changed' });
    expect(result.themes[1].backboneItems[0].name).toBe('Backbone b2');
  });
});

// --- updateRib ---
describe('updateRib', () => {
  it('updates rib within correct backbone', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [makeRib('r1'), makeRib('r2')])])],
    });
    const result = applyUpdateRib(product, 't1', 'b1', 'r1', { name: 'Updated Rib', size: 'XL' });
    expect(result.themes[0].backboneItems[0].ribItems[0].name).toBe('Updated Rib');
    expect(result.themes[0].backboneItems[0].ribItems[0].size).toBe('XL');
    expect(result.themes[0].backboneItems[0].ribItems[1].name).toBe('Rib r2');
  });

  it('applies function updater to rib', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [makeRib('r1', { category: 'core' })])])],
    });
    const result = applyUpdateRib(product, 't1', 'b1', 'r1', r => ({ ...r, category: 'non-core' }));
    expect(result.themes[0].backboneItems[0].ribItems[0].category).toBe('non-core');
  });
});

// --- moveItem ---
describe('moveItem', () => {
  const items = [
    { id: 'a', name: 'A', order: 1 },
    { id: 'b', name: 'B', order: 2 },
    { id: 'c', name: 'C', order: 3 },
  ];

  it('moves item down', () => {
    const result = applyMoveItem(items, 'a', 1);
    expect(result[0].id).toBe('b');
    expect(result[1].id).toBe('a');
    expect(result[2].id).toBe('c');
    // Order fields should be renumbered
    expect(result[0].order).toBe(1);
    expect(result[1].order).toBe(2);
    expect(result[2].order).toBe(3);
  });

  it('moves item up', () => {
    const result = applyMoveItem(items, 'c', -1);
    expect(result[0].id).toBe('a');
    expect(result[1].id).toBe('c');
    expect(result[2].id).toBe('b');
  });

  it('returns original array if item at boundary', () => {
    const result = applyMoveItem(items, 'a', -1);
    expect(result).toBe(items);
  });

  it('returns original array if item at end and moving down', () => {
    const result = applyMoveItem(items, 'c', 1);
    expect(result).toBe(items);
  });

  it('returns original array if item not found', () => {
    const result = applyMoveItem(items, 'nonexistent', 1);
    expect(result).toBe(items);
  });
});

// --- addReleaseAfter (updater logic) ---
// Simulates the updater function from useProductMutations.addReleaseAfter
function applyAddReleaseAfter(product: Product, afterReleaseId: string | null): Product {
  const sorted = [...product.releases].sort((a, b) => a.order - b.order);
  const afterIdx = afterReleaseId
    ? sorted.findIndex(r => r.id === afterReleaseId)
    : -1;
  const insertIdx = afterIdx >= 0 ? afterIdx + 1 : sorted.length;
  const newRelease = {
    id: crypto.randomUUID(),
    name: `Release ${product.releases.length + 1}`,
    order: 0,
    description: '',
    targetDate: null,
  };
  sorted.splice(insertIdx, 0, newRelease);
  return {
    ...product,
    releases: sorted.map((r, i) => ({ ...r, order: i + 1 })),
  };
}

describe('addReleaseAfter', () => {
  const product = {
    releases: [
      { id: 'rel-1', name: 'R1', order: 1 },
      { id: 'rel-2', name: 'R2', order: 2 },
      { id: 'rel-3', name: 'R3', order: 3 },
    ],
  };

  it('inserts after specified release', () => {
    const result = applyAddReleaseAfter(product, 'rel-1');
    expect(result.releases).toHaveLength(4);
    expect(result.releases[0].id).toBe('rel-1');
    expect(result.releases[1].name).toBe('Release 4'); // new release
    expect(result.releases[2].id).toBe('rel-2');
    expect(result.releases[3].id).toBe('rel-3');
  });

  it('appends at end when afterReleaseId is null', () => {
    const result = applyAddReleaseAfter(product, null);
    expect(result.releases).toHaveLength(4);
    expect(result.releases[3].name).toBe('Release 4');
  });

  it('appends at end when afterReleaseId does not exist', () => {
    const result = applyAddReleaseAfter(product, 'nonexistent');
    expect(result.releases).toHaveLength(4);
    expect(result.releases[3].name).toBe('Release 4');
  });

  it('re-indexes order fields to be consecutive', () => {
    const result = applyAddReleaseAfter(product, 'rel-2');
    expect(result.releases.map(r => r.order)).toEqual([1, 2, 3, 4]);
  });

  it('inserts at beginning when afterReleaseId is null and no releases', () => {
    const empty = { releases: [] };
    const result = applyAddReleaseAfter(empty, null);
    expect(result.releases).toHaveLength(1);
    expect(result.releases[0].order).toBe(1);
  });
});

// --- splitRib ---
describe('splitRibInProduct', () => {
  function makeRibNamed(id: string, name: string, opts: { size?: Size; category?: Category } = {}): RibItem {
    return { ...makeRib(id, opts), name };
  }

  function makeProductWithRibs(ribs: RibItem[]): Product {
    return makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', ribs)])],
    });
  }

  function findRibByName(product: Product, name: string): RibItem | undefined {
    return product.themes[0]?.backboneItems[0]?.ribItems.find(r => r.name === name);
  }

  it('original with no suffix renames to "(1)" and creates "(2)"', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'Foo')]);
    const result = splitRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const ribs = result.themes[0].backboneItems[0].ribItems;
    expect(ribs).toHaveLength(2);
    expect(ribs[0].name).toBe('Foo (1)');
    expect(ribs[1].name).toBe('Foo (2)');
    expect(ribs[1].id).toBe('new-uuid');
  });

  it('original with " (3)" suffix preserves original name and creates "(4)"', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'Foo (3)')]);
    const result = splitRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const ribs = result.themes[0].backboneItems[0].ribItems;
    expect(ribs[0].name).toBe('Foo (3)');
    expect(ribs[1].name).toBe('Foo (4)');
  });

  it('name with non-numeric parens like "Login (web)" is treated as no-suffix', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'Login (web)')]);
    const result = splitRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const ribs = result.themes[0].backboneItems[0].ribItems;
    expect(ribs[0].name).toBe('Login (web) (1)');
    expect(ribs[1].name).toBe('Login (web) (2)');
  });

  it('name with multiple suffixes "X (3) (1)" matches the trailing one', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'X (3) (1)')]);
    const result = splitRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const ribs = result.themes[0].backboneItems[0].ribItems;
    expect(ribs[0].name).toBe('X (3) (1)');
    expect(ribs[1].name).toBe('X (3) (2)');
  });

  it('new rib has size: null, empty allocations, empty progress, copied category, cleared description, cleared notes', () => {
    const original = {
      ...makeRib('r1', { size: 'L', category: 'non-core' }),
      name: 'Bar',
      description: 'original description',
      notes: 'original notes',
      releaseAllocations: [{ releaseId: 'rel1', percentage: 100 }],
      progressHistory: [{ sprintId: 's1', releaseId: 'rel1', percentComplete: 50 }],
    };
    const product = makeProductWithRibs([original]);
    const result = splitRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const newRib = findRibByName(result, 'Bar (2)');
    expect(newRib.size).toBe(null);
    expect(newRib.releaseAllocations).toEqual([]);
    expect(newRib.progressHistory).toEqual([]);
    expect(newRib.category).toBe('non-core');
    expect(newRib.description).toBe('');
    expect(newRib.notes).toBe('');
  });

  it('new rib is inserted into backbone.ribItems immediately after original', () => {
    const product = makeProductWithRibs([
      makeRibNamed('r1', 'A'),
      makeRibNamed('r2', 'B'),
      makeRibNamed('r3', 'C'),
    ]);
    const result = splitRibInProduct(product, 't1', 'b1', 'r2', 'new-uuid');
    const ribs = result.themes[0].backboneItems[0].ribItems;
    expect(ribs.map(r => r.name)).toEqual(['A', 'B (1)', 'B (2)', 'C']);
  });

  it("sizingCardOrder['unsized'] places new rib ID immediately after original", () => {
    const product = {
      ...makeProductWithRibs([
        makeRibNamed('r1', 'A'),
        makeRibNamed('r2', 'B'),
        makeRibNamed('r3', 'C'),
      ]),
      sizingCardOrder: { unsized: ['r1', 'r2', 'r3'] },
    };
    const result = splitRibInProduct(product, 't1', 'b1', 'r2', 'new-uuid');
    expect(result.sizingCardOrder.unsized).toEqual(['r1', 'r2', 'new-uuid', 'r3']);
  });

  it('sizingCardOrder bootstrap when unsized array was empty', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'Solo')]);
    const result = splitRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    expect(result.sizingCardOrder.unsized).toEqual(['r1', 'new-uuid']);
  });

  it("changelog entry uses op: 'split' with source pointing at original", () => {
    const product = {
      ...makeProductWithRibs([makeRibNamed('r1', 'Foo')]),
      _changeLog: [],
    };
    const result = splitRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const last = result._changeLog[result._changeLog.length - 1];
    expect(last.op).toBe('split');
    expect(last.entity).toBe('rib');
    expect(last.id).toBe('new-uuid');
    expect(last.source).toBe('r1');
  });

  it('returns prev unchanged when rib not found', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'A')]);
    const result = splitRibInProduct(product, 't1', 'b1', 'nonexistent', 'new-uuid');
    expect(result).toBe(product);
  });

  it('avoids collision when splitting earlier-numbered sibling — uses max(existing N) + 1', () => {
    // After two splits the user has "(1)" and "(2)". Splitting "(1)" must produce "(3)",
    // not another "(2)" that collides with the existing sibling.
    const product = makeProductWithRibs([
      makeRibNamed('r1', 'Foo (1)'),
      makeRibNamed('r2', 'Foo (2)'),
    ]);
    const result = splitRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const ribs = result.themes[0].backboneItems[0].ribItems;
    const names = ribs.map(r => r.name);
    expect(names).toContain('Foo (1)');
    expect(names).toContain('Foo (2)');
    expect(names).toContain('Foo (3)');
    // No duplicates
    expect(new Set(names).size).toBe(names.length);
  });

  it('avoids collision when splitting unsuffixed original alongside numbered siblings', () => {
    // Edge case: original is "Foo" but "Foo (5)" already exists.
    // New names must continue the existing series, not collide.
    const product = makeProductWithRibs([
      makeRibNamed('r1', 'Foo'),
      makeRibNamed('r2', 'Foo (5)'),
    ]);
    const result = splitRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const ribs = result.themes[0].backboneItems[0].ribItems;
    const names = ribs.map(r => r.name);
    expect(names).toContain('Foo (5)');
    expect(names).toContain('Foo (6)');
    expect(names).toContain('Foo (7)');
    expect(new Set(names).size).toBe(names.length);
  });
});

// --- cloneRibInProduct ---
describe('cloneRibInProduct', () => {
  function makeRibNamed(id: string, name: string, opts: { size?: Size; category?: Category } = {}): RibItem {
    return { ...makeRib(id, opts), name };
  }

  function makeProductWithRibs(ribs: RibItem[]): Product {
    return makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', ribs)])],
    });
  }

  it('clone of unsuffixed rib appends " (1)" to name', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'Foo')]);
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const ribs = result.themes[0].backboneItems[0].ribItems;
    expect(ribs).toHaveLength(2);
    expect(ribs[0].name).toBe('Foo');
    expect(ribs[1].name).toBe('Foo (1)');
    expect(ribs[1].id).toBe('new-uuid');
  });

  it('cloning the same unsuffixed original twice produces (1) and (2) — no collision', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'Foo')]);
    const r1 = cloneRibInProduct(product, 't1', 'b1', 'r1', 'uuid-a');
    const r2 = cloneRibInProduct(r1, 't1', 'b1', 'r1', 'uuid-b');
    const names = r2.themes[0].backboneItems[0].ribItems.map(r => r.name);
    expect(names).toContain('Foo');
    expect(names).toContain('Foo (1)');
    expect(names).toContain('Foo (2)');
    expect(new Set(names).size).toBe(names.length);
  });

  it('clone of already-suffixed rib honors existing siblings (max + 1)', () => {
    const product = makeProductWithRibs([
      makeRibNamed('r1', 'Foo (3)'),
      makeRibNamed('r2', 'Foo (5)'),
    ]);
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const names = result.themes[0].backboneItems[0].ribItems.map(r => r.name);
    expect(names).toContain('Foo (3)');
    expect(names).toContain('Foo (5)');
    expect(names).toContain('Foo (6)');
    expect(new Set(names).size).toBe(names.length);
  });

  it('clone of suffixed rib with no other siblings uses max(itself) + 1', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'Foo (3)')]);
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const names = result.themes[0].backboneItems[0].ribItems.map(r => r.name);
    expect(names).toEqual(['Foo (3)', 'Foo (4)']);
  });

  it('copies size, category, description, and notes verbatim', () => {
    const original = {
      ...makeRib('r1', { size: 'L', category: 'non-core' }),
      name: 'Bar',
      description: 'orig desc',
      notes: 'orig notes',
    };
    const product = makeProductWithRibs([original]);
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const clone = result.themes[0].backboneItems[0].ribItems[1];
    expect(clone.size).toBe('L');
    expect(clone.category).toBe('non-core');
    expect(clone.description).toBe('orig desc');
    expect(clone.notes).toBe('orig notes');
  });

  it('clone progressHistory is empty even when original has entries', () => {
    const original = {
      ...makeRib('r1'),
      name: 'Bar',
      progressHistory: [{ sprintId: 's1', releaseId: 'rel1', percentComplete: 50 }],
    };
    const product = makeProductWithRibs([original]);
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const clone = result.themes[0].backboneItems[0].ribItems[1];
    expect(clone.progressHistory).toEqual([]);
  });

  it('releaseAllocations is a deep copy — mutating the clone does not affect the original', () => {
    const original = {
      ...makeRib('r1'),
      name: 'Bar',
      releaseAllocations: [{ releaseId: 'rel1', percentage: 60 }, { releaseId: 'rel2', percentage: 40 }],
    };
    const product = makeProductWithRibs([original]);
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const ribs = result.themes[0].backboneItems[0].ribItems;
    const clone = ribs[1];
    expect(clone.releaseAllocations).toEqual([{ releaseId: 'rel1', percentage: 60 }, { releaseId: 'rel2', percentage: 40 }]);
    // Mutate the clone's allocations
    clone.releaseAllocations[0].percentage = 99;
    // Original (in-place ref to ribs[0]) should be untouched
    expect(ribs[0].releaseAllocations[0].percentage).toBe(60);
  });

  it('releaseCardOrder for each release in original.releaseAllocations gets newId spliced after ribId', () => {
    const original = {
      ...makeRib('r1'),
      name: 'A',
      releaseAllocations: [{ releaseId: 'rel1', percentage: 100 }, { releaseId: 'rel2', percentage: 100 }],
    };
    const product = {
      ...makeProductWithRibs([original, makeRibNamed('r2', 'B')]),
      releaseCardOrder: {
        rel1: ['r1', 'r2'],
        rel2: ['r2', 'r1'],
      },
    };
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    expect(result.releaseCardOrder.rel1).toEqual(['r1', 'new-uuid', 'r2']);
    expect(result.releaseCardOrder.rel2).toEqual(['r2', 'r1', 'new-uuid']);
  });

  it('releaseCardOrder falls back to append when original is missing from the bucket', () => {
    const original = {
      ...makeRib('r1'),
      name: 'A',
      releaseAllocations: [{ releaseId: 'rel1', percentage: 100 }],
    };
    const product = {
      ...makeProductWithRibs([original]),
      releaseCardOrder: { rel1: ['r2', 'r3'] },
    };
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    expect(result.releaseCardOrder.rel1).toEqual(['r2', 'r3', 'new-uuid']);
  });

  it('unassigned clone (no releaseAllocations) leaves releaseCardOrder untouched', () => {
    const product = {
      ...makeProductWithRibs([makeRibNamed('r1', 'A')]),
      releaseCardOrder: { rel1: ['r99'] },
    };
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    expect(result.releaseCardOrder).toEqual({ rel1: ['r99'] });
  });

  it("sizingCardOrder places newId after ribId in the original's size bucket", () => {
    const product = {
      ...makeProductWithRibs([
        makeRibNamed('r1', 'A', { size: 'M' }),
        makeRibNamed('r2', 'B', { size: 'M' }),
      ]),
      sizingCardOrder: { M: ['r1', 'r2'] },
    };
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    expect(result.sizingCardOrder.M).toEqual(['r1', 'new-uuid', 'r2']);
  });

  it("sizingCardOrder uses 'unsized' bucket when original size is null", () => {
    const product = {
      ...makeProductWithRibs([makeRibNamed('r1', 'A')]),
      sizingCardOrder: { unsized: ['r1'] },
    };
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    expect(result.sizingCardOrder.unsized).toEqual(['r1', 'new-uuid']);
  });

  it('returns prev unchanged when rib not found', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'A')]);
    const result = cloneRibInProduct(product, 't1', 'b1', 'nonexistent', 'new-uuid');
    expect(result).toBe(product);
  });

  it("changelog entry uses op: 'duplicate' with source pointing at original", () => {
    const product = {
      ...makeProductWithRibs([makeRibNamed('r1', 'Foo')]),
      _changeLog: [],
    };
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const last = result._changeLog[result._changeLog.length - 1];
    expect(last.op).toBe('duplicate');
    expect(last.entity).toBe('rib');
    expect(last.id).toBe('new-uuid');
    expect(last.source).toBe('r1');
  });

  it('new rib is inserted into backbone.ribItems immediately after original', () => {
    const product = makeProductWithRibs([
      makeRibNamed('r1', 'A'),
      makeRibNamed('r2', 'B'),
      makeRibNamed('r3', 'C'),
    ]);
    const result = cloneRibInProduct(product, 't1', 'b1', 'r2', 'new-uuid');
    const ribs = result.themes[0].backboneItems[0].ribItems;
    expect(ribs.map(r => r.id)).toEqual(['r1', 'r2', 'new-uuid', 'r3']);
  });

  it('clone inherits cardColor when original has one set', () => {
    const original = { ...makeRibNamed('r1', 'A'), cardColor: 'rose' };
    const product = makeProductWithRibs([original]);
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const clone = result.themes[0].backboneItems[0].ribItems[1];
    expect(clone.cardColor).toBe('rose');
  });

  it('clone omits cardColor when original has none', () => {
    const product = makeProductWithRibs([makeRibNamed('r1', 'A')]);
    const result = cloneRibInProduct(product, 't1', 'b1', 'r1', 'new-uuid');
    const clone = result.themes[0].backboneItems[0].ribItems[1];
    expect(clone.cardColor).toBeUndefined();
  });
});

// --- addNamedRib ---
describe('addNamedRibToProduct', () => {
  function emptyProduct() {
    return {
      ...makeProduct({ themes: [makeTheme('t1', [makeBackbone('b1', [])])] }),
      _changeLog: [],
    };
  }

  it('applies name in a single update (no flash of "New Rib Item")', () => {
    const product = emptyProduct();
    const result = addNamedRibToProduct(product, 't1', 'b1', 'new-uuid', { name: 'My Rib' });
    const ribs = result.themes[0].backboneItems[0].ribItems;
    expect(ribs).toHaveLength(1);
    expect(ribs[0].name).toBe('My Rib');
    expect(ribs[0].id).toBe('new-uuid');
  });

  it('applies optional category, size, description, notes', () => {
    const product = emptyProduct();
    const result = addNamedRibToProduct(product, 't1', 'b1', 'new-uuid', {
      name: 'Rich Rib',
      category: 'non-core',
      size: 'L',
      description: 'desc',
      notes: 'notes',
    });
    const rib = result.themes[0].backboneItems[0].ribItems[0];
    expect(rib.category).toBe('non-core');
    expect(rib.size).toBe('L');
    expect(rib.description).toBe('desc');
    expect(rib.notes).toBe('notes');
  });

  it('defaults match plain addRib when attrs omitted', () => {
    const product = emptyProduct();
    const result = addNamedRibToProduct(product, 't1', 'b1', 'new-uuid', { name: 'Default' });
    const rib = result.themes[0].backboneItems[0].ribItems[0];
    expect(rib.category).toBe('core');
    expect(rib.size).toBe(null);
    expect(rib.description).toBe('');
    expect(rib.notes).toBe('');
    expect(rib.releaseAllocations).toEqual([]);
    expect(rib.progressHistory).toEqual([]);
    expect(rib.order).toBe(1);
  });

  it('applies optional cardColor when provided', () => {
    const product = emptyProduct();
    const result = addNamedRibToProduct(product, 't1', 'b1', 'new-uuid', { name: 'Colored', cardColor: 'rose' });
    expect(result.themes[0].backboneItems[0].ribItems[0].cardColor).toBe('rose');
  });

  it('omits the cardColor key when not provided', () => {
    const product = emptyProduct();
    const result = addNamedRibToProduct(product, 't1', 'b1', 'new-uuid', { name: 'Plain' });
    expect(result.themes[0].backboneItems[0].ribItems[0]).not.toHaveProperty('cardColor');
  });

  it("changelog entry has op: 'add', entity: 'rib'", () => {
    const product = emptyProduct();
    const result = addNamedRibToProduct(product, 't1', 'b1', 'new-uuid', { name: 'X' });
    const last = result._changeLog[result._changeLog.length - 1];
    expect(last.op).toBe('add');
    expect(last.entity).toBe('rib');
    expect(last.id).toBe('new-uuid');
  });

  it('returned ID matches the rib in the product', () => {
    const product = emptyProduct();
    const result = addNamedRibToProduct(product, 't1', 'b1', 'specific-id', { name: 'X' });
    expect(result.themes[0].backboneItems[0].ribItems[0].id).toBe('specific-id');
  });

  it('returns prev unchanged when theme not found', () => {
    const product = emptyProduct();
    const result = addNamedRibToProduct(product, 'wrong-theme', 'b1', 'new-uuid', { name: 'X' });
    expect(result).toBe(product);
  });

  it('returns prev unchanged when backbone not found', () => {
    const product = emptyProduct();
    const result = addNamedRibToProduct(product, 't1', 'wrong-bb', 'new-uuid', { name: 'X' });
    expect(result).toBe(product);
  });
});

// ── Phase 2 builders (module scope; function declarations hoist) ────────────
// Full Product builder for Phase 2 tests.
// Named makeFreshProduct to avoid collision with the file's existing makeProduct({ themes = [] } = {}).
function makeFreshProduct(): Product {
  return {
    id: 'p1', name: 'Test', description: '',
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z',
    schemaVersion: 2, sizeMapping: [], releases: [], sprints: [],
    themes: [], _changeLog: [],
  };
}

// One release (rel-1) + one unlocked, unallocated rib (rib-1).
// Base for all allocate/unassign tests.
function makeAllocProduct(): Product {
  let p = makeFreshProduct();
  p = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1' });
  p = addNamedThemeToProduct(p, 't1', { name: 'T' });
  p = addNamedBackboneToProduct(p, 't1', 'b1', { name: 'B' });
  p = addNamedRibToProduct(p, 't1', 'b1', 'rib-1', { name: 'Rib' });
  return p;
}

// rib-1 already 100%-allocated to rel-1.
function makeUnassignProduct(): Product {
  return allocateRibInProduct(makeAllocProduct(), 'rib-1', 'rel-1');
}

describe('addNamedReleaseToProduct', () => {
  it('adds a release with correct id, name, order, and empty description', () => {
    const next = addNamedReleaseToProduct(makeFreshProduct(), 'rel-1', { name: 'R1' });
    expect(next.releases).toHaveLength(1);
    expect(next.releases[0]).toMatchObject({ id: 'rel-1', name: 'R1', order: 1, description: '' });
    expect(next.releases[0]).not.toHaveProperty('targetDate');
  });

  it('increments order correctly when releases already exist', () => {
    const p = addNamedReleaseToProduct(makeFreshProduct(), 'rel-1', { name: 'R1' });
    const next = addNamedReleaseToProduct(p, 'rel-2', { name: 'R2' });
    expect(next.releases).toHaveLength(2);
    expect(next.releases[1]?.order).toBe(2);
  });

  it('is idempotent: duplicate id returns prev ref-equal with no second log entry', () => {
    const p = addNamedReleaseToProduct(makeFreshProduct(), 'rel-1', { name: 'R1' });
    const logLen = (p._changeLog ?? []).length;
    const again = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1 again' });
    expect(again).toBe(p);
    expect((again._changeLog ?? []).length).toBe(logLen);
  });

  it('appends exactly one changelog entry: op:add, entity:release, no source', () => {
    const p = makeFreshProduct();
    const next = addNamedReleaseToProduct(p, 'rel-1', { name: 'R1' });
    const log = next._changeLog ?? [];
    expect(log).toHaveLength((p._changeLog ?? []).length + 1);
    const entry = log[log.length - 1]!;
    expect(entry.op).toBe('add');
    expect(entry.entity).toBe('release');
    expect(entry.id).toBe('rel-1');
    expect(entry).not.toHaveProperty('source');
  });
});

describe('allocateRibInProduct', () => {
  it('allocates an unallocated, unlocked rib 100% to the release', () => {
    const next = allocateRibInProduct(makeAllocProduct(), 'rib-1', 'rel-1');
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations)
      .toEqual([{ releaseId: 'rel-1', percentage: 100 }]);
  });

  it('appends one changelog entry: op:update, entity:rib, source:ai', () => {
    const next = allocateRibInProduct(makeAllocProduct(), 'rib-1', 'rel-1');
    const log = next._changeLog ?? [];
    expect(log[log.length - 1]).toMatchObject({ op: 'update', entity: 'rib', id: 'rib-1', source: 'ai' });
  });

  it('is idempotent: second call returns first ref-equal (additive skip)', () => {
    const once = allocateRibInProduct(makeAllocProduct(), 'rib-1', 'rel-1');
    expect(allocateRibInProduct(once, 'rib-1', 'rel-1')).toBe(once);
  });

  it('[CRITICAL] skips when the release does not exist — no orphan allocation', () => {
    const p = makeAllocProduct();
    const next = allocateRibInProduct(p, 'rib-1', 'ghost-id');
    expect(next).toBe(p);
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toHaveLength(0);
  });

  it('skips a locked rib — returns prev ref-equal', () => {
    const p = makeAllocProduct();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory = [
      { sprintId: 's1', releaseId: 'rel-1', percentComplete: 50, comment: '' },
    ];
    expect(allocateRibInProduct(p, 'rib-1', 'rel-1')).toBe(p);
  });

  it('skips an already-allocated rib (additive guard) — returns prev ref-equal', () => {
    let p = makeAllocProduct();
    p = addNamedReleaseToProduct(p, 'rel-2', { name: 'R2' });
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations = [
      { releaseId: 'rel-2', percentage: 100 },
    ];
    const next = allocateRibInProduct(p, 'rib-1', 'rel-1');
    expect(next).toBe(p);
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations)
      .toEqual([{ releaseId: 'rel-2', percentage: 100 }]);
  });

  it('additive guard also protects a split allocation (60/40)', () => {
    let p = makeAllocProduct();
    p = addNamedReleaseToProduct(p, 'rel-2', { name: 'R2' });
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations = [
      { releaseId: 'rel-1', percentage: 60 },
      { releaseId: 'rel-2', percentage: 40 },
    ];
    expect(allocateRibInProduct(p, 'rib-1', 'rel-1')).toBe(p);
  });

  it('returns prev ref-equal when ribId is not found', () => {
    const p = makeAllocProduct();
    expect(allocateRibInProduct(p, 'ghost-rib', 'rel-1')).toBe(p);
  });

  it('does not touch releaseCardOrder', () => {
    let p = makeAllocProduct();
    p = { ...p, releaseCardOrder: { 'rel-1': ['other-rib'] } };
    const next = allocateRibInProduct(p, 'rib-1', 'rel-1');
    expect(next.releaseCardOrder).toEqual({ 'rel-1': ['other-rib'] });
  });

  it('handles undefined releaseAllocations on a hand-edited rib without throwing', () => {
    const p = makeAllocProduct();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations =
      undefined as unknown as ReleaseAllocation[];
    expect(() => allocateRibInProduct(p, 'rib-1', 'rel-1')).not.toThrow();
  });
});

describe('unassignRibInProduct', () => {
  it('clears releaseAllocations on an allocated, unlocked rib', () => {
    const next = unassignRibInProduct(makeUnassignProduct(), 'rib-1');
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations).toEqual([]);
  });

  it('appends one changelog entry: op:update, entity:rib, source:ai', () => {
    const next = unassignRibInProduct(makeUnassignProduct(), 'rib-1');
    const log = next._changeLog ?? [];
    expect(log[log.length - 1]).toMatchObject({ op: 'update', entity: 'rib', id: 'rib-1', source: 'ai' });
  });

  it('cleans releaseCardOrder — removes ribId from all column buckets', () => {
    let p = makeUnassignProduct();
    p = { ...p, releaseCardOrder: { 'rel-1': ['rib-1', 'other'], 'rel-2': ['rib-1'] } };
    const next = unassignRibInProduct(p, 'rib-1');
    expect(next.releaseCardOrder!['rel-1']).toEqual(['other']);
    expect(next.releaseCardOrder!['rel-2']).toEqual([]);
  });

  it('is idempotent: second call returns first ref-equal', () => {
    const once = unassignRibInProduct(makeUnassignProduct(), 'rib-1');
    expect(unassignRibInProduct(once, 'rib-1')).toBe(once);
  });

  it('skips a locked rib — returns prev ref-equal', () => {
    const p = makeUnassignProduct();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory = [
      { sprintId: 's1', releaseId: 'rel-1', percentComplete: 50, comment: '' },
    ];
    expect(unassignRibInProduct(p, 'rib-1')).toBe(p);
  });

  it('clears all allocations on a split-allocated rib', () => {
    let p = makeAllocProduct();
    p = addNamedReleaseToProduct(p, 'rel-2', { name: 'R2' });
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.releaseAllocations = [
      { releaseId: 'rel-1', percentage: 60 },
      { releaseId: 'rel-2', percentage: 40 },
    ];
    expect(unassignRibInProduct(p, 'rib-1').themes[0]!.backboneItems[0]!.ribItems[0]!
      .releaseAllocations).toEqual([]);
  });

  it('returns prev ref-equal when ribId is not found', () => {
    const p = makeUnassignProduct();
    expect(unassignRibInProduct(p, 'ghost-rib')).toBe(p);
  });

  it('handles undefined releaseCardOrder without throwing', () => {
    const p = { ...makeUnassignProduct(), releaseCardOrder: undefined };
    expect(() => unassignRibInProduct(p, 'rib-1')).not.toThrow();
  });

  it('does not touch progressHistory on an unlocked rib', () => {
    const p = makeUnassignProduct();
    const history = [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 0, comment: 'note' }];
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory = history;
    const next = unassignRibInProduct(p, 'rib-1');
    expect(next.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory).toEqual(history);
  });
});
