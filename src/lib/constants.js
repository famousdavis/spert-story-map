// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

export const STORAGE_KEYS = {
  PRODUCTS_INDEX: 'rp_products_index',
  PRODUCT_PREFIX: 'rp_product_',
  DEFAULTS: 'rp_defaults',
  PREFERENCES: 'rp_app_preferences',
  WORKSPACE_ID: 'rp_workspace_id',
};

export const CHANGELOG_MAX_ENTRIES = 500;

export const SCHEMA_VERSION = 2;

export const DEFAULT_SIZE_MAPPING = [
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
};
