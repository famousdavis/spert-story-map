// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product } from '../types';
import { getProjectTotals, getUnknownReleaseTotals } from './calculations';
import { allocationTo, bringHereTarget, strandedSeries } from './progressRule';
import { forEachRib } from './ribHelpers';

export const UNKNOWN_RELEASE_LABEL = 'Unknown release';

export type ReconciliationKind = 'unknown-release' | 'unallocated' | 'over-allocated' | 'total';

/** One line that makes the release figures add up to the project. Values are unrounded and signed. */
export interface ReconciliationRow {
  kind: ReconciliationKind;
  label: string;
  points: number;
  core: number;
  nonCore: number;
  completed: number;
  /** Null where a percentage means nothing. */
  percentComplete: number | null;
  remaining: number;
}

/**
 * The lines under a list of releases, in display order: what they leave out, what
 * they count twice, and the project total. The ONE builder behind the Insights
 * table, the Progress footer and Excel's Release Summary, so the three cannot
 * reconcile differently. Over-allocated's remaining is `−(O − V)`, not `−O`: its
 * completed points are already out of the release figures' over-count.
 */
export function getReconciliationRows(product: Product, sprintId?: string | null): ReconciliationRow[] {
  const t = getProjectTotals(product, sprintId);
  const rows: ReconciliationRow[] = [];

  const unknown = getUnknownReleaseTotals(product, sprintId);
  if (unknown) {
    rows.push({
      kind: 'unknown-release', label: UNKNOWN_RELEASE_LABEL,
      points: unknown.allocated, core: unknown.core, nonCore: unknown.nonCore, completed: unknown.completed,
      percentComplete: unknown.allocated > 0 ? (unknown.completed / unknown.allocated) * 100 : 0,
      remaining: unknown.allocated - unknown.completed,
    });
  }
  if (t.unallocated.total > 0) {
    rows.push({
      kind: 'unallocated', label: 'Unallocated',
      points: t.unallocated.total, core: t.unallocated.core, nonCore: t.unallocated.nonCore, completed: 0,
      percentComplete: null,
      remaining: t.unallocated.total,
    });
  }
  if (t.overAllocated.total > 0) {
    rows.push({
      kind: 'over-allocated', label: 'Over-allocated',
      points: -t.overAllocated.total, core: -t.overAllocated.core, nonCore: -t.overAllocated.nonCore, completed: -t.overCount,
      percentComplete: null,
      remaining: -(t.overAllocated.total - t.overCount),
    });
  }
  rows.push({
    kind: 'total', label: 'Total',
    points: t.total, core: t.core.total, nonCore: t.nonCore.total, completed: t.completed,
    percentComplete: t.total > 0 ? (t.completed / t.total) * 100 : 0,
    remaining: t.total - t.completed,
  });
  return rows;
}

/** One rib and one release holding progress that does not count. */
export interface StrandedRow {
  ribId: string;
  ribName: string;
  backboneName: string;
  releaseId: string;
  releaseName: string;
  sprintNames: string[];
  /** What the rib would read if it were on the release. A series that ends lower reads lower than its records. */
  wouldCount: number;
  /**
   * The rib IS on this release: the row is an entry behind one that counts. Then
   * `wouldCount` describes the entry that counts, so the row must not show it.
   */
  duplicate: boolean;
  /** The release "Bring here" would put these records on, or null when it is not offered. */
  bringHereTo: string | null;
}

/** What Insights' Needs Attention lists. Reads only: the actions live in `progressMutations`. */
export function getStrandedRows(product: Product): StrandedRow[] {
  const releases = new Map(product.releases.map(r => [r.id, r.name]));
  const sprintNames = new Map((product.sprints ?? []).map(s => [s.id, s.name]));
  const releaseIds = new Set(releases.keys());
  const rows: StrandedRow[] = [];
  forEachRib(product, (rib, { backbone }) => {
    for (const found of strandedSeries(rib, releaseIds, product.sprints)) {
      const target = bringHereTarget(rib, found.releaseId, releaseIds);
      rows.push({
        ribId: rib.id,
        ribName: rib.name,
        backboneName: backbone.name,
        releaseId: found.releaseId,
        releaseName: releases.get(found.releaseId) ?? UNKNOWN_RELEASE_LABEL,
        sprintNames: found.sprintIds.map(id => sprintNames.get(id) ?? id),
        wouldCount: found.wouldCount,
        duplicate: allocationTo(rib, found.releaseId) !== null,
        bringHereTo: target && (releases.get(target.releaseId) ?? UNKNOWN_RELEASE_LABEL),
      });
    }
  });
  return rows;
}
