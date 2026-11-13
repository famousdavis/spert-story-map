// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Finding a project tile's controls when focus must land on one after a dialog closes or a
// delete (v0.55.0; SPERT Forecaster's `lib/tile-focus.ts` at 38f1a63).
//
// ⚠️ The tile is found by comparing its `data-project-id` as TEXT, never by a CSS selector built
// from the id: a project id may hold any character but `/` (`src/lib/validateProduct.ts:44-46`),
// and an import keeps the file's id. Its controls are found by their names, which keep the
// project's name, compared as text: a selector built from a name would throw on a `"` and find
// nothing for a `\`.

export type TileControl = 'open' | 'edit' | 'delete';

const PREFIX: Record<TileControl, string> = { open: 'Open Structure for ', edit: 'Edit ', delete: 'Delete ' };

/** The tile root for `projectId` under `root`, or null. */
export function findTile(root: ParentNode | null, projectId: string): HTMLElement | null {
  return Array.from(root?.querySelectorAll<HTMLElement>('[data-tile="true"]') ?? []).find(
    el => el.dataset.projectId === projectId,
  ) ?? null;
}

/** The control on `projectId`'s tile under `root`; null when the tile or the control is not there. */
export function findTileControl(root: ParentNode | null, projectId: string, control: TileControl): HTMLElement | null {
  const tile = findTile(root, projectId);
  const prefix = PREFIX[control];
  return Array.from(tile?.querySelectorAll<HTMLElement>('button') ?? []).find(
    b => (b.getAttribute('aria-label') ?? '').startsWith(prefix),
  ) ?? null;
}
