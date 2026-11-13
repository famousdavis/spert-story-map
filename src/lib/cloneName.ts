// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { nextCopyName } from './import-utils';

/**
 * The most characters a project name may have: `validateProduct`'s `MAX_STRING`, asserted on
 * import (`validateProduct.ts:288`), and the project dialog's `maxLength`.
 */
export const PROJECT_NAME_MAX = 1000;

/**
 * A clone's name (v0.55.0): import's own numbering, `X (Copy)`, then `X (Copy 2)`
 * (`nextCopyName`), never longer than `PROJECT_NAME_MAX`.
 *
 * ⚠️ Without the cap a 1000-character name clones to 1007, and the clone's own export then
 * refuses to import. The base name is shortened until the suffixed name fits, and the collision
 * check runs again on the shortened base, since a shorter base can collide where the long one
 * did not. Trailing spaces left by the cut go, so the suffix never sits after a space.
 *
 * Only the Clone button calls this. Import's copy path still calls `nextCopyName` directly and
 * keeps the same defect, reported rather than fixed in this release.
 */
export function cloneName(sourceName: string, takenNames: string[]): string {
  let base = sourceName;
  let name = nextCopyName(base, takenNames);
  while (name.length > PROJECT_NAME_MAX && base.length > 0) {
    base = base.slice(0, Math.max(0, base.length - (name.length - PROJECT_NAME_MAX))).trimEnd();
    name = nextCopyName(base, takenNames);
  }
  return name;
}
