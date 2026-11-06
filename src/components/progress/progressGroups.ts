// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { getAllRibItems } from '../../lib/calculations';
import { currentAllocations } from '../../lib/progressRule';
import { UNKNOWN_RELEASE_LABEL } from '../../lib/reconciliation';
import type { Release } from '../../types';

export type GroupBy = 'release' | 'backbone' | 'theme';

/**
 * A rib as enriched by getAllRibItems (theme/backbone names + ids), plus the
 * per-row fields this view injects. `_releaseId` / `_allocPct` are null for the
 * backbone/theme groupings, which have no single allocation to edit.
 */
export type ProgressRibRow = ReturnType<typeof getAllRibItems>[number] & {
  _releaseId: string | null;
  _releaseName?: string;
  _allocPct: number | null;
  _editable: boolean;
};

/**
 * One collapsible group in the progress table.
 *
 * `key` is the Record key the group was filed under and is always present —
 * it drives collapse state and the React key. `releaseId` is set only by the
 * release grouping (the other two have no single release), and `entityId` only
 * by the backbone/theme groupings, so neither alone can type the group key.
 */
export interface ProgressGroup {
  key: string;
  label: string;
  releaseId?: string;
  entityId?: string;
  items: ProgressRibRow[];
}

function releaseGroups(ribs: ReturnType<typeof getAllRibItems>, releases: Release[]): ProgressGroup[] {
  const groups: Record<string, ProgressGroup> = {};
  for (const rib of ribs) {
    // Current allocations, not the raw rows: a duplicate row would draw the rib
    // twice under one React key, and count nothing the rule counts.
    for (const alloc of currentAllocations(rib)) {
      const release = releases.find(r => r.id === alloc.releaseId);
      const key = alloc.releaseId;
      const label = release?.name || UNKNOWN_RELEASE_LABEL;
      const group = groups[key] ?? (groups[key] = { key, label, releaseId: key, items: [] });
      group.items.push({
        ...rib,
        _releaseId: alloc.releaseId,
        _releaseName: release?.name || '',
        _allocPct: alloc.percentage,
        _editable: true,
      });
    }
  }
  const releaseOrder: Record<string, number> = {};
  releases.forEach(r => { releaseOrder[r.id] = r.order; });
  const result = Object.values(groups)
    .sort((a, b) => (releaseOrder[a.releaseId ?? ''] || 0) - (releaseOrder[b.releaseId ?? ''] || 0));
  for (const g of result) {
    g.items.sort((a, b) => a.backboneName.localeCompare(b.backboneName) || a.name.localeCompare(b.name));
  }
  return result;
}

/** The progress table's groups. Takes the ribs that have an allocation: the footer accounts for the rest. */
export function buildProgressGroups(ribs: ReturnType<typeof getAllRibItems>, groupBy: GroupBy, releases: Release[]): ProgressGroup[] {
  if (groupBy === 'release') return releaseGroups(ribs, releases);

  const groups: Record<string, ProgressGroup> = {};
  for (const rib of ribs) {
    const key = groupBy === 'backbone' ? rib.backboneId : rib.themeId;
    const label = groupBy === 'backbone' ? rib.backboneName : rib.themeName;
    const group = groups[key] ?? (groups[key] = { key, label, entityId: key, items: [] });
    group.items.push({ ...rib, _releaseId: null, _allocPct: null, _editable: false });
  }
  const result = Object.values(groups);
  for (const g of result) {
    g.items.sort((a, b) => a.name.localeCompare(b.name));
  }
  return result;
}
