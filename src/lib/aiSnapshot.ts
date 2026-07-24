// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product } from '../types';
import { isRibLocked } from './ribHelpers';

/**
 * The typed shape of the compact product snapshot written to Firestore
 * and returned verbatim by the MCP storymap_get_project tool.
 *
 * Phase 2 additions over the Phase 1 compact:
 *   - releases: sorted by order; id/name/order only (no targetDate, no description)
 *   - ribItems: include releaseIds[] and locked boolean
 *
 * Phase 3 additions:
 *   - sizeMapping: sorted by points ascending; label/points only
 *   - ribItems: include size (string | null); orphan/empty sizes normalized to null
 *     to match useSizingLayout.ts:118's definition of "unsized"
 *
 * Phase 7 additions:
 *   - ribItems: include partial boolean — true only for a single allocation at
 *     a percentage other than 100. Splits are excluded (already visible as
 *     releaseIds.length > 1). Lets the AI derive move_rib's release-leg
 *     eligibility pre-call: the leg skips if locked, releaseIds.length > 1,
 *     or partial.
 *
 * Phase 8 additions:
 *   - ribItems: include notes (string) — omitted when notesIncluded is false
 *   - top-level notesIncluded (boolean) — always present in v0.49.0+; positive
 *     marker so a snapshot's absence of notes is never load-bearing (D10)
 *   - selectSnapshotForWrite: bounded variant selection (full/lean/skip, D8)
 */
export interface AiSnapshot {
  id: string;
  name: string;
  description: string;
  /**
   * ← Phase 8 (D10). ALWAYS emitted by v0.49.0+. true -> every rib carries an
   * authoritative `notes` string. false -> notes omitted for size; no rib has a
   * `notes` field. ABSENT ENTIRELY -> written by a pre-0.49.0 bundle; make no
   * assumption about notes. Never infer "included" from absence.
   */
  notesIncluded: boolean;
  sizeMapping: Array<{ label: string; points: number }>;  // ← Phase 3
  releases: Array<{ id: string; name: string; order: number }>;
  themes: Array<{
    id: string;
    name: string;
    backboneItems: Array<{
      id: string;
      name: string;
      ribItems: Array<{
        id: string;
        name: string;
        category: string;
        description: string;
        notes?: string;              // ← Phase 8 (present iff notesIncluded === true)
        size: string | null;         // ← Phase 3 (valid-label-or-null; '' and orphans → null)
        releaseIds: string[];
        locked: boolean;
        partial: boolean;            // ← Phase 7 (single sub-100% allocation; splits excluded)
      }>;
    }>;
  }>;
}

/**
 * Build the compact JSON-serializable product snapshot for Firestore.
 * Called by writeSnapshot in useAiConnectivity.ts; exported for testing.
 *
 * Per-rib fields:
 *   releaseIds — IDs of all releases this rib is allocated to.
 *                Empty = unallocated. More than one = split allocation (AI must not touch).
 *   locked — true when any progress entry has percentComplete > 0.
 *   partial — true when the rib has exactly one allocation at a percentage
 *             other than 100. Zero allocations → false; splits → false (the
 *             AI reads those from releaseIds.length). Together with locked and
 *             releaseIds this makes move_rib's release-leg eligibility fully
 *             derivable from the snapshot.
 *
 * Phase 8 additions:
 *   - ribItems: include notes (string) — omitted when notesIncluded is false
 *   - top-level notesIncluded (boolean) — always present in v0.49.0+; positive
 *     marker so a snapshot's absence of notes is never load-bearing (D10)
 *   - selectSnapshotForWrite: bounded variant selection (full/lean/skip, D8)
 *
 * @pure — no side effects; testable without Firebase or React.
 */
export function buildAiSnapshot(
  p: Product,
  opts?: { includeNotes?: boolean },
): AiSnapshot {
  const includeNotes = opts?.includeNotes ?? true;
  // Valid-label set used for per-rib size normalization below.
  const sizeLabels = new Set((p.sizeMapping ?? []).map(m => m.label));
  return {
    id: p.id,
    name: p.name,
    description: p.description,
    notesIncluded: includeNotes,                                     // ← Phase 8 (always present)
    sizeMapping: (p.sizeMapping ?? [])                               // ← Phase 3
      .slice()
      .sort((a, b) => a.points - b.points)
      .map(m => ({ label: m.label, points: m.points })),
    releases: p.releases
      .slice()
      .sort((a, b) => a.order - b.order)
      .map(r => ({ id: r.id, name: r.name, order: r.order })),
    themes: p.themes.map(t => ({
      id: t.id,
      name: t.name,
      backboneItems: t.backboneItems.map(b => ({
        id: b.id,
        name: b.name,
        ribItems: b.ribItems.map(r => {
          const allocations = r.releaseAllocations ?? [];
          const sole = allocations.length === 1 ? allocations[0] : undefined;
          return {
            id: r.id,
            name: r.name,
            category: r.category,
            description: r.description,
            ...(includeNotes && { notes: r.notes ?? '' }),   // ← Phase 8: normalize undefined -> ''
            size: (r.size && sizeLabels.has(r.size)) ? r.size : null,  // ← Phase 3
            releaseIds: allocations.map(a => a.releaseId),
            locked: isRibLocked(r),
            partial: sole !== undefined && sole.percentage !== 100,    // ← Phase 7
          };
        }),
      })),
    })),
  };
}

/**
 * Choose the largest snapshot variant that fits `limit` bytes (D8). Full (with
 * notes) if it fits; else lean (no notes, notesIncluded:false); else null
 * (caller skips the write). `limit` is a parameter so unit tests force each rung
 * with tiny limits instead of multi-hundred-KB fixtures.
 * @pure
 */
export function selectSnapshotForWrite(
  p: Product,
  limit: number,
): { snapshot: AiSnapshot | null; degraded: boolean } {
  const byteLen = (v: unknown) =>
    new TextEncoder().encode(JSON.stringify(v)).length;
  const full = buildAiSnapshot(p, { includeNotes: true });
  if (byteLen(full) <= limit) return { snapshot: full, degraded: false };
  const lean = buildAiSnapshot(p, { includeNotes: false });
  if (byteLen(lean) <= limit) return { snapshot: lean, degraded: true };
  return { snapshot: null, degraded: true };
}
