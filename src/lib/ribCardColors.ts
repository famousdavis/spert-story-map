// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product } from '../types';

/**
 * Per-card color shading for rib items on the Map and Sizing tabs.
 *
 * Used for visual triage — e.g., flagging cards suspected of being unneeded
 * so the team can locate them quickly at the next meeting.
 *
 * Mid-tone palette (Tailwind -200 in light mode, -900/40 in dark) — distinct
 * enough to differentiate at a glance, light enough to keep card text readable.
 * The seven hues form the canonical red/orange/yellow/green/blue/purple set
 * plus a neutral gray, so each is unmistakable from its neighbours.
 *
 * Class names are spelled out in full so Tailwind 4's JIT scanner picks them
 * up at build time (constructed names like `bg-${key}-200` would be invisible
 * to the scanner and tree-shaken away).
 */

export const RIB_CARD_COLOR_KEYS = [
  'rose',
  'orange',
  'yellow',
  'emerald',
  'sky',
  'violet',
  'slate',
] as const;

export type RibCardColorKey = typeof RIB_CARD_COLOR_KEYS[number];

/** Tailwind classes for the card background tint (light + dark mode). */
export const RIB_CARD_COLOR_BG: Record<RibCardColorKey, string> = {
  rose: 'bg-rose-200 dark:bg-rose-900/40',
  orange: 'bg-orange-200 dark:bg-orange-900/40',
  yellow: 'bg-yellow-200 dark:bg-yellow-900/40',
  emerald: 'bg-emerald-200 dark:bg-emerald-900/40',
  sky: 'bg-sky-200 dark:bg-sky-900/40',
  violet: 'bg-violet-200 dark:bg-violet-900/40',
  slate: 'bg-slate-300 dark:bg-slate-700/60',
};

/** Solid swatch colors for the picker buttons themselves. */
export const RIB_CARD_COLOR_SWATCH: Record<RibCardColorKey, string> = {
  rose: 'bg-rose-400',
  orange: 'bg-orange-400',
  yellow: 'bg-yellow-400',
  emerald: 'bg-emerald-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  slate: 'bg-slate-400',
};

/** Human-readable name for the swatch tooltip. */
export const RIB_CARD_COLOR_LABEL: Record<RibCardColorKey, string> = {
  rose: 'Rose',
  orange: 'Orange',
  yellow: 'Yellow',
  emerald: 'Emerald',
  sky: 'Sky',
  violet: 'Violet',
  slate: 'Slate',
};

/**
 * Card color keys that have been renamed/replaced, mapped to their current
 * equivalent. v0.38.0: `amber` was replaced by `orange` — amber's gold tone was
 * too close to yellow to tell apart. Existing amber-coded cards (and their
 * legend label) are normalized to orange on load and on import, so no flag or
 * meaning is lost.
 */
export const LEGACY_CARD_COLOR_ALIASES: Record<string, RibCardColorKey> = {
  amber: 'orange',
};

/**
 * Own-property-guarded alias lookup. A bare `LEGACY_CARD_COLOR_ALIASES[key]`
 * would resolve inherited keys like `constructor` / `__proto__` to truthy
 * prototype members, so always route alias lookups through here.
 */
function legacyAliasFor(key: string): RibCardColorKey | undefined {
  return Object.prototype.hasOwnProperty.call(LEGACY_CARD_COLOR_ALIASES, key)
    ? LEGACY_CARD_COLOR_ALIASES[key]
    : undefined;
}

/** Validate that a value is a known card color key (or undefined/null = no color). */
export function isRibCardColorKey(value: unknown): value is RibCardColorKey {
  return typeof value === 'string' && (RIB_CARD_COLOR_KEYS as readonly string[]).includes(value);
}

/**
 * Resolve a stored color value (possibly a legacy alias) to a current key.
 * Returns undefined for unknown values (caller should treat as "no color").
 */
export function resolveCardColorKey(value: unknown): RibCardColorKey | undefined {
  if (typeof value !== 'string') return undefined;
  if (isRibCardColorKey(value)) return value;
  return legacyAliasFor(value);
}

/**
 * Normalize any legacy card colors in a product to current keys (e.g. amber→orange),
 * on both rib `cardColor` flags and `cardColorLabels` keys. Idempotent: returns the
 * SAME product reference when nothing needs migrating, so it's safe to run on every
 * load and cloud echo without forcing needless re-renders. When both a legacy and a
 * current label exist for the same target, the current-key label wins.
 */
export function migrateCardColors(product: Product | null): Product | null {
  if (!product) return product;
  let changed = false;

  const themes = product.themes.map(t => ({
    ...t,
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      ribItems: b.ribItems.map(r => {
        const alias = r.cardColor ? legacyAliasFor(r.cardColor) : undefined;
        if (alias) {
          changed = true;
          return { ...r, cardColor: alias };
        }
        return r;
      }),
    })),
  }));

  let labels = product.cardColorLabels;
  if (labels && Object.keys(labels).some(k => legacyAliasFor(k) !== undefined)) {
    const source = labels;
    const remapped: Record<string, string> = {};
    for (const [key, val] of Object.entries(source)) {
      const alias = legacyAliasFor(key);
      if (alias) {
        // Only fill from a legacy key if the current key doesn't already own a label.
        if (remapped[alias] === undefined && source[alias] === undefined) remapped[alias] = val;
      } else {
        remapped[key] = val;
      }
    }
    labels = remapped;
    changed = true;
  }

  if (!changed) return product;
  return { ...product, themes, cardColorLabels: labels };
}
