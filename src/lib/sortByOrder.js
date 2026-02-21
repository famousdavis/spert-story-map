/**
 * Sort items by a persisted order array.
 * Items in the order array appear first (in order); items not in the array appear after, preserving their original relative order.
 *
 * @param {Array} items - Array of objects with `id` property
 * @param {Array<string>} order - Array of IDs in desired order
 * @returns {Array} Sorted copy of items
 */
export function sortByOrder(items, order) {
  if (!order || order.length === 0) return items;
  const orderMap = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = orderMap.has(a.id) ? orderMap.get(a.id) : Infinity;
    const bi = orderMap.has(b.id) ? orderMap.get(b.id) : Infinity;
    if (ai === bi) return 0; // both unordered — preserve original order
    return ai - bi;
  });
}
