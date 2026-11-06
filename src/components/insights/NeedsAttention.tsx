// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo, useState } from 'react';
import { getAllRibItems, getAllocationTotal } from '../../lib/calculations';
import { UNDO_HINT } from '../../lib/constants';
import { bringRecordsHere, previewBringHere, removeRowRecords } from '../../lib/progressMutations';
import { getStrandedRows } from '../../lib/reconciliation';
import type { StrandedRow } from '../../lib/reconciliation';
import ConfirmDialog from '../ui/ConfirmDialog';
import type { OutletContextValue, Product } from '../../types';

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

const strandedLine = (row: StrandedRow) => {
  const where = `${row.ribName} (${row.backboneName}): ${row.releaseName}, ${row.sprintNames.join(', ')}.`;
  return row.duplicate ? `${where} A duplicate of an entry that counts.` : `${where} Would count ${row.wouldCount}%.`;
};

/**
 * What Bring here will do, in figures read off the writer. It has no other warning:
 * the reported case reads 11 here, by request, and the user sees that first.
 */
function bringHereMessage(product: Product, row: StrandedRow): string {
  const preview = previewBringHere(product, row.ribId, row.releaseId);
  const reads = preview ? ` The rib will read ${preview.reads}%.` : '';
  const counted = preview && preview.counted < preview.reads ? ` ${row.bringHereTo} counts ${preview.counted}%.` : '';
  return `${row.releaseName}'s progress moves to ${row.bringHereTo}.${reads}${counted} Past sprints are recalculated, so a Forecaster re-send can change. ${UNDO_HINT}`;
}

function removeMessage(row: StrandedRow): string {
  const sprints = row.sprintNames.join(', ');
  return row.duplicate
    ? `Remove the duplicate on "${row.ribName}" (${row.releaseName}, ${sprints})? The entry that counts stays, and so do notes. ${UNDO_HINT}`
    : `Remove the progress on "${row.ribName}" recorded for ${row.releaseName} (${sprints})? Notes stay. ${UNDO_HINT}`;
}

type PendingAction = { kind: 'bring' | 'remove'; row: StrandedRow };

const ACTION_CLASS = 'ml-2 font-medium text-blue-600 dark:text-blue-400 hover:underline';

/**
 * ⚠️ Every stranded row renders. `AttentionSection` stops at ten, which is fine for
 * a nudge, but this list is the only place progress that is not counting can be
 * seen, and each row carries the only way to act on it.
 */
function StrandedSection({ rows, product, updateProduct }: {
  rows: StrandedRow[];
  product: Product;
  updateProduct: OutletContextValue['updateProduct'];
}) {
  const [pending, setPending] = useState<PendingAction | null>(null);
  const bringing = pending?.kind === 'bring';

  const confirm = () => {
    if (!pending) return;
    const { ribId, releaseId } = pending.row;
    updateProduct(prev => (bringing ? bringRecordsHere(prev, ribId, releaseId) : removeRowRecords(prev, ribId, releaseId)));
  };

  return (
    <div>
      <h4 className="text-sm font-medium text-purple-600 dark:text-purple-400 mb-1">Progress not counting: {rows.length}</h4>
      <p className="text-xs text-gray-500 dark:text-gray-400 mb-1">Recorded, but in no total: on a release the rib has left, or a duplicate of an entry that counts.</p>
      <ul className="text-xs text-gray-500 dark:text-gray-400 space-y-0.5 ml-4 list-disc">
        {rows.map(row => (
          <li key={`${row.ribId}-${row.releaseId}`}>
            {strandedLine(row)}
            {row.bringHereTo && (
              <button type="button" className={ACTION_CLASS} aria-label={`Bring here: ${row.ribName}, ${row.releaseName}`} onClick={() => setPending({ kind: 'bring', row })}>
                Bring here
              </button>
            )}
            <button type="button" className={ACTION_CLASS} aria-label={`Remove: ${row.ribName}, ${row.releaseName}`} onClick={() => setPending({ kind: 'remove', row })}>
              Remove
            </button>
          </li>
        ))}
      </ul>
      <ConfirmDialog
        open={!!pending}
        onClose={() => setPending(null)}
        onConfirm={confirm}
        title={bringing ? 'Bring here' : 'Remove progress'}
        message={pending ? (bringing ? bringHereMessage(product, pending.row) : removeMessage(pending.row)) : ''}
        confirmLabel={bringing ? 'Bring here' : 'Remove'}
        danger={!bringing}
      />
    </div>
  );
}

export default function NeedsAttention({ product, updateProduct }: {
  product: Product;
  updateProduct: OutletContextValue['updateProduct'];
}) {
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
        {stranded.length > 0 && <StrandedSection rows={stranded} product={product} updateProduct={updateProduct} />}
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
