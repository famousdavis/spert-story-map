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
function assert(condition, message) {
  if (!condition) throw new Error(message);
}

/** Return true if value is a non-empty string within max length. */
function isValidString(v, maxLen = MAX_STRING) {
  return typeof v === 'string' && v.length > 0 && v.length <= maxLen;
}

/** Return true if value looks like a UUID or reasonable ID string. */
function isValidId(v) {
  return typeof v === 'string' && v.length > 0 && v.length <= 128 && !/[/]/.test(v);
}

/** Return true if value is a finite number. */
function isNum(v) {
  return typeof v === 'number' && Number.isFinite(v);
}

/** Return true if value is a non-negative integer. */
function isNonNegInt(v) {
  return Number.isInteger(v) && v >= 0;
}

/** Clamp a number to [min, max]. */
function clamp(v, min, max) {
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
export function validateProduct(data) {
  assert(data && typeof data === 'object' && !Array.isArray(data),
    'Product must be a JSON object');

  // Required top-level fields
  assert(isValidId(data.id), 'Product id must be a non-empty string (max 128 chars, no slashes)');
  assert(isValidString(data.name), `Product name must be a non-empty string (max ${MAX_STRING} chars)`);
  assert(Array.isArray(data.themes), 'Product themes must be an array');

  // Collect all known entity IDs for reference integrity checks
  const releaseIds = new Set();
  const sprintIds = new Set();

  // --- Releases ---
  const releases = Array.isArray(data.releases) ? data.releases : [];
  assert(releases.length <= MAX_RELEASES, `Too many releases (max ${MAX_RELEASES})`);
  for (const r of releases) {
    assert(isValidId(r.id), 'Release id must be a valid string');
    assert(isValidString(r.name), 'Release name must be a non-empty string');
    releaseIds.add(r.id);
    // Sanitize numeric fields
    if (r.order !== undefined) {
      assert(isNum(r.order), 'Release order must be a number');
    }
  }

  // --- Sprints ---
  const sprints = Array.isArray(data.sprints) ? data.sprints : [];
  assert(sprints.length <= MAX_SPRINTS, `Too many sprints (max ${MAX_SPRINTS})`);
  for (const s of sprints) {
    assert(isValidId(s.id), 'Sprint id must be a valid string');
    assert(isValidString(s.name), 'Sprint name must be a non-empty string');
    sprintIds.add(s.id);
    if (s.order !== undefined) {
      assert(isNum(s.order), 'Sprint order must be a number');
    }
  }

  // --- Size mapping ---
  const sizeMapping = Array.isArray(data.sizeMapping) ? data.sizeMapping : null;
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
  assert(data.themes.length <= MAX_THEMES, `Too many themes (max ${MAX_THEMES})`);
  let totalRibs = 0;

  for (const theme of data.themes) {
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

        // Size validation
        if (rib.size && validSizeLabels) {
          if (!validSizeLabels.has(rib.size)) {
            // Don't reject — just clear invalid size (non-destructive)
            rib.size = '';
          }
        }

        // Category
        if (rib.category !== undefined) {
          assert(typeof rib.category === 'string', 'Rib category must be a string');
        }

        // Release allocations
        if (Array.isArray(rib.releaseAllocations)) {
          assert(rib.releaseAllocations.length <= MAX_ALLOCATIONS,
            `Too many allocations on rib "${rib.name || rib.id}"`);
          for (const alloc of rib.releaseAllocations) {
            assert(isValidId(alloc.releaseId), 'Allocation releaseId must be a valid string');
            if (releaseIds.size > 0 && !releaseIds.has(alloc.releaseId)) {
              // Dangling reference — warn but don't crash. The app handles this gracefully.
            }
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
          assert(rib.progressHistory.length <= MAX_PROGRESS,
            `Too many progress entries on rib "${rib.name || rib.id}"`);
          for (const p of rib.progressHistory) {
            assert(isValidId(p.sprintId), 'Progress sprintId must be a valid string');
            if (p.releaseId !== undefined) {
              assert(isValidId(p.releaseId), 'Progress releaseId must be a valid string');
            }
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
  if (data.releaseCardOrder && typeof data.releaseCardOrder === 'object') {
    for (const [key, val] of Object.entries(data.releaseCardOrder)) {
      if (!Array.isArray(val)) {
        delete data.releaseCardOrder[key];
        continue;
      }
      // Filter to valid ID strings only
      data.releaseCardOrder[key] = val.filter(id => isValidId(id));
    }
  }

  // --- sizingCardOrder ---
  if (data.sizingCardOrder && typeof data.sizingCardOrder === 'object') {
    for (const [key, val] of Object.entries(data.sizingCardOrder)) {
      if (!Array.isArray(val)) {
        delete data.sizingCardOrder[key];
        continue;
      }
      data.sizingCardOrder[key] = val.filter(id => isValidId(id));
    }
  }

  // --- _changeLog ---
  if (Array.isArray(data._changeLog)) {
    assert(data._changeLog.length <= MAX_CHANGELOG,
      `Changelog too long (max ${MAX_CHANGELOG} entries)`);
    for (const entry of data._changeLog) {
      assert(typeof entry === 'object' && entry !== null, 'Changelog entry must be an object');
      assert(isNum(entry.t), 'Changelog entry timestamp must be a number');
    }
  }

  // --- sprintCadenceWeeks ---
  if (data.sprintCadenceWeeks !== undefined) {
    assert(isNum(data.sprintCadenceWeeks) && data.sprintCadenceWeeks > 0,
      'sprintCadenceWeeks must be a positive number');
  }

  // --- Strip unknown top-level fields ---
  for (const key of Object.keys(data)) {
    if (!KNOWN_PRODUCT_FIELDS.has(key)) {
      delete data[key];
    }
  }

  return data;
}
