// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, RibItem, ColorKey, Size } from '../types';
import { appendChangeLogEntry } from './storage';
import { isRibLocked, computeRibSiblingName } from './ribHelpers';
import { DEFAULT_THEME_COLOR_KEYS } from './themeColors';

/**
 * Pure Product transformations shared by the React mutation hook
 * (useProductMutations) and the AI op applier (aiOps). Every function is a
 * pure (prev: Product) => Product transform with no side effects, so they are
 * directly unit-testable and safe in the AI drain path.
 */

/** Remove deleted rib IDs from releaseCardOrder. */
export function cleanCardOrder(cardOrder: Record<string, string[]> | undefined, ribIds: Set<string>) {
  if (!cardOrder || ribIds.size === 0) return cardOrder;
  const cleaned: Record<string, string[]> = {};
  for (const [col, ids] of Object.entries(cardOrder)) {
    cleaned[col] = ids.filter(id => !ribIds.has(id));
  }
  return cleaned;
}

/**
 * Pure transformation: append a fully-named rib to a backbone in a single update.
 * Used by both the React hook and the unit tests.
 *
 * Distinct from `addRib` (which creates a placeholder named "New Rib Item" and
 * relies on a follow-up `updateRib` to set the name): `addNamedRib` is atomic —
 * one product mutation, one changelog entry, no placeholder flash.
 */
export function addNamedRibToProduct(
  prev: Product,
  themeId: string,
  backboneId: string,
  newId: string,
  attrs: { name: string; category?: 'core' | 'non-core'; size?: RibItem['size']; description?: string; notes?: string; cardColor?: RibItem['cardColor'] },
): Product {
  let didAdd = false;

  const themes = prev.themes.map(t => {
    if (t.id !== themeId) return t;
    return {
      ...t,
      backboneItems: t.backboneItems.map(b => {
        if (b.id !== backboneId) return b;
        if (b.ribItems.some(r => r.id === newId)) return b; // idempotency: no-op if rib already exists
        const newRib: RibItem = {
          id: newId,
          name: attrs.name,
          description: attrs.description ?? '',
          order: b.ribItems.length + 1,
          size: attrs.size ?? null,
          category: attrs.category ?? 'core',
          releaseAllocations: [],
          progressHistory: [],
          notes: attrs.notes ?? '',
          // Only set cardColor when provided, so a colorless rib stays free of the key
          // (mirrors cloneRibInProduct).
          ...(attrs.cardColor !== undefined ? { cardColor: attrs.cardColor } : {}),
        };
        didAdd = true;
        return { ...b, ribItems: [...b.ribItems, newRib] };
      }),
    };
  });

  if (!didAdd) return prev;

  const next = { ...prev, themes };
  return {
    ...next,
    _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'rib', id: newId }),
  };
}

/**
 * Pure transformation: split a rib in place. Used by both the React hook
 * (which wraps it in updateProduct) and the unit tests.
 *
 * The "(N)" trailing-suffix naming contract is computed by computeRibSiblingName
 * (ribHelpers.ts): names already ending in "(N)" preserve their name and the new
 * sibling becomes "(N+1)"; names with no numeric suffix get renamed to "(1)" with
 * a sibling "(2)".
 *
 * The new rib is inserted into the parent backbone immediately after the original
 * and into sizingCardOrder['unsized'] adjacent to the original (bootstrapping the
 * unsized order array if needed).
 *
 * `source` on the changelog entry holds the originating rib's ID, consistent with
 * how `'duplicate'` uses it for the originating product's ID at storage.ts:305.
 */
