// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Per-card color shading for rib items on the Map tab.
 *
 * Used for visual triage — e.g., flagging cards suspected of being unneeded
 * so the team can locate them quickly at the next meeting.
 *
 * Mid-tone palette (Tailwind -200 in light mode, -900/30 in dark) — distinct
 * enough to differentiate at a glance, light enough to keep card text readable.
 *
 * Class names are spelled out in full so Tailwind 4's JIT scanner picks them
 * up at build time (constructed names like `bg-${key}-200` would be invisible
 * to the scanner and tree-shaken away).
 */

export const RIB_CARD_COLOR_KEYS = [
  'rose',
  'amber',
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
  amber: 'bg-amber-200 dark:bg-amber-900/40',
  yellow: 'bg-yellow-200 dark:bg-yellow-900/40',
  emerald: 'bg-emerald-200 dark:bg-emerald-900/40',
  sky: 'bg-sky-200 dark:bg-sky-900/40',
  violet: 'bg-violet-200 dark:bg-violet-900/40',
  slate: 'bg-slate-300 dark:bg-slate-700/60',
};

/** Solid swatch colors for the picker buttons themselves. */
export const RIB_CARD_COLOR_SWATCH: Record<RibCardColorKey, string> = {
  rose: 'bg-rose-400',
  amber: 'bg-amber-400',
  yellow: 'bg-yellow-400',
  emerald: 'bg-emerald-400',
  sky: 'bg-sky-400',
  violet: 'bg-violet-400',
  slate: 'bg-slate-400',
};

/** Human-readable name for the swatch tooltip. */
export const RIB_CARD_COLOR_LABEL: Record<RibCardColorKey, string> = {
  rose: 'Rose',
  amber: 'Amber',
  yellow: 'Yellow',
  emerald: 'Emerald',
  sky: 'Sky',
  violet: 'Violet',
  slate: 'Slate',
};

/** Validate that a value is a known card color key (or undefined/null = no color). */
export function isRibCardColorKey(value: unknown): value is RibCardColorKey {
  return typeof value === 'string' && (RIB_CARD_COLOR_KEYS as readonly string[]).includes(value);
}
