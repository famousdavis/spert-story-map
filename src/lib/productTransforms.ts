// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, RibItem, ColorKey, Size } from '../types';
import { appendChangeLogEntry } from './storage';
import { isRibLocked, computeRibSiblingName } from './ribHelpers';
import { DEFAULT_THEME_COLOR_KEYS } from './themeColors';
import { NOTES_MAX } from './constants';   // = 2000

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

/**
 * Pure transformation: append text to a rib's notes, preserving existing
 * content. Addresses ribs by ID alone (global search; no themeId/backboneId).
 *
 * Non-destructive counterpart to the `notes` field on update_rib /
 * bulk_update_ribs (which REPLACE). Append exists because the AI cannot
 * reliably read-modify-write a field it may not have read.
 *
 * Guards (all return prev ref-equal, never throw):
 *   APP-1  text empty/whitespace-only after trim -> prev.
 *   APP-2  rib not found (global search) -> prev, via didUpdate staying false.
 *   APP-3  the JOINED result would exceed NOTES_MAX (2000) -> that rib is
 *          SKIPPED, not truncated (D4). Boundary is INCLUSIVE: a result of
 *          exactly NOTES_MAX applies (guard is strict `>`). Note the join adds
 *          a 2-char "\n\n" separator when existing notes are non-empty, so the
 *          effective room for `addition` on a non-empty rib is
 *          NOTES_MAX - base.length - 2.
 *
 * No lock guard (D5). Separator (D3): existing notes have trailing whitespace
 * stripped, then joined with "\n\n"; empty/absent notes yield the trimmed text
 * alone.
 *
 * NOT IDEMPOTENT (D2): appending twice appends twice — deliberate, documented
 * in the LP tool descriptions. Drain replay duplicates the text (unless the
 * join would exceed NOTES_MAX, which skips that rib — so replay is only
 * PARTIALLY idempotent); accepted (visible + hand-correctable, unlike the
 * replace op's invisible re-assert).
 *
 * didUpdate is set ONLY on an actual append, NOT on ribId match — so a
 * not-found or over-cap call is fully ref-equal with no changelog entry
 * (avoids the update_rib/bulk_update_ribs wart of a spurious entry on match).
 *
 * @pure
 * @no-throw
 */
export function appendRibNoteInProduct(
  prev: Product,
  ribId: string,
  text: string,
): Product {
  const addition = text.trim();
  if (!addition) return prev;                                   // APP-1

  let didUpdate = false;
  const themes = prev.themes.map(t => ({
    ...t,
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      ribItems: b.ribItems.map(r => {
        if (r.id !== ribId) return r;               // sibling skip (not the APP-2 outcome)
        const base = (r.notes ?? '').replace(/\s+$/, '');
        const joined = base ? `${base}\n\n${addition}` : addition;
        if (joined.length > NOTES_MAX) return r;                // APP-3 (strict >)
        didUpdate = true;
        return { ...r, notes: joined };
      }),
    })),
  }));

  if (!didUpdate) return prev;                                  // APP-2 outcome
  const next = { ...prev, themes };
  return {
    ...next,
    _changeLog: appendChangeLogEntry(next, {
      op: 'update', entity: 'rib', id: ribId, source: 'ai',
    }),
  };
}

/**
 * Pure transformation: move a rib to a different backbone and/or reassign its
 * release allocation in one call. Addresses ribs by ID alone (global search;
 * no themeId/backboneId needed). The target-backbone search is intentionally
 * global ACROSS THEMES: a rib may move into a backbone belonging to a
 * different theme than its own.
 *
 * The backbone leg (BB-*) and release leg (REL-*) are validated and applied
 * INDEPENDENTLY: an invalid/skipped leg never blocks the other. If neither
 * leg changes state, returns prev unchanged (ref-equal, no changelog entry).
 *
 * Guards (all return prev ref-equal, never throw):
 *   CALL-1  neither targetBackboneId nor targetReleaseId provided → prev.
 *   CALL-2  rib not found anywhere (global search) → prev.
 *   BB-1    target backbone does not exist in any theme → backbone leg skipped.
 *   BB-2    rib already in the target backbone → backbone leg skipped (idempotent).
 *           (No lock guard on the backbone leg — backbone/theme membership
 *           feeds no point/progress math.)
 *   REL-1   targetReleaseId not provided → release leg inactive.
 *   REL-2   target release does not exist → release leg skipped.
 *   REL-3   rib is locked → release leg skipped (progress entries are
 *           release-keyed; reassignment is not math-safe).
 *   REL-4   current releaseAllocations are neither empty nor exactly one entry
 *           at exactly 100% (a split, or a single sub-100% allocation) →
 *           release leg skipped; protects hand-authored splits/partials from
 *           silent flattening.
 *   REL-5   sole 100% allocation already targets targetReleaseId → release leg
 *           skipped (idempotent).
 *   CALL-3  both requested legs skipped → prev.
 *
 * A currently-unassigned rib IS release-leg eligible — the leg doubles as
 * "allocate from unassigned". The replace intentionally drops any existing
 * allocation memo (matches allocateRibInProduct's write shape).
 *
 * Positioning is append-only: the moved rib lands at the end of the target
 * backbone with order = ribItems.length + 1; no renumbering elsewhere.
 *
 * Both legs strip the rib from releaseCardOrder via cleanCardOrder (mirrors
 * unassignRibInProduct — NOT allocateRibInProduct, which never touches it) so
 * the rib renders at the end of its new column. NOTE: this also demotes the
 * rib in its (unchanged) release's Release Planning column on a backbone-only
 * move — an accepted, documented cross-view trade-off (CLAUDE.md #57), not a
 * bug.
 *
 * @no-throw — safe for use in the drain path.
 */