export function splitRibInProduct(
  prev: Product,
  themeId: string,
  backboneId: string,
  ribId: string,
  newId: string,
): Product {
  let didSplit = false;

  const themes = prev.themes.map(t => {
    if (t.id !== themeId) return t;
    return {
      ...t,
      backboneItems: t.backboneItems.map(b => {
        if (b.id !== backboneId) return b;
        const idx = b.ribItems.findIndex(r => r.id === ribId);
        if (idx < 0) return b;
        const original = b.ribItems[idx];

        const { originalName, newName } = computeRibSiblingName(b.ribItems, original.name, false);

        const renamedOriginal = original.name === originalName
          ? original
          : { ...original, name: originalName };

        const newRib: RibItem = {
          id: newId,
          name: newName,
          description: '',
          order: b.ribItems.length + 1,
          size: null,
          category: original.category,
          releaseAllocations: [],
          progressHistory: [],
          notes: '',
        };

        didSplit = true;
        return {
          ...b,
          ribItems: [
            ...b.ribItems.slice(0, idx),
            renamedOriginal,
            newRib,
            ...b.ribItems.slice(idx + 1),
          ],
        };
      }),
    };
  });

  if (!didSplit) return prev;

  const cardOrder = { ...(prev.sizingCardOrder || {}) };
  const existingUnsized = cardOrder['unsized'] ? [...cardOrder['unsized']] : [];
  let originalIdx = existingUnsized.indexOf(ribId);
  if (originalIdx < 0) {
    existingUnsized.push(ribId);
    originalIdx = existingUnsized.length - 1;
  }
  existingUnsized.splice(originalIdx + 1, 0, newId);
  cardOrder['unsized'] = existingUnsized;

  const next = { ...prev, themes, sizingCardOrder: cardOrder };
  return {
    ...next,
    _changeLog: appendChangeLogEntry(next, { op: 'split', entity: 'rib', id: newId, source: ribId }),
  };
}

/**
 * Pure transformation: clone a rib in place, copying all fields except id, name,
 * order, and progressHistory. Used by both the React hook and the unit tests.
 *
 * Naming: computeRibSiblingName with keepOriginal=true — the original is NEVER
 * renamed, and the new name = `${prefix} (max(existing N) + 1)`. Cloning
 * unsuffixed "Foo" twice produces "Foo (1)" then "Foo (2)" — no collision.
 *
 * The new rib is inserted into the parent backbone immediately after the original.
 * For each release in the original's releaseAllocations, releaseCardOrder[releaseId]
 * is updated to splice newId immediately after ribId (or append if missing).
 * sizingCardOrder is similarly updated under the original's size bucket
 * (or 'unsized' when size is null).
 *
 * `source` on the changelog entry holds the originating rib's ID. We reuse the
 * existing 'duplicate' op (already used at storage.ts:305 for product-level
 * duplication) rather than adding a new 'clone' op to the ChangeLogOp union.
 */
export function cloneRibInProduct(
  prev: Product,
  themeId: string,
  backboneId: string,
  ribId: string,
  newId: string,
): Product {
  let didClone = false;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- captured for cardOrder updates outside the themes map
  let clonedOriginal: any = null;

  const themes = prev.themes.map(t => {
    if (t.id !== themeId) return t;
    return {
      ...t,
      backboneItems: t.backboneItems.map(b => {
        if (b.id !== backboneId) return b;
        const idx = b.ribItems.findIndex(r => r.id === ribId);
        if (idx < 0) return b;
        const original = b.ribItems[idx];

        const { newName } = computeRibSiblingName(b.ribItems, original.name, true);

        const clone: RibItem = {
          id: newId,
          name: newName,
          description: original.description,
          order: b.ribItems.length + 1,
          size: original.size,
          category: original.category,
          releaseAllocations: original.releaseAllocations.map(a => ({ ...a })),
          progressHistory: [],
          notes: original.notes ?? '',
          ...(original.cardColor !== undefined ? { cardColor: original.cardColor } : {}),
        };

        didClone = true;
        clonedOriginal = original;
        return {
          ...b,
          ribItems: [
            ...b.ribItems.slice(0, idx + 1),
            clone,
            ...b.ribItems.slice(idx + 1),
          ],
        };
      }),
    };
  });

  if (!didClone) return prev;

  // releaseCardOrder: splice newId after ribId in every release the original is in.
  const nextReleaseCardOrder: Record<string, string[]> = { ...(prev.releaseCardOrder || {}) };
  for (const alloc of clonedOriginal.releaseAllocations) {
    const bucket = nextReleaseCardOrder[alloc.releaseId] ? [...nextReleaseCardOrder[alloc.releaseId]] : [];
    const pos = bucket.indexOf(ribId);
    if (pos >= 0) bucket.splice(pos + 1, 0, newId);
    else bucket.push(newId);
    nextReleaseCardOrder[alloc.releaseId] = bucket;
  }

  // sizingCardOrder: splice newId after ribId in the original's size bucket.
  const sizingKey: string = clonedOriginal.size ?? 'unsized';
  const nextSizingCardOrder: Record<string, string[]> = { ...(prev.sizingCardOrder || {}) };
  const sizingBucket = nextSizingCardOrder[sizingKey] ? [...nextSizingCardOrder[sizingKey]] : [];
  let sizingPos = sizingBucket.indexOf(ribId);
  if (sizingPos < 0) {
    sizingBucket.push(ribId);
    sizingPos = sizingBucket.length - 1;
  }
  sizingBucket.splice(sizingPos + 1, 0, newId);
  nextSizingCardOrder[sizingKey] = sizingBucket;

  const next = {
    ...prev,
    themes,
    releaseCardOrder: nextReleaseCardOrder,
    sizingCardOrder: nextSizingCardOrder,
  };
  return {
    ...next,
    _changeLog: appendChangeLogEntry(next, { op: 'duplicate', entity: 'rib', id: newId, source: ribId }),
  };
}

