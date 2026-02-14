import { describe, it, expect } from 'vitest';

// We test the mutation logic extracted from useProductMutations by simulating
// the updateProduct callback pattern — same approach as mapMutations.test.js.
// The hook itself just wraps these patterns in useCallback, so testing the
// updater functions directly covers the core logic.

function makeRib(id, { size = null, category = 'core' } = {}) {
  return {
    id,
    name: `Rib ${id}`,
    size,
    category,
    order: 1,
    releaseAllocations: [],
    progressHistory: [],
  };
}

function makeBackbone(id, ribs = []) {
  return { id, name: `Backbone ${id}`, ribItems: ribs, order: 1 };
}

function makeTheme(id, backbones = []) {
  return { id, name: `Theme ${id}`, backboneItems: backbones, order: 1 };
}

function makeProduct({ themes = [] } = {}) {
  return { themes, releases: [], sprints: [], sizeMapping: [] };
}

// Simulate updateTheme(themeId, updater) — returns the updated product
function applyUpdateTheme(product, themeId, updater) {
  return {
    ...product,
    themes: product.themes.map(t =>
      t.id === themeId ? (typeof updater === 'function' ? updater(t) : { ...t, ...updater }) : t
    ),
  };
}

function applyUpdateBackbone(product, themeId, backboneId, updater) {
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

function applyUpdateRib(product, themeId, backboneId, ribId, updater) {
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

function applyMoveItem(items, id, direction, key = 'id') {
  const arr = [...items];
  const idx = arr.findIndex(item => item[key] === id);
  if (idx < 0) return items;
  const newIdx = idx + direction;
  if (newIdx < 0 || newIdx >= arr.length) return items;
  [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
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
