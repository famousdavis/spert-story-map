// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, ProgressEntry } from '../types';
import { hasValue } from './progressRule';

/**
 * Pure functions for release/sprint cascade deletion.
 * Each takes a product and returns a new product with the entity removed
 * and all references cleaned up.
 */

/** Remove a release and clean all references from allocations, progressHistory, and card order. */
export function deleteReleaseFromProduct(product: Product, releaseId: string): Product {
  const { [releaseId]: _, ...restCardOrder } = product.releaseCardOrder || {};
  return {
    ...product,
    releases: product.releases.filter(r => r.id !== releaseId).map((r, i) => ({ ...r, order: i + 1 })),
    themes: product.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => ({
          ...r,
          releaseAllocations: r.releaseAllocations.filter(a => a.releaseId !== releaseId),
          progressHistory: r.progressHistory.filter(p => p.releaseId !== releaseId),
        })),
      })),
    })),
    releaseCardOrder: restCardOrder,
  };
}

/** Remove a sprint and clean all progressHistory references. */
export function deleteSprintFromProduct(product: Product, sprintId: string): Product {
  return {
    ...product,
    sprints: product.sprints.filter(s => s.id !== sprintId).map((s, i) => ({ ...s, order: i + 1 })),
    themes: product.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => ({
          ...r,
          progressHistory: r.progressHistory.filter(p => p.sprintId !== sprintId),
        })),
      })),
    })),
  };
}

/** Every release delete says this when it will take records with it. */
export const RELEASE_RECORDS_LINE = 'Recorded progress and notes for this release are deleted too.';
export const SPRINT_RECORDS_LINE = 'Recorded progress and notes for this sprint are deleted too.';

/** A value or a comment. A typed 0 is a value. An empty null entry holds nothing. */
const holdsRecord = (entry: ProgressEntry) => hasValue(entry) || Boolean(entry.comment);

function anyEntry(product: Product, test: (entry: ProgressEntry) => boolean): boolean {
  return product.themes.some(t => t.backboneItems.some(b => b.ribItems.some(r => (r.progressHistory ?? []).some(test))));
}

/**
 * Would deleting this release take a record with it? Any entry with a value or a
 * comment, in any sprint, because `deleteReleaseFromProduct` drops all of them,
 * comments included. Not `strandedSeries`, which sees only positive records on known
 * sprints, and not the lock, which sees only current allocations.
 */
export function releaseHoldsRecords(product: Product, releaseId: string): boolean {
  return anyEntry(product, entry => entry.releaseId === releaseId && holdsRecord(entry));
}

/**
 * A release delete's confirm: `lead`, then the shared line when it applies. All three
 * surfaces build their message here, so the line and its condition cannot drift.
 */
export function releaseDeleteMessage(lead: string, product: Product, releaseId: string): string {
  return [lead, releaseHoldsRecords(product, releaseId) ? RELEASE_RECORDS_LINE : ''].filter(Boolean).join(' ');
}

/** Would deleting this sprint take a record with it? `deleteSprintFromProduct` drops comments too. */
export function sprintHoldsRecords(product: Product, sprintId: string): boolean {
  return anyEntry(product, entry => entry.sprintId === sprintId && holdsRecord(entry));
}

/** Check if any rib items have allocations referencing a release. */
export function releaseHasAllocations(product: Product, releaseId: string): boolean {
  for (const t of product.themes) {
    for (const b of t.backboneItems) {
      for (const r of b.ribItems) {
        if (r.releaseAllocations.some(a => a.releaseId === releaseId)) return true;
      }
    }
  }
  return false;
}
