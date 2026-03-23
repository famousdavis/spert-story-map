// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Sort items by a persisted order array.
 * Items in the order array appear first (in order); items not in the array appear after,
 * preserving their original relative order.
 */
export function sortByOrder<T extends { id: string }>(items: T[], order: string[] | undefined): T[] {
  if (!order || order.length === 0) return items;
  const orderMap = new Map(order.map((id, i) => [id, i]));
  return [...items].sort((a, b) => {
    const ai = orderMap.has(a.id) ? orderMap.get(a.id)! : Infinity;
    const bi = orderMap.has(b.id) ? orderMap.get(b.id)! : Infinity;
    if (ai === bi) return 0; // both unordered — preserve original order
    return ai - bi;
  });
}
