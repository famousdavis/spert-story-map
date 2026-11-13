// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { SizeMapping } from '../types';

export const STORAGE_KEYS = {
  PRODUCTS_INDEX: 'rp_products_index',
  PRODUCT_PREFIX: 'rp_product_',
  DEFAULTS: 'rp_defaults',
  PREFERENCES: 'rp_app_preferences',
  WORKSPACE_ID: 'rp_workspace_id',
} as const;

export const CHANGELOG_MAX_ENTRIES = 500;

export const SCHEMA_VERSION = 2;

export const DEFAULT_SIZE_MAPPING: SizeMapping[] = [
  { label: 'XS', points: 5 },
  { label: 'S', points: 10 },
  { label: 'M', points: 20 },
  { label: 'L', points: 40 },
  { label: 'XL', points: 100 },
  { label: 'XXL', points: 200 },
  { label: 'XXXL', points: 300 },
];

export const CATEGORIES = {
  CORE: 'core',
  NON_CORE: 'non-core',
} as const;

/**
 * Max length of UI-editable rib-item notes (textarea counter cap).
 * Distinct from validateProduct.ts:MAX_MEMO, which is the broader validation-layer
 * cap covering description, allocation memo, progress comment, and notes.
 */
export const NOTES_MAX = 2000;

/**
 * Max length of a card-color legend label (textarea/input cap, UI layer).
 * The validation layer (validateProduct.ts:MAX_LABEL) enforces the same bound
 * defensively on import.
 */
export const CARD_COLOR_LABEL_MAX = 40;

/** R31: what a product is. On the welcome panel, under New Product's name field, and in the copy prompt. */
export const PRODUCT_DEFINITION = 'A product can be an application, a service, an internal capability or any other initiative.';

/**
 * Where undo is, for a confirm on a tab with no undo key of its own. The stack
 * lives in `ProductLayout`, so it survives the tab change this sends the user on;
 * the keys themselves are only on Map and Sizing.
 */
export const UNDO_HINT = 'To undo, open the Map or Sizing tab and press Ctrl+Z (Cmd+Z on a Mac).';

/**
 * Hover delay (ms) before a rib card's full-name tooltip appears, on both the Map
 * and Sizing tabs. Deliberately longer than `useTooltip`'s 200ms default so that
 * sweeping the pointer across cards doesn't flash tooltips — the user must dwell.
 */
export const RIB_NAME_TOOLTIP_DELAY = 500;
