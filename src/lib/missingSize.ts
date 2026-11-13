// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { isRibUnsized } from './calculations';
import type { Size, SizeMapping } from '../types';

/**
 * A size label that the size list no longer holds, so the rib shows as unsized. Every surface
 * that names such a label reads it here: the size picker's tooltip and Clear item, the locked
 * size and the Excel Size cell. Drawing a rib as unsized is `isRibUnsized`
 * alone; this adds that the rib has a label at all, so a rib with no size (`null`, `undefined`,
 * `''`) is never missing anything. Never decide this by points: a size whose row has 0 points
 * is sized.
 *
 * Nothing here changes what is stored. Adding a row with the label back in Settings brings
 * every such rib back, so a message gives the label quoted, exactly as it is stored.
 */
export function missingSizeLabel(size: Size | undefined, sizeMapping: SizeMapping[]): string | null {
  return size && isRibUnsized({ size }, sizeMapping) ? size : null;
}

/** Quoted, so a stray space or a change of case is visible: the label must be typed back exactly. */
const quoted = (label: string) => `“${label}”`;

const WHERE = 'Settings → T-Shirt Size Mapping';

/** The size picker's tooltip on a missing label. An empty list has nothing to pick. */
export function pickerMissingTitle(label: string, sizeMapping: SizeMapping[]): string {
  return sizeMapping.length === 0
    ? `Your size list is empty. Add ${quoted(label)} in ${WHERE}.`
    : `${quoted(label)} is no longer in your size list. Pick a size, or add ${quoted(label)} back in ${WHERE}.`;
}

/** The locked size's sentence on a missing label. A locked size cannot be picked, only restored. */
export function lockedMissingNote(label: string, sizeMapping: SizeMapping[]): string {
  return sizeMapping.length === 0
    ? `Your size list is empty. Add ${quoted(label)} in ${WHERE} to count its points again.`
    : `${quoted(label)} is no longer in your size list. Add ${quoted(label)} back in ${WHERE} to count its points again.`;
}

/** The picker's Clear item on a missing label: clearing it throws away the only stored copy. */
export const clearMissingLabel = (label: string) => `Clear ${quoted(label)} (not in size list)`;

/** The Excel Size cell on a missing label. Its Points cell is 0. */
export const excelMissingCell = (label: string) => `${quoted(label)} (not in size list)`;