/** Pure, idempotent: no-op if a theme with this ID already exists. */
export function addNamedThemeToProduct(
  prev: Product,
  newId: string,
  attrs: { name: string; color?: ColorKey },
): Product {
  if (prev.themes.some(t => t.id === newId)) return prev;
  const next = {
    ...prev,
    themes: [...prev.themes, {
      id: newId,
      name: attrs.name,
      order: prev.themes.length + 1,
      // noUncheckedIndexedAccess makes the index access ColorKey | undefined,
      // which is assignable to the optional color field (mirrors addTheme).
      color: attrs.color ?? DEFAULT_THEME_COLOR_KEYS[prev.themes.length % DEFAULT_THEME_COLOR_KEYS.length],
      backboneItems: [],
    }],
  };
  return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'theme', id: newId }) };
}

/** Pure, idempotent: no-op if a backbone with this ID already exists in the theme. */
export function addNamedBackboneToProduct(
  prev: Product,
  themeId: string,
  newId: string,
  attrs: { name: string; description?: string },
): Product {
  const theme = prev.themes.find(t => t.id === themeId);
  if (!theme) return prev;
  if (theme.backboneItems.some(b => b.id === newId)) return prev;
  const next = {
    ...prev,
    themes: prev.themes.map(t =>
      t.id !== themeId ? t : {
        ...t,
        backboneItems: [...t.backboneItems, {
          id: newId, name: attrs.name, description: attrs.description ?? '',
          order: t.backboneItems.length + 1, ribItems: [],
        }],
      }
    ),
  };
  return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'backbone', id: newId }) };
}

/**
 * Pure transformation: append a named release with a pre-minted ID.
 * No-op if a release with this ID already exists (idempotent).
 *
 * order = prev.releases.length + 1 (append-at-end; AI cannot position releases).
 * description is set to '' (consistent with addRelease).
 * targetDate is intentionally omitted (AI must not set dates).
 * No source:'ai' on the changelog entry — matches create_theme/backbone/rib pattern.
 *
 * @no-throw — safe for use in the drain path.
 */
export function addNamedReleaseToProduct(
  prev: Product,
  newId: string,
  attrs: { name: string },
): Product {
  if (prev.releases.some(r => r.id === newId)) return prev;
  const next = {
    ...prev,
    releases: [
      ...prev.releases,
      {
        id: newId,
        name: attrs.name,
        description: '',
        order: prev.releases.length + 1,
        // targetDate intentionally omitted
      },
    ],
  };
  return {
    ...next,
    _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'release', id: newId }),
  };
}

/**
 * Pure transformation: allocate a rib 100% to a release.
 * Addresses ribs by ID alone (global search; no themeId/backboneId needed).
 *
 * Guards (all return prev ref-equal, never throw):
 *   1. Release does not exist → prev (prevents orphan allocations).
 *   2. Rib not found → prev.
 *   3. Rib is locked → prev.
 *   4. Rib has any existing allocation → prev (additive; protects user splits).
 *
 * Does NOT update releaseCardOrder (matches updateRibAllocation / addRibToRelease precedent).
 *
 * @no-throw — safe for use in the drain path.
 */
