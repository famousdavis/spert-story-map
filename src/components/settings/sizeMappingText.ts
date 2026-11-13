// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { UNDO_HINT } from '../../lib/constants';
import type { RemoveSizeDecision } from '../../lib/settingsMutations';

/**
 * The size list editor's sentences. Every count goes through `count`, and every verb
 * that follows a count agrees with it: "1 item uses", "2 items use".
 */

export const quoted = (label: string) => `“${label}”`;

/** `1 item`, `2 items`; `1 point`, `0.5 points`. */
export const count = (n: number, one: string) => `${n} ${n === 1 ? one : `${one}s`}`;

/** The verb after a count: `agree(1, 'uses', 'use')` is `uses`. */
const agree = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const POINTS_PROBLEM = 'Points must be a number, 0 or more.';
export const MAX_SIZES_LINE = 'At most 20 sizes.';
export const ORPHAN_TITLE = 'Sizes your items still use that are not in this list';
export const ORPHAN_HINT = 'Renamed a size by mistake? Rename it back to its old label and these items join it at its points.';

export const staleLine = (label: string) => `${quoted(label)} was changed elsewhere. Nothing was saved.`;
export const removedLine = (label: string) => `Removed ${quoted(label)}.`;
export const orphanLine = (label: string, items: number) => `${quoted(label)} · ${count(items, 'item')}`;

/** R37's note under the effective row a locked item uses. */
export function lockedPointsNote(label: string, locked: number): string {
  return `${count(locked, 'item')} with recorded progress ${agree(locked, 'uses', 'use')} ${quoted(label)}: `
    + 'changing its points changes the points recorded for past sprints.';
}

/** After Add back, while the row is still at 0 points. */
export function zeroPointsLine(label: string, items: number): string {
  return `${count(items, 'item')} ${agree(items, 'uses', 'use')} ${quoted(label)} at 0 points. `
    + `Enter its points to count ${agree(items, 'it', 'them')}.`;
}

/** After a rename that brought orphans holding the new label back. */
export function revivalLines(label: string, items: number, locked: number, points: number): string[] {
  const lines = [`${count(items, 'item')} joined ${quoted(label)}.`];
  if (locked > 0) {
    lines.push(`${locked} of them ${agree(locked, 'has', 'have')} recorded progress and now `
      + `${agree(locked, 'counts', 'count')} at ${count(points, 'point')}.`);
  }
  return lines;
}

/** The line under a row whose Remove was refused. */
export function removeRefusal(label: string, decision: RemoveSizeDecision): string | null {
  if (decision.kind === 'stale') return staleLine(label);
  if (decision.kind === 'refusedLocked') {
    return `${quoted(label)} can't be removed: ${count(decision.locked, 'item')} with recorded progress `
      + `${agree(decision.locked, 'uses', 'use')} it, and removing it would change the points recorded for past sprints.`;
  }
  if (decision.kind === 'refusedNext') {
    return `${quoted(label)} can't be removed: another ${quoted(label)} row has different points, and `
      + `${count(decision.locked, 'item')} with recorded progress ${agree(decision.locked, 'uses', 'use')} ${quoted(label)}. `
      + `Remove the other ${quoted(label)} row first.`;
  }
  return null;
}

/** The remove confirm's message, from the decision as it stands now. Null when it needs no confirm. */
export function removeConfirmMessage(label: string, decision: RemoveSizeDecision): string | null {
  if (decision.kind === 'confirmUnsized') {
    return `${count(decision.items, 'item')} ${agree(decision.items, 'uses', 'use')} ${quoted(label)} `
      + `(${count(decision.points, 'point')}). Removing it leaves ${agree(decision.items, 'it', 'them')} unsized. ${UNDO_HINT}`;
  }
  if (decision.kind === 'confirmNext') {
    return `${count(decision.items, 'item')} ${agree(decision.items, 'uses', 'use')} ${quoted(label)} `
      + `(${count(decision.points, 'point')}). ${agree(decision.items, 'It', 'They')} will count at the next `
      + `${quoted(label)} row's points instead (${count(decision.nextPoints, 'point')}). ${UNDO_HINT}`;
  }
  return null;
}
