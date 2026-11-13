// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// A project tile's lines (v0.55.0). Story Map's own figures, in the dashboard's form.

export interface TileFigures {
  totalItems: number;
  totalPoints: number;
  pctComplete: number;
  releaseCount: number;
  sprintCount: number;
  /** Ribs with no size, or a size the size list no longer holds (`isRibUnsized`). */
  unsized: number;
  /** Rows of progress that count nowhere: Insights' "Progress not counting" (`getStrandedRows`). */
  stranded: number;
}

const plural = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** Line 1: the items, their points and how much is done. */
export function itemsLine(f: TileFigures): string {
  if (f.totalItems === 0) return 'No items yet';
  return `${plural(f.totalItems, 'item')} · ${f.totalPoints} pts · ${Math.round(f.pctComplete)}% complete`;
}

/** Line 2: releases and sprints. */
export function plansLine(f: TileFigures): string {
  if (f.releaseCount === 0 && f.sprintCount === 0) return 'No releases or sprints yet';
  const releases = f.releaseCount === 0 ? 'No releases yet' : plural(f.releaseCount, 'release');
  const sprints = f.sprintCount === 0 ? 'no sprints yet' : plural(f.sprintCount, 'sprint');
  return `${releases} · ${sprints}`;
}

/** Line 3, shown only when one part is above 0: what needs attention, without its ⚠. */
export function warningLine(f: TileFigures): string | null {
  const parts: string[] = [];
  if (f.unsized > 0) parts.push(`${plural(f.unsized, 'item')} unsized`);
  if (f.stranded > 0) parts.push(`Progress not counting: ${f.stranded}`);
  return parts.length > 0 ? parts.join(' · ') : null;
}
