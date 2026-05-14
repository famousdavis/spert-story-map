// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { useCallback } from 'react';
import type { Product, Theme, Backbone, RibItem } from '../types';
import { calculateNextSprintEndDate } from '../lib/progressMutations';
import { DEFAULT_THEME_COLOR_KEYS } from '../lib/themeColors';
import { appendChangeLogEntry } from '../lib/storage';

type UpdateProduct = (updater: (prev: Product) => Product) => void;

/** Remove deleted rib IDs from releaseCardOrder. */
function cleanCardOrder(cardOrder: Record<string, string[]> | undefined, ribIds: Set<string>) {
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
  attrs: { name: string; category?: 'core' | 'non-core'; size?: RibItem['size']; description?: string; notes?: string },
): Product {
  let didAdd = false;

  const themes = prev.themes.map(t => {
    if (t.id !== themeId) return t;
    return {
      ...t,
      backboneItems: t.backboneItems.map(b => {
        if (b.id !== backboneId) return b;
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
 * Suffix detection uses /^(.*?)\s*\((\d+)\)\s*$/ — names already ending in
 * "(N)" preserve their name and the new sibling becomes "(N+1)". Names with
 * no numeric suffix get renamed to "(1)" with a sibling "(2)".
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

        const trailingSuffix = /^(.*?)\s*\((\d+)\)\s*$/;
        const match = original.name.match(trailingSuffix);
        const prefix = match ? match[1] : original.name;

        // Find the highest existing (N) suffix in this backbone for the same prefix.
        // This prevents collisions when splitting an earlier-numbered sibling
        // (e.g., splitting "Foo (1)" while "Foo (2)" already exists must produce "Foo (3)",
        // not a duplicate "Foo (2)").
        const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const siblingPattern = new RegExp(`^${escapedPrefix}\\s*\\((\\d+)\\)\\s*$`);
        const siblingNumbers = b.ribItems
          .map(r => {
            const m = r.name.match(siblingPattern);
            return m ? parseInt(m[1], 10) : null;
          })
          .filter((n): n is number => n !== null);
        const maxExisting = siblingNumbers.length > 0 ? Math.max(...siblingNumbers) : 0;

        let originalName: string;
        let newName: string;
        if (match) {
          originalName = original.name; // already suffixed: keep original name
          newName = `${prefix} (${maxExisting + 1})`;
        } else {
          // Unsuffixed original: assign next two available numbers in the prefix family.
          originalName = `${prefix} (${maxExisting + 1})`;
          newName = `${prefix} (${maxExisting + 2})`;
        }

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
 * Naming: sibling-scan with the same regex/prefix pattern as splitRibInProduct,
 * but the original is NEVER renamed. New name = `${prefix} (max(existing N) + 1)`
 * where existing N's are the trailing-suffix numbers of siblings sharing the
 * same prefix. Cloning unsuffixed "Foo" twice produces "Foo (1)" then "Foo (2)"
 * — no collision.
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

        const trailingSuffix = /^(.*?)\s*\((\d+)\)\s*$/;
        const match = original.name.match(trailingSuffix);
        const prefix = match ? match[1] : original.name;

        const escapedPrefix = prefix.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const siblingPattern = new RegExp(`^${escapedPrefix}\\s*\\((\\d+)\\)\\s*$`);
        const siblingNumbers = b.ribItems
          .map(r => {
            const m = r.name.match(siblingPattern);
            return m ? parseInt(m[1], 10) : null;
          })
          .filter((n): n is number => n !== null);
        const maxExisting = siblingNumbers.length > 0 ? Math.max(...siblingNumbers) : 0;
        const newName = `${prefix} (${maxExisting + 1})`;

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

/**
 * Provides reusable CRUD operations for the product's theme/backbone/rib hierarchy.
 * Keeps mutation logic DRY between StructureView, SettingsView, and anywhere else
 * that needs to modify the product tree.
 */
export function useProductMutations(updateProduct: UpdateProduct) {
  const updateTheme = useCallback((themeId: string, updater: ((prev: Theme) => Theme) | Partial<Theme>) => {
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t =>
        t.id === themeId ? (typeof updater === 'function' ? updater(t) : { ...t, ...updater }) : t
      ),
    }));
  }, [updateProduct]);

  const updateBackbone = useCallback((themeId: string, backboneId: string, updater: ((prev: Backbone) => Backbone) | Partial<Backbone>) => {
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t =>
        t.id === themeId
          ? {
            ...t,
            backboneItems: t.backboneItems.map(b =>
              b.id === backboneId ? (typeof updater === 'function' ? updater(b) : { ...b, ...updater }) : b
            ),
          }
          : t
      ),
    }));
  }, [updateProduct]);

  const updateRib = useCallback((themeId: string, backboneId: string, ribId: string, updater: ((prev: RibItem) => RibItem) | Partial<RibItem>) => {
    updateProduct(prev => ({
      ...prev,
      themes: prev.themes.map(t =>
        t.id === themeId
          ? {
            ...t,
            backboneItems: t.backboneItems.map(b =>
              b.id === backboneId
                ? { ...b, ribItems: b.ribItems.map(r => r.id === ribId ? (typeof updater === 'function' ? updater(r) : { ...r, ...updater }) : r) }
                : b
            ),
          }
          : t
      ),
    }));
  }, [updateProduct]);

  const addTheme = useCallback(() => {
    updateProduct(prev => {
      const id = crypto.randomUUID();
      const next = {
        ...prev,
        themes: [...prev.themes, {
          id,
          name: 'New Theme',
          order: prev.themes.length + 1,
          color: DEFAULT_THEME_COLOR_KEYS[prev.themes.length % DEFAULT_THEME_COLOR_KEYS.length],
          backboneItems: [],
        }],
      };
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'theme', id }) };
    });
  }, [updateProduct]);

  const addBackbone = useCallback((themeId: string) => {
    updateProduct(prev => {
      const id = crypto.randomUUID();
      const next = {
        ...prev,
        themes: prev.themes.map(t =>
          t.id === themeId
            ? { ...t, backboneItems: [...t.backboneItems, { id, name: 'New Backbone Item', description: '', order: t.backboneItems.length + 1, ribItems: [] }] }
            : t
        ),
      };
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'backbone', id }) };
    });
  }, [updateProduct]);

  const addRib = useCallback((themeId: string, backboneId: string) => {
    const id = crypto.randomUUID();
    updateProduct(prev => {
      const next = {
        ...prev,
        themes: prev.themes.map(t =>
          t.id === themeId
            ? {
              ...t,
              backboneItems: t.backboneItems.map(b =>
                b.id === backboneId
                  ? { ...b, ribItems: [...b.ribItems, { id, name: 'New Rib Item', description: '', order: b.ribItems.length + 1, size: null, category: 'core', releaseAllocations: [], progressHistory: [] }] }
                  : b
              ),
            }
            : t
        ),
      };
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'rib', id }) };
    });
    return id;
  }, [updateProduct]);

  const addRibToRelease = useCallback((themeId: string, backboneId: string, releaseId: string) => {
    const id = crypto.randomUUID();
    updateProduct(prev => {
      const next = {
        ...prev,
        themes: prev.themes.map(t =>
          t.id === themeId
            ? {
              ...t,
              backboneItems: t.backboneItems.map(b =>
                b.id === backboneId
                  ? { ...b, ribItems: [...b.ribItems, { id, name: 'New Rib Item', description: '', order: b.ribItems.length + 1, size: null, category: 'core', releaseAllocations: [{ releaseId, percentage: 100 }], progressHistory: [] }] }
                  : b
              ),
            }
            : t
        ),
      };
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'rib', id }) };
    });
    return id;
  }, [updateProduct]);

  const addRelease = useCallback(() => {
    updateProduct(prev => {
      const id = crypto.randomUUID();
      const next = {
        ...prev,
        releases: [...prev.releases, {
          id,
          name: `Release ${prev.releases.length + 1}`,
          order: prev.releases.length + 1,
          description: '',
          targetDate: null,
        }],
      };
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'release', id }) };
    });
  }, [updateProduct]);

  /** Insert a new release after `afterReleaseId`. If null, appends at end. */
  const addReleaseAfter = useCallback((afterReleaseId: string | null) => {
    updateProduct(prev => {
      const sorted = [...prev.releases].sort((a, b) => a.order - b.order);
      const afterIdx = afterReleaseId
        ? sorted.findIndex(r => r.id === afterReleaseId)
        : -1;
      const insertIdx = afterIdx >= 0 ? afterIdx + 1 : sorted.length;
      const id = crypto.randomUUID();
      const newRelease = {
        id,
        name: `Release ${prev.releases.length + 1}`,
        order: 0,
        description: '',
        targetDate: null,
      };
      sorted.splice(insertIdx, 0, newRelease);
      const next = {
        ...prev,
        releases: sorted.map((r, i) => ({ ...r, order: i + 1 })),
      };
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'release', id }) };
    });
  }, [updateProduct]);

  const addSprint = useCallback((onCreated?: (id: string) => void) => {
    const id = crypto.randomUUID();
    updateProduct(prev => {
      const cadenceWeeks = prev.sprintCadenceWeeks || 2;
      const last = prev.sprints.length > 0 ? prev.sprints[prev.sprints.length - 1] : null;
      const next = {
        ...prev,
        sprints: [...prev.sprints, {
          id,
          name: `Sprint ${prev.sprints.length + 1}`,
          order: prev.sprints.length + 1,
          endDate: calculateNextSprintEndDate(last?.endDate, cadenceWeeks),
        }],
      };
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'add', entity: 'sprint', id }) };
    });
    if (onCreated) onCreated(id);
    return id;
  }, [updateProduct]);

  const deleteTheme = useCallback((themeId: string) => {
    updateProduct(prev => {
      const ribIds = new Set();
      const theme = prev.themes.find(t => t.id === themeId);
      if (theme) theme.backboneItems.forEach(b => b.ribItems.forEach(r => ribIds.add(r.id)));
      const next = {
        ...prev,
        themes: prev.themes.filter(t => t.id !== themeId),
        releaseCardOrder: cleanCardOrder(prev.releaseCardOrder, ribIds),
        sizingCardOrder: cleanCardOrder(prev.sizingCardOrder, ribIds),
      };
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'delete', entity: 'theme', id: themeId }) };
    });
  }, [updateProduct]);

  const deleteBackbone = useCallback((themeId: string, backboneId: string) => {
    updateProduct(prev => {
      const ribIds = new Set();
      const theme = prev.themes.find(t => t.id === themeId);
      const bb = theme?.backboneItems.find(b => b.id === backboneId);
      if (bb) bb.ribItems.forEach(r => ribIds.add(r.id));
      const next = {
        ...prev,
        themes: prev.themes.map(t =>
          t.id === themeId ? { ...t, backboneItems: t.backboneItems.filter(b => b.id !== backboneId) } : t
        ),
        releaseCardOrder: cleanCardOrder(prev.releaseCardOrder, ribIds),
        sizingCardOrder: cleanCardOrder(prev.sizingCardOrder, ribIds),
      };
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'delete', entity: 'backbone', id: backboneId }) };
    });
  }, [updateProduct]);

  const deleteRib = useCallback((themeId: string, backboneId: string, ribId: string) => {
    updateProduct(prev => {
      const next = {
        ...prev,
        themes: prev.themes.map(t =>
          t.id === themeId
            ? { ...t, backboneItems: t.backboneItems.map(b =>
                b.id === backboneId ? { ...b, ribItems: b.ribItems.filter(r => r.id !== ribId) } : b
              )}
            : t
        ),
        releaseCardOrder: cleanCardOrder(prev.releaseCardOrder, new Set([ribId])),
        sizingCardOrder: cleanCardOrder(prev.sizingCardOrder, new Set([ribId])),
      };
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'delete', entity: 'rib', id: ribId }) };
    });
  }, [updateProduct]);

  const splitRib = useCallback((themeId: string, backboneId: string, ribId: string) => {
    const newId = crypto.randomUUID();
    updateProduct(prev => splitRibInProduct(prev, themeId, backboneId, ribId, newId));
    return newId;
  }, [updateProduct]);

  const cloneRib = useCallback((themeId: string, backboneId: string, ribId: string) => {
    const newId = crypto.randomUUID();
    updateProduct(prev => cloneRibInProduct(prev, themeId, backboneId, ribId, newId));
    return newId;
  }, [updateProduct]);

  const addNamedRib = useCallback((
    themeId: string,
    backboneId: string,
    attrs: { name: string; category?: 'core' | 'non-core'; size?: RibItem['size']; description?: string; notes?: string },
  ) => {
    const newId = crypto.randomUUID();
    updateProduct(prev => addNamedRibToProduct(prev, themeId, backboneId, newId, attrs));
    return newId;
  }, [updateProduct]);

  const deleteRibs = useCallback((entries: { ribId: string }[]) => {
    if (!entries.length) return;
    updateProduct(prev => {
      const allRibIds = new Set(entries.map(e => e.ribId));
      const next = {
        ...prev,
        themes: prev.themes.map(t => ({
          ...t,
          backboneItems: t.backboneItems.map(b => ({
            ...b,
            ribItems: b.ribItems.filter(r => !allRibIds.has(r.id)),
          })),
        })),
        releaseCardOrder: cleanCardOrder(prev.releaseCardOrder, allRibIds),
        sizingCardOrder: cleanCardOrder(prev.sizingCardOrder, allRibIds),
      };
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- changelog entry uses non-standard fields for bulk delete
      return { ...next, _changeLog: appendChangeLogEntry(next, { op: 'delete', entity: 'rib' } as any) };
    });
  }, [updateProduct]);

  const moveItem = useCallback(<T extends Record<string, unknown>>(items: T[], id: string, direction: number, key = 'id'): T[] => {
    const arr = [...items];
    const idx = arr.findIndex(item => item[key] === id);
    if (idx < 0) return items;
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= arr.length) return items;
    [arr[idx], arr[newIdx]] = [arr[newIdx], arr[idx]];
    return arr.map((item, i) => ({ ...item, order: i + 1 }));
  }, []);

  return {
    updateTheme,
    updateBackbone,
    updateRib,
    addTheme,
    addBackbone,
    addRib,
    addNamedRib,
    addRibToRelease,
    addRelease,
    addReleaseAfter,
    addSprint,
    deleteTheme,
    deleteBackbone,
    deleteRib,
    deleteRibs,
    splitRib,
    cloneRib,
    moveItem,
  };
}