export function allocateRibInProduct(
  prev: Product,
  ribId: string,
  releaseId: string,
): Product {
  // Guard 1: release must exist — prevents orphan allocations
  if (!prev.releases.some(r => r.id === releaseId)) return prev;

  let didUpdate = false;
  const themes = prev.themes.map(t => ({
    ...t,
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      ribItems: b.ribItems.map(r => {
        if (r.id !== ribId) return r;
        if (isRibLocked(r)) return r;                          // Guard 3
        if ((r.releaseAllocations ?? []).length > 0) return r; // Guard 4
        didUpdate = true;
        return { ...r, releaseAllocations: [{ releaseId, percentage: 100 }] };
      }),
    })),
  }));

  if (!didUpdate) return prev;
  const next = { ...prev, themes };
  return {
    ...next,
    _changeLog: appendChangeLogEntry(next, {
      op: 'update', entity: 'rib', id: ribId, source: 'ai',
    }),
  };
}

/**
 * Pure transformation: remove all release allocations from a rib.
 * Addresses ribs by ID alone (global search; no themeId/backboneId needed).
 *
 * Guards (all return prev ref-equal, never throw):
 *   1. Rib not found → prev.
 *   2. Rib is locked → prev.
 *   3. Rib already unassigned (releaseAllocations.length === 0) → prev (idempotent).
 *
 * On actual mutation:
 *   - Sets releaseAllocations to [].
 *   - Calls cleanCardOrder to strip ribId from all releaseCardOrder buckets (hygiene).
 *   - Does NOT touch progressHistory.
 *
 * @no-throw — safe for use in the drain path.
 */
export function unassignRibInProduct(
  prev: Product,
  ribId: string,
): Product {
  let didUpdate = false;
  const themes = prev.themes.map(t => ({
    ...t,
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      ribItems: b.ribItems.map(r => {
        if (r.id !== ribId) return r;
        if (isRibLocked(r)) return r;                           // Guard 2
        if ((r.releaseAllocations ?? []).length === 0) return r; // Guard 3
        didUpdate = true;
        return { ...r, releaseAllocations: [] };
      }),
    })),
  }));

  if (!didUpdate) return prev;
  const next = {
    ...prev,
    themes,
    releaseCardOrder: cleanCardOrder(prev.releaseCardOrder, new Set([ribId])),
  };
  return {
    ...next,
    _changeLog: appendChangeLogEntry(next, {
      op: 'update', entity: 'rib', id: ribId, source: 'ai',
    }),
  };
}

/**
 * Pure transformation: assign a t-shirt size to an unsized rib.
 * Addresses ribs by ID alone (global search; no themeId/backboneId needed).
 *
 * Guards (all return prev ref-equal, never throw):
 *   1. size not in product.sizeMapping → prev (rejects unknown labels; prevents orphan sizes).
 *      Pre-walk check; uses ?? [] so an absent sizeMapping stays no-throw.
 *   2. Rib not found → prev (via didUpdate flag).
 *   3. Rib is locked → prev (mirrors the Sizing UI lock, CLAUDE.md #26).
 *   4. Rib already has a valid size → prev (additive; never overwrites).
 *      Form B: r.size && labelSet.has(r.size). Matches useSizingLayout.ts:118's definition
 *      of "unsized" (falsy OR not-in-mapping). Handles both null and the empty-string value
 *      validateProduct.ts:225 writes for orphan sizes on import.
 *
 * Does NOT update sizingCardOrder (matches allocateRibInProduct / addRibToRelease precedent).
 * AI-sized ribs render at the end of their size column via the sort-position Infinity fallback.
 *
 * @no-throw — safe for use in the drain path (two-call coupling, aiOps.ts:209–231).
 */
export function sizeRibInProduct(
  prev: Product,
  ribId: string,
  size: string,
): Product {
  // Guard 1: size must be a valid label in this product's mapping.
  // Built pre-walk and reused for Guard 4 inside the walk.
  const labelSet = new Set((prev.sizeMapping ?? []).map(m => m.label));
  if (!labelSet.has(size)) return prev;

  let didUpdate = false;
  const themes = prev.themes.map(t => ({
    ...t,
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      ribItems: b.ribItems.map(r => {
        if (r.id !== ribId) return r;
        if (isRibLocked(r)) return r;                        // Guard 3
        if (r.size && labelSet.has(r.size)) return r;        // Guard 4: Form B
        didUpdate = true;
        return { ...r, size: size as Size };
      }),
    })),
  }));

  if (!didUpdate) return prev;
  const next = { ...prev, themes };
  return {
    ...next,
    _changeLog: appendChangeLogEntry(next, {
      op: 'update', entity: 'rib', id: ribId, source: 'ai',
    }),
  };
}
