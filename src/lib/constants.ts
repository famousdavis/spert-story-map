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
