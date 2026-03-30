// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product } from '../types';

/**
 * Comprehensive schema validation for imported product data.
 *
 * Validates types, ranges, string lengths, reference integrity, and
 * strips unknown fields to prevent state corruption or injection.
 */

const MAX_STRING = 1000;      // Max length for name/description fields
const MAX_MEMO = 2000;        // Max length for memo/comment fields
const MAX_THEMES = 100;
const MAX_BACKBONES = 200;
const MAX_RIBS = 5000;
const MAX_RELEASES = 100;
const MAX_SPRINTS = 200;
const MAX_ALLOCATIONS = 100;
const MAX_PROGRESS = 10000;
const MAX_SIZE_MAPPING = 20;
const MAX_CHANGELOG = 500;

/** Throw if condition is false. */
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

/** Return true if value is a non-empty string within max length. */
function isValidString(v: unknown, maxLen: number = MAX_STRING): boolean {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
}

/** Return true if value looks like a UUID or reasonable ID string. */
function isValidId(v: unknown): boolean {
  return typeof v === 'string' && v.length > 0 && v.length <= 128 && !/[/]/.test(v);
}

/** Return true if value is a finite number. */
function isNum(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}


/** Clamp a number to [min, max]. */
function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

/**
 * Known top-level product fields. Any field not in this set is stripped
 * on import to prevent unexpected data from propagating into state.
 */
const KNOWN_PRODUCT_FIELDS = new Set([
  'id', 'name', 'description', 'createdAt', 'updatedAt',
  'schemaVersion', 'sizeMapping', 'releases', 'sprints',
  'sprintCadenceWeeks', 'themes', 'releaseCardOrder', 'sizingCardOrder',
  '_originRef', '_changeLog',
  // Export-time fields (stripped after validation by importProductFromJSON)
  '_storageRef', '_exportedBy', '_exportedById',
]);

/**
 * Validate and sanitize a parsed product object.
 *
 * @param {object} data - Raw parsed JSON object
 * @returns {object} - Sanitized product data
 * @throws {Error} - If data is structurally invalid
 */
