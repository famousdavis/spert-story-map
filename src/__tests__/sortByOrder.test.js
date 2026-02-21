import { describe, it, expect } from 'vitest';
import { sortByOrder } from '../lib/sortByOrder';

describe('sortByOrder', () => {
  const items = [
    { id: 'a', name: 'Alpha' },
    { id: 'b', name: 'Bravo' },
    { id: 'c', name: 'Charlie' },
    { id: 'd', name: 'Delta' },
  ];

  it('returns items unchanged when order is null', () => {
    expect(sortByOrder(items, null)).toEqual(items);
  });

  it('returns items unchanged when order is empty', () => {
    expect(sortByOrder(items, [])).toEqual(items);
  });

  it('sorts items by order array', () => {
    const order = ['c', 'a', 'b', 'd'];
    const result = sortByOrder(items, order);
    expect(result.map(i => i.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('puts unordered items at the end', () => {
    const order = ['c', 'a'];
    const result = sortByOrder(items, order);
    expect(result.map(i => i.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('ignores order IDs that do not exist in items', () => {
    const order = ['z', 'c', 'a', 'x'];
    const result = sortByOrder(items, order);
    expect(result.map(i => i.id)).toEqual(['c', 'a', 'b', 'd']);
  });

  it('does not mutate the original array', () => {
    const order = ['d', 'c', 'b', 'a'];
    const original = [...items];
    sortByOrder(items, order);
    expect(items).toEqual(original);
  });

  it('handles single item', () => {
    const single = [{ id: 'a' }];
    expect(sortByOrder(single, ['a'])).toEqual([{ id: 'a' }]);
  });

  it('handles empty items', () => {
    expect(sortByOrder([], ['a', 'b'])).toEqual([]);
  });
});
