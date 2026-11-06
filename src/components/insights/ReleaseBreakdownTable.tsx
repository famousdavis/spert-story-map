// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useMemo } from 'react';
import { getCoreNonCorePointsForRelease, getReleasePoints, round1 } from '../../lib/calculations';
import { getReconciliationRows } from '../../lib/reconciliation';
import type { Product } from '../../types';

interface TableRow {
  key: string;
  label: string;
  points: number;
  core: number;
  nonCore: number;
  percentComplete: number | null;
  remaining: number;
  emphasis: boolean;
}

function releaseRows(product: Product): TableRow[] {
  return product.releases.map(release => {
    const { allocated, completed } = getReleasePoints(product, release.id);
    const { core, nonCore } = getCoreNonCorePointsForRelease(product, release.id);
    return {
      key: release.id,
      label: release.name,
      points: allocated,
      core,
      nonCore,
      percentComplete: allocated > 0 ? (completed / allocated) * 100 : 0,
      remaining: allocated - completed,
      emphasis: false,
    };
  });
}

/**
 * The releases, then the lines that add them up to the project. Every cell rounds
 * from its own unrounded value, so a visible sum can miss by 0.1.
 */
export default function ReleaseBreakdownTable({ product }: { product: Product }) {
  const rows = useMemo<TableRow[]>(() => [
    ...releaseRows(product),
    ...getReconciliationRows(product).map(row => ({
      key: row.kind,
      label: row.label,
      points: row.points,
      core: row.core,
      nonCore: row.nonCore,
      percentComplete: row.percentComplete,
      remaining: row.remaining,
      emphasis: row.kind === 'total',
    })),
  ], [product]);

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs text-gray-500 dark:text-gray-400 border-b border-gray-100 dark:border-gray-800">
            <th className="text-left py-2 font-medium">Release</th>
            <th className="text-right py-2 font-medium">Total Pts</th>
            <th className="text-right py-2 font-medium">Core</th>
            <th className="text-right py-2 font-medium">Non-core</th>
            <th className="text-right py-2 font-medium">% Complete</th>
            <th className="text-right py-2 font-medium">Remaining</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(row => (
            <tr key={row.key} className={`border-b border-gray-50 dark:border-gray-800 ${row.emphasis ? 'font-semibold' : ''}`}>
              <td className="py-2 font-medium text-gray-700 dark:text-gray-300">{row.label}</td>
              <td className="py-2 text-right tabular-nums">{round1(row.points)}</td>
              <td className="py-2 text-right text-blue-600 dark:text-blue-400 tabular-nums">{round1(row.core)}</td>
              <td className="py-2 text-right text-gray-400 dark:text-gray-500 tabular-nums">{round1(row.nonCore)}</td>
              <td className="py-2 text-right tabular-nums">{row.percentComplete === null ? '' : `${round1(row.percentComplete)}%`}</td>
              <td className="py-2 text-right tabular-nums">{round1(row.remaining)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
