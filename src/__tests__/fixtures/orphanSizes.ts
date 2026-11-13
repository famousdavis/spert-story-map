// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { entry, makeProduct, makeRib } from './progressIntegrity';
import type { Product, SizeMapping, Size } from '../../types';

/**
 * A project whose ribs hold sizes the size list does and does not have, for the surfaces
 * that draw a size. Each rib's name is its case.
 *
 * ⚠️ Built in memory, never imported: `validateProduct` clears a label its size list does
 * not hold to `''`, which already drew as no size, so an imported fixture passes on the
 * old code and proves nothing (CLAUDE.md #74).
 *
 * The list holds a 0-point row (`Tiny`), so a surface deciding by points fails `zero`.
 * `XL` and `M ` (a stray space) are not in it. The `locked*` ribs have progress in S1 on
 * their release, so every surface shows them as a locked size.
 */
export const SIZE_LIST: SizeMapping[] = [
  { label: 'L', points: 40 },
  { label: 'M', points: 20 },
  { label: 'Tiny', points: 0 },
];

export const CASES: Record<string, Size> = {
  orphan: 'XL',
  valid: 'L',
  zero: 'Tiny' as Size,
  none: null,
  empty: '' as Size,
  spaced: 'M ' as Size,
};

export const LOCK_NOTE = 'Size locked: progress recorded in S1';

export function orphanProduct(sizeMapping: SizeMapping[] = SIZE_LIST): Product {
  const on = [{ releaseId: 'R1', percentage: 100 }];
  const ribs = Object.entries(CASES).flatMap(([name, size]) => [
    makeRib(name, on, [], size),
    makeRib(`locked${name}`, on, [entry('S1', 'R1', 10)], size),
  ]);
  return { ...makeProduct(ribs), sizeMapping };
}