export function moveRibInProduct(
  prev: Product,
  ribId: string,
  targets: { targetBackboneId?: string; targetReleaseId?: string },
): Product {
  const { targetBackboneId, targetReleaseId } = targets;
  if (!targetBackboneId && !targetReleaseId) return prev; // CALL-1

  // Global rib lookup.
  let foundThemeId: string | undefined;
  let foundBackboneId: string | undefined;
  let foundRib: RibItem | undefined;
  for (const t of prev.themes) {
    for (const b of t.backboneItems) {
      const r = b.ribItems.find(x => x.id === ribId);
      if (r) { foundThemeId = t.id; foundBackboneId = b.id; foundRib = r; break; }
    }
    if (foundRib) break;
  }
  if (!foundRib || !foundThemeId || !foundBackboneId) return prev; // CALL-2
  // Consts for closure capture (let-narrowing does not survive callbacks).
  const movedRib = foundRib;
  const sourceThemeId = foundThemeId;
  const sourceBackboneId = foundBackboneId;

  // ── Backbone leg: BB-1, BB-2. Search is global across ALL themes. ──
  let targetBackboneThemeId: string | undefined;
  let backboneChanged = false;
  if (targetBackboneId && targetBackboneId !== sourceBackboneId) {
    for (const t of prev.themes) {
      if (t.backboneItems.some(b => b.id === targetBackboneId)) {
        targetBackboneThemeId = t.id; // may differ from sourceThemeId — intentional
        break;
      }
    }
    backboneChanged = targetBackboneThemeId !== undefined; // undefined ⇒ BB-1
  }
  // targetBackboneId === sourceBackboneId falls through with backboneChanged=false ⇒ BB-2

  // ── Release leg: REL-1 .. REL-5 ──
  const allocations = movedRib.releaseAllocations ?? [];
  const sole = allocations.length === 1 ? allocations[0] : undefined;
  const releaseEligible =
    allocations.length === 0 || (sole !== undefined && sole.percentage === 100); // REL-4
  const alreadyAtTarget =
    sole !== undefined && sole.percentage === 100 && sole.releaseId === targetReleaseId; // REL-5
  const targetReleaseExists =
    !!targetReleaseId && prev.releases.some(r => r.id === targetReleaseId); // REL-2
  const releaseChanged =
    targetReleaseExists && !isRibLocked(movedRib) &&       // REL-3
    releaseEligible && !alreadyAtTarget;
  // targetReleaseId undefined ⇒ targetReleaseExists false ⇒ REL-1 (leg inactive)

  if (!backboneChanged && !releaseChanged) return prev; // CALL-3

  // ── Apply ──
  let themes = prev.themes;
  let releaseCardOrder = prev.releaseCardOrder;
  if (backboneChanged && targetBackboneThemeId !== undefined) {
    // Remove from the source backbone…
    themes = themes.map(t =>
      t.id !== sourceThemeId ? t : {
        ...t,
        backboneItems: t.backboneItems.map(b =>
          b.id !== sourceBackboneId ? b : { ...b, ribItems: b.ribItems.filter(r => r.id !== ribId) }
        ),
      }
    );
    // …then append to the target backbone (order = new length + 1, append-only).
    // Two sequential maps so a same-theme move sees the already-filtered source.
    themes = themes.map(t =>
      t.id !== targetBackboneThemeId ? t : {
        ...t,
        backboneItems: t.backboneItems.map(b =>
          b.id !== targetBackboneId ? b : {
            ...b,
            ribItems: [...b.ribItems, { ...movedRib, order: b.ribItems.length + 1 }],
          }
        ),
      }
    );
    releaseCardOrder = cleanCardOrder(releaseCardOrder, new Set([ribId]));
  }
  if (releaseChanged && targetReleaseId !== undefined) {
    themes = themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r =>
          r.id !== ribId ? r : { ...r, releaseAllocations: [{ releaseId: targetReleaseId, percentage: 100 }] }
        ),
      })),
    }));
    releaseCardOrder = cleanCardOrder(releaseCardOrder, new Set([ribId]));
  }

  const next = { ...prev, themes, releaseCardOrder };
  return {
    ...next,
    _changeLog: appendChangeLogEntry(next, {
      op: 'update', entity: 'rib', id: ribId, source: 'ai',
    }),
  };
}
