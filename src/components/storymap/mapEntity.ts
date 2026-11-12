// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Backbone, Product, Theme } from '../../types';

/**
 * Themes and backbones as the map's detail panel addresses them. Pure: no React.
 *
 * A theme is addressed by its id. A backbone is addressed by its id and the theme it
 * was clicked in, because Connect AI can create the same backbone id in two themes,
 * and because a backbone can move to another theme while its panel is open.
 */
export type MapEntityTarget =
  | { kind: 'theme'; id: string }
  | { kind: 'backbone'; id: string; themeIdAtClick: string };

/** The one selection behind the map's four panels. Exclusive by construction. */
export type MapSelection =
  | { kind: 'rib'; id: string; isNew: boolean }
  | { kind: 'release'; id: string }
  | MapEntityTarget;

/** A target found in a product. `theme` is the theme that holds a backbone now. */
export type ResolvedEntity =
  | { kind: 'theme'; theme: Theme }
  | { kind: 'backbone'; theme: Theme; backbone: Backbone };

/** Hover text shared by every clickable name on the map. */
export const NAME_HINT = 'Click for details · Double-click to rename';
/** How much of a description the hover text shows. */
const TITLE_EXCERPT = 300;
/** The docked panel's width (`w-96`), which the map gives up when it opens. */
export const DOCKED_PANEL_WIDTH = 384;
/** Space kept between a revealed name and the map's edge. */
const REVEAL_MARGIN = 16;

export function isEntity(selection: MapSelection | null): selection is MapEntityTarget {
  return selection?.kind === 'theme' || selection?.kind === 'backbone';
}

/**
 * Identifies a name on the map, a pending open and an editor. A backbone's key carries
 * the theme, so two backbones sharing an id never share a panel or an editor.
 */
export function entityKey(target: MapEntityTarget): string {
  return target.kind === 'theme' ? `theme:${target.id}` : `backbone:${target.themeIdAtClick}:${target.id}`;
}

/**
 * The backbone with this id in `themeIdAtClick` if that theme still holds it, else the
 * first theme holding that id, else null. The one resolver for rendering, the
 * description commit and the panel's rename.
 */
export function resolveBackbone(themes: Theme[], id: string, themeIdAtClick: string): { theme: Theme; backbone: Backbone } | null {
  const home = themes.find(t => t.id === themeIdAtClick);
  const atHome = home?.backboneItems.find(b => b.id === id);
  if (home && atHome) return { theme: home, backbone: atHome };
  for (const theme of themes) {
    const backbone = theme.backboneItems.find(b => b.id === id);
    if (backbone) return { theme, backbone };
  }
  return null;
}

export function resolveEntity(themes: Theme[], target: MapEntityTarget): ResolvedEntity | null {
  if (target.kind === 'theme') {
    const theme = themes.find(t => t.id === target.id);
    return theme ? { kind: 'theme', theme } : null;
  }
  const found = resolveBackbone(themes, target.id, target.themeIdAtClick);
  return found ? { kind: 'backbone', ...found } : null;
}

/** Writes a name or description to a backbone, found by the resolver in `prev`. `prev` when nothing resolves. */
export function patchBackbone(prev: Product, id: string, themeIdAtClick: string, patch: { name?: string; description?: string }): Product {
  const found = resolveBackbone(prev.themes, id, themeIdAtClick);
  if (!found) return prev;
  return {
    ...prev,
    themes: prev.themes.map(t => t !== found.theme ? t : {
      ...t,
      backboneItems: t.backboneItems.map(b => b === found.backbone ? { ...b, ...patch } : b),
    }),
  };
}

/** Every theme's and backbone's description, keyed as `entityKey` keys them. One pass. */
export function buildDescriptionLookup(themes: Theme[]): Map<string, string> {
  const lookup = new Map<string, string>();
  for (const theme of themes) {
    lookup.set(entityKey({ kind: 'theme', id: theme.id }), theme.description ?? '');
    for (const backbone of theme.backboneItems) {
      lookup.set(entityKey({ kind: 'backbone', id: backbone.id, themeIdAtClick: theme.id }), backbone.description ?? '');
    }
  }
  return lookup;
}

/** The name's hover text: the start of the trimmed description, then the hint. Just the hint when blank. */
export function nameTitle(description: string): string {
  const text = description.trim();
  if (!text) return NAME_HINT;
  const excerpt = text.length > TITLE_EXCERPT ? `${text.slice(0, TITLE_EXCERPT).trimEnd()}…` : text;
  return `${excerpt}\n\n${NAME_HINT}`;
}

/**
 * How far to pan left so a clicked name stays in view once the docked panel takes the
 * right-hand `DOCKED_PANEL_WIDTH` of the root. Never pans the name's left edge past the
 * map's left edge. 0 when it already shows.
 */
export function revealShift(name: { left: number; right: number }, root: { left: number; right: number }): number {
  const visibleRight = root.right - DOCKED_PANEL_WIDTH - REVEAL_MARGIN;
  const overflow = name.right - visibleRight;
  if (overflow <= 0) return 0;
  const room = name.left - (root.left + REVEAL_MARGIN);
  return Math.max(0, Math.min(overflow, room));
}
