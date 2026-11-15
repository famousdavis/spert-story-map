// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Every sentence tile colour and archive add to Story Map's screens (v0.56.0), in one place for
// William's review. Forecaster's v0.50.0 words where it has them, with "product" for "project".

import { MAX_PROJECT_PREFS } from '../../lib/projectPrefs';

/** R88: the first cloud read of the settings failed. The notice above the grid. */
export const SETTINGS_UNREAD_NOTICE =
  'Tile colors, archive and order could not be loaded, so they are turned off for now. Reload the page to try again.';
/** R88: why Tile color, Archive and the drag grip are disabled meanwhile. */
export const SETTINGS_UNREAD_REASON = 'Tile colors, archive and order could not be loaded.';
/** R-1: a product whose id the settings cannot hold. */
export const REFUSED_ID_REASON = "This product's id cannot hold a tile color or archive.";
/** R-1: the cap. */
export const CAP_NOTICE =
  `Not saved: tile colors and archive can be kept for at most ${MAX_PROJECT_PREFS} products.`;

export const archivedMessage = (name: string, shownCount: number | null) =>
  shownCount === null ? `Archived "${name}".` : `Archived "${name}". Show archived (${shownCount}) lists it.`;
export const unarchivedMessage = (name: string) => `Unarchived "${name}".`;

export const allArchivedLine = (count: number) =>
  `All products are archived. Select "Show archived (${count})" to see them.`;

/** "“A”", "“A” and “B”", "“A”, “B” and “C”". */
function nameList(names: readonly string[]): string {
  const quoted = names.map(n => `“${n}”`);
  return quoted.length <= 1 ? (quoted[0] ?? '') : `${quoted.slice(0, -1).join(', ')} and ${quoted[quoted.length - 1]}`;
}

/** R84, the Products page's import banner: the products an import wrote that are archived. */
export function importArchivedLine(names: readonly string[]): string | null {
  if (names.length === 0) return null;
  return names.length === 1
    ? `${nameList(names)} is archived: Show archived lists it.`
    : `${nameList(names)} are archived: Show archived lists them.`;
}

/** R84, Settings → Data: the product just replaced is archived. */
export const dataImportArchivedLine = (name: string) =>
  `“${name}” is archived: Show archived on the Products page lists it.`;