export function validateProduct(data: unknown): Product {
  assert(data && typeof data === 'object' && !Array.isArray(data),
    'Product must be a JSON object');

  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- input data is unknown; cast to any for validation boundary traversal
  const d = data as any;

  // Required top-level fields
  assert(isValidId(d.id), 'Product id must be a non-empty string (max 128 chars, no slashes)');
  assert(isValidString(d.name), `Product name must be a non-empty string (max ${MAX_STRING} chars)`);
  assert(Array.isArray(d.themes), 'Product themes must be an array');

  // Collect all known entity IDs for reference integrity checks
  const releaseIds = new Set();
  const sprintIds = new Set();

  // --- Releases ---
  const releases = Array.isArray(d.releases) ? d.releases : [];
  assert(releases.length <= MAX_RELEASES, `Too many releases (max ${MAX_RELEASES})`);
  for (const r of releases) {
    assert(isValidId(r.id), 'Release id must be a valid string');
    assert(isValidString(r.name), 'Release name must be a non-empty string');
    releaseIds.add(r.id);
    // Sanitize numeric fields
    if (r.order !== undefined) {
      assert(isNum(r.order), 'Release order must be a number');
      r.order = clamp(Math.floor(r.order), 0, 10000);
    }
  }

  // --- Sprints ---
  const sprints = Array.isArray(d.sprints) ? d.sprints : [];
  assert(sprints.length <= MAX_SPRINTS, `Too many sprints (max ${MAX_SPRINTS})`);
  for (const s of sprints) {
    assert(isValidId(s.id), 'Sprint id must be a valid string');
    assert(isValidString(s.name), 'Sprint name must be a non-empty string');
    sprintIds.add(s.id);
    if (s.order !== undefined) {
      assert(isNum(s.order), 'Sprint order must be a number');
      s.order = clamp(Math.floor(s.order), 0, 10000);
    }
  }

  // --- Size mapping ---
  const sizeMapping = Array.isArray(d.sizeMapping) ? d.sizeMapping : null;
  if (sizeMapping) {
    assert(sizeMapping.length <= MAX_SIZE_MAPPING, `Too many size mappings (max ${MAX_SIZE_MAPPING})`);
    for (const sm of sizeMapping) {
      assert(isValidString(sm.label, 20), 'Size mapping label must be a string (max 20 chars)');
      assert(isNum(sm.points) && sm.points >= 0, 'Size mapping points must be a non-negative number');
    }
  }

  const validSizeLabels = sizeMapping
    ? new Set(sizeMapping.map(s => s.label))
    : null;

  // --- Themes ---
  assert(d.themes.length <= MAX_THEMES, `Too many themes (max ${MAX_THEMES})`);
  let totalRibs = 0;

  for (const theme of d.themes) {
    assert(isValidId(theme.id), 'Theme id must be a valid string');
    assert(Array.isArray(theme.backboneItems), 'Theme backboneItems must be an array');
    assert(theme.backboneItems.length <= MAX_BACKBONES,
      `Too many backbones in theme "${theme.name || theme.id}" (max ${MAX_BACKBONES})`);

    // Theme name: allow empty string for unnamed themes, but must be string
    if (theme.name !== undefined) {
      assert(typeof theme.name === 'string' && theme.name.length <= MAX_STRING,
        'Theme name must be a string');
    }

    for (const bb of theme.backboneItems) {
      assert(isValidId(bb.id), 'Backbone id must be a valid string');
      assert(Array.isArray(bb.ribItems), 'Backbone ribItems must be an array');

      if (bb.name !== undefined) {
        assert(typeof bb.name === 'string' && bb.name.length <= MAX_STRING,
          'Backbone name must be a string');
      }

      for (const rib of bb.ribItems) {
        totalRibs++;
        assert(totalRibs <= MAX_RIBS, `Too many rib items (max ${MAX_RIBS})`);
        assert(isValidId(rib.id), 'Rib item id must be a valid string');

        if (rib.name !== undefined) {
          assert(typeof rib.name === 'string' && rib.name.length <= MAX_STRING,
            'Rib item name must be a string');
        }

        if (rib.description !== undefined) {
          assert(typeof rib.description === 'string' && rib.description.length <= MAX_MEMO,
            'Rib item description too long');
        }

        if (rib.notes !== undefined) {
          assert(typeof rib.notes === 'string' && rib.notes.length <= MAX_MEMO,
            'Rib item notes too long (max 2000 chars)');
        }

        // Size validation
        if (rib.size && validSizeLabels) {
          if (!validSizeLabels.has(rib.size)) {
            // Don't reject — just clear invalid size (non-destructive)
            rib.size = '';
          }
        }

        // Category
        if (rib.category !== undefined) {
          assert(rib.category === 'core' || rib.category === 'non-core',
            'Rib category must be "core" or "non-core"');
        }

        // Release allocations
        if (Array.isArray(rib.releaseAllocations)) {
          // Strip allocations referencing non-existent releases
          if (releaseIds.size > 0) {
            rib.releaseAllocations = rib.releaseAllocations.filter(
              alloc => isValidId(alloc.releaseId) && releaseIds.has(alloc.releaseId)
            );
          }
          assert(rib.releaseAllocations.length <= MAX_ALLOCATIONS,
            `Too many allocations on rib "${rib.name || rib.id}"`);
          for (const alloc of rib.releaseAllocations) {
            assert(isValidId(alloc.releaseId), 'Allocation releaseId must be a valid string');
            if (alloc.percentage !== undefined) {
              assert(isNum(alloc.percentage), 'Allocation percentage must be a number');
              alloc.percentage = clamp(alloc.percentage, 0, 100);
            }
            if (alloc.memo !== undefined) {
              assert(typeof alloc.memo === 'string' && alloc.memo.length <= MAX_MEMO,
                'Allocation memo too long');
            }
          }
        }

        // Progress history
        if (Array.isArray(rib.progressHistory)) {
          // Strip entries referencing non-existent sprints or releases
          rib.progressHistory = rib.progressHistory.filter(p => {
            if (!isValidId(p.sprintId)) return false;
            if (sprintIds.size > 0 && !sprintIds.has(p.sprintId)) return false;
            if (p.releaseId !== undefined) {
              if (!isValidId(p.releaseId)) return false;
              if (releaseIds.size > 0 && !releaseIds.has(p.releaseId)) return false;
            }
            return true;
          });
          assert(rib.progressHistory.length <= MAX_PROGRESS,
            `Too many progress entries on rib "${rib.name || rib.id}"`);
          for (const p of rib.progressHistory) {
            if (p.percentComplete !== undefined) {
              assert(isNum(p.percentComplete), 'Progress percentComplete must be a number');
              p.percentComplete = clamp(p.percentComplete, 0, 100);
            }
            if (p.comment !== undefined) {
              assert(typeof p.comment === 'string' && p.comment.length <= MAX_MEMO,
                'Progress comment too long');
            }
          }
        }
      }
    }
  }

  // --- releaseCardOrder ---
  if (d.releaseCardOrder && typeof d.releaseCardOrder === 'object') {
    for (const [key, val] of Object.entries(d.releaseCardOrder)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype'
          || !Array.isArray(val)) {
        delete d.releaseCardOrder[key];
        continue;
      }
      // Filter to valid ID strings only
      d.releaseCardOrder[key] = val.filter(id => isValidId(id));
    }
  }

  // --- sizingCardOrder ---
  if (d.sizingCardOrder && typeof d.sizingCardOrder === 'object') {
    for (const [key, val] of Object.entries(d.sizingCardOrder)) {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype'
          || !Array.isArray(val)) {
        delete d.sizingCardOrder[key];
        continue;
      }
      d.sizingCardOrder[key] = val.filter(id => isValidId(id));
    }
  }

  // --- _changeLog ---
  if (Array.isArray(d._changeLog)) {
    assert(d._changeLog.length <= MAX_CHANGELOG,
      `Changelog too long (max ${MAX_CHANGELOG} entries)`);
    for (const entry of d._changeLog) {
      assert(typeof entry === 'object' && entry !== null, 'Changelog entry must be an object');
      assert(isNum(entry.t) && entry.t > 0 && entry.t < 4102444800,
        'Changelog entry timestamp must be a valid Unix timestamp');
    }
  }

  // --- sprintCadenceWeeks ---
  if (d.sprintCadenceWeeks !== undefined) {
    assert(isNum(d.sprintCadenceWeeks) && d.sprintCadenceWeeks > 0,
      'sprintCadenceWeeks must be a positive number');
    d.sprintCadenceWeeks = clamp(d.sprintCadenceWeeks, 1, 52);
  }

  // --- Strip unknown top-level fields ---
  for (const key of Object.keys(data)) {
    if (!KNOWN_PRODUCT_FIELDS.has(key)) {
      delete d[key];
    }
  }

  return d as Product;
}
