// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { getRibItemPoints, round1 } from '../../lib/calculations';
import { currentAllocations } from '../../lib/progressRule';
import { getReconciliationRows } from '../../lib/reconciliation';
import type { Product, RibItem } from '../../types';

interface GroupsFooterProps {
  product: Product;
  selectedSprint: string | null;
  groupBy: 'release' | 'backbone' | 'theme';
  ribs: RibItem[];
}

function Line({ label, detail }: { label: string; detail: string }) {
  return (
    <div className="flex items-center gap-2 text-xs">
      <span className="font-semibold text-gray-700 dark:text-gray-300">{label}</span>
      <span className="text-gray-500 dark:text-gray-400 tabular-nums">{detail}</span>
    </div>
  );
}

/**
 * What the groups above leave out, so they add up to the header. No Total line:
 * the header is the total.
 *
 * Release grouping: an allocation to a release that no longer exists already has
 * its own group, labelled the same way, so a line for it here would count it twice.
 */
export default function GroupsFooter({ product, selectedSprint, groupBy, ribs }: GroupsFooterProps) {
  if (groupBy !== 'release') {
    const unassigned = ribs.filter(rib => currentAllocations(rib).length === 0);
    if (unassigned.length === 0) return null;
    const points = unassigned.reduce((sum, rib) => sum + getRibItemPoints(rib, product.sizeMapping), 0);
    return <Line label="Unassigned ribs" detail={`${unassigned.length} items · ${round1(points)} pts`} />;
  }

  const lines = getReconciliationRows(product, selectedSprint);
  const unallocated = lines.find(row => row.kind === 'unallocated');
  const over = lines.find(row => row.kind === 'over-allocated');
  if (!unallocated && !over) return null;
  return (
    <div className="space-y-1">
      {unallocated && <Line label={unallocated.label} detail={`${round1(unallocated.points)} pts`} />}
      {over && <Line label={over.label} detail={`${round1(over.points)} pts · ${round1(over.completed)} done`} />}
    </div>
  );
}
