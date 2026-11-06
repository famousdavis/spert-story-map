// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo } from 'react';
import { getAllRibItems, getAllocationTotal } from '../../lib/calculations';
import { getStrandedRows } from '../../lib/reconciliation';
import type { StrandedRow } from '../../lib/reconciliation';
import type { Product } from '../../types';

function AttentionSection({ title, color, items }: { title: string; color: string; items: string[] }) {
  return (
    <div>
      <h4 className={`text-sm font-medium ${color} mb-1`}>{title}</h4>
      <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 ml-4 list-disc">
        {items.slice(0, 10).map((item, i) => <li key={i}>{item}</li>)}
        {items.length > 10 && <li className="italic">...and {items.length - 10} more</li>}
      </ul>
    </div>
  );
}

const strandedLine = (row: StrandedRow) =>
  `${row.ribName} (${row.backboneName}): ${row.releaseName}, ${row.sprintNames.join(', ')}. Would count ${row.wouldCount}%.`;

/**
 * ⚠️ Every stranded row renders. `AttentionSection` stops at ten, which is fine for
 * a nudge, but this list is the only place progress that is not counting can be
 * seen, and the next release puts actions on each row.
 */
function StrandedSection({ rows }: { rows: StrandedRow[] }) {
  return (
    <div>
      <h4 className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-1">Progress not counting: {rows.length}</h4>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Recorded on a release the rib is no longer on, so it is in no total.</p>
      <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 ml-4 list-disc">
        {rows.map(row => <li key={`${row.ribId}-${row.releaseId}`}>{strandedLine(row)}</li>)}
      </ul>
    </div>
  );
}

export default function NeedsAttention({ product }: { product: Product }) {
  const allRibs = useMemo(() => getAllRibItems(product), [product]);
  const stranded = useMemo(() => getStrandedRows(product), [product]);

  const unsizedItems = allRibs.filter(r => !r.size);
  const unassignedItems = allRibs.filter(r => r.releaseAllocations.length === 0);
  const partialAllocItems = allRibs.filter(r => {
    const total = getAllocationTotal(r);
    return total > 0 && total !== 100;
  });

  if (unsizedItems.length === 0 && unassignedItems.length === 0 && partialAllocItems.length === 0 && stranded.length === 0) return null;

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-700 rounded-xl p-5">
      <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">Needs Attention</h3>
      <div className="space-y-4">
        {stranded.length > 0 && <StrandedSection rows={stranded} />}
        {unsizedItems.length > 0 && (
          <AttentionSection
            title={`${unsizedItems.length} unsized items`}
            color="text-amber-600 dark:text-amber-400"
            items={unsizedItems.map(r => `${r.name} (${r.backboneName})`)}
          />
        )}
        {unassignedItems.length > 0 && (
          <AttentionSection
            title={`${unassignedItems.length} unassigned items`}
            color="text-orange-600 dark:text-orange-400"
            items={unassignedItems.map(r => `${r.name} (${r.backboneName})`)}
          />
        )}
        {partialAllocItems.length > 0 && (
          <AttentionSection
            title={`${partialAllocItems.length} items with incomplete allocations`}
            color="text-red-600 dark:text-red-400"
            items={partialAllocItems.map(r => `${r.name} — ${getAllocationTotal(r)}%`)}
          />
        )}
      </div>
    </div>
  );
}
