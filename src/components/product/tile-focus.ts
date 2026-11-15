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

/**
 * The open button's two names (v0.56.0, Forecaster's `OPEN_PREFIXES`): "Open Structure for X" and,
 * on an archived tile, "Unarchive and open Structure for X". The open button comes first in the
 * tile, so it is found before an Unarchive button whatever the product's name.
 */
const OPEN_PREFIXES = ['Open Structure for ', 'Unarchive and open Structure for '];
const PREFIX: Record<Exclude<TileControl, 'open'>, string> = { edit: 'Edit ', delete: 'Delete ' };

const labelOf = (el: Element) => el.getAttribute('aria-label') ?? '';

/** The tile root for `projectId` under `root`, or null. */
export function findTile(root: ParentNode | null, projectId: string): HTMLElement | null {
  return Array.from(root?.querySelectorAll<HTMLElement>('[data-tile="true"]') ?? []).find(
    el => el.dataset.projectId === projectId,
  ) ?? null;
}

const tileButtons = (root: ParentNode | null, projectId: string) =>
  Array.from(findTile(root, projectId)?.querySelectorAll<HTMLElement>('button') ?? []);

/** The control on `projectId`'s tile under `root`; null when the tile or the control is not there. */
export function findTileControl(root: ParentNode | null, projectId: string, control: TileControl): HTMLElement | null {
  const matches = control === 'open'
    ? (label: string) => OPEN_PREFIXES.some(prefix => label.startsWith(prefix))
    : (label: string) => label.startsWith(PREFIX[control]);
  return tileButtons(root, projectId).find(b => matches(labelOf(b))) ?? null;
}

/** The control on `projectId`'s tile whose whole name is `name` ("Archive X", "Unarchive X"). */
export function findTileControlNamed(root: ParentNode | null, projectId: string, name: string): HTMLElement | null {
  return tileButtons(root, projectId).find(b => labelOf(b) === name) ?? null;
}

/** Where focus goes once the tiles have re-rendered (v0.56.0, Forecaster's). */
export type TileFocusTarget =
  | { kind: TileControl; projectId: string }
  | { kind: 'named'; projectId: string; name: string }
  | { kind: 'new' };

/**
 * Where focus goes when a tile leaves the grid (an Archive with "Show archived" off): the next
 * SHOWN tile's open button, else the previous shown tile's, else New Product.
 */
export function focusAfterTileLeaves(shown: readonly { id: string }[], leavingId: string): TileFocusTarget {
  const index = shown.findIndex(p => p.id === leavingId);
  const neighbour = index === -1 ? undefined : (shown[index + 1] ?? shown[index - 1]);
  return neighbour ? { kind: 'open', projectId: neighbour.id } : { kind: 'new' };
}

/** The element a focus target names, or null when it is not on screen. */
export function resolveFocusTarget(root: ParentNode | null, target: TileFocusTarget, newProduct: HTMLElement | null): HTMLElement | null {
  if (target.kind === 'new') return newProduct;
  if (target.kind === 'named') return findTileControlNamed(root, target.projectId, target.name);
  return findTileControl(root, target.projectId, target.kind);
}
