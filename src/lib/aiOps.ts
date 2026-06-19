// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, Size } from '../types';
import {
  addNamedThemeToProduct,
  addNamedBackboneToProduct,
  addNamedRibToProduct,
  addNamedReleaseToProduct,
  allocateRibInProduct,
  unassignRibInProduct,
  sizeRibInProduct,              // ← Phase 3
} from './productTransforms';
import { appendChangeLogEntry } from './storage';
import { isRibLocked } from './ribHelpers';

export interface AiOpDoc { seq: number; op: string; payload: unknown; }

/**
 * Phase 1 PROBE: fold each op through applyAiOp in order, keeping the longest
 * prefix that applies without throwing. Since every Phase 1 op is no-throw,
 * this always returns the full ops array; the real safety is the functional
 * updateProduct form + seq-gate + unique pre-minted IDs in the hook.
 */
export function computeSafePrefix(
  product: Product,
  ops: AiOpDoc[],
): { safeOps: AiOpDoc[]; nextSeq: number } {
  let probe = product;
  const safeOps: AiOpDoc[] = [];
  for (const opDoc of ops) {
    try { probe = applyAiOp(probe, opDoc.op, opDoc.payload); safeOps.push(opDoc); }
    catch { break; }
  }
  // noUncheckedIndexedAccess: arr[i] is T | undefined. Named var + check.
  const lastSafe = safeOps[safeOps.length - 1]; // AiOpDoc | undefined
  return { safeOps, nextSeq: lastSafe !== undefined ? lastSafe.seq : 0 };
}

export function applyAiOp(prev: Product, op: string, payload: unknown): Product {
  const p = payload as Record<string, unknown>;
  switch (op) {
    case 'bulk_import': {
      if (!Array.isArray(p.themes) || p.themes.length === 0) return prev;
      // Apply all addNamed* helpers. Each call appends a per-entity 'add'
      // entry to the accumulating next._changeLog. After 500 ribs,
      // next._changeLog can hold 500+ entries.
      let next = prev;
      for (const theme of (p.themes as unknown[])) {
        if (!theme || typeof theme !== 'object') continue;
        const t = theme as { themeId?: unknown; name?: unknown; backbones?: unknown };
        // typeof-guard every field reaching state (defense-in-depth for the drain
        // path). A theme/backbone/rib with a non-string id or name is skipped, not
        // created with a cast-laundered value.
        if (typeof t.themeId !== 'string' || typeof t.name !== 'string') continue;
        if (!Array.isArray(t.backbones)) continue;
        const themeId = t.themeId;
        next = addNamedThemeToProduct(next, themeId, { name: t.name });
        for (const backbone of t.backbones) {
          if (!backbone || typeof backbone !== 'object') continue;
          const b = backbone as { backboneId?: unknown; name?: unknown; description?: unknown; ribs?: unknown };
          if (typeof b.backboneId !== 'string' || typeof b.name !== 'string') continue;
          if (!Array.isArray(b.ribs)) continue;
          const backboneId = b.backboneId;
          next = addNamedBackboneToProduct(next, themeId, backboneId,
            { name: b.name, description: typeof b.description === 'string' ? b.description : undefined });
          for (const rib of b.ribs) {
            if (!rib || typeof rib !== 'object') continue;
            const r = rib as { ribId?: unknown; name?: unknown; description?: unknown; category?: unknown; notes?: unknown };
            if (typeof r.ribId !== 'string' || typeof r.name !== 'string') continue;
            next = addNamedRibToProduct(next, themeId, backboneId, r.ribId, {
              name: r.name,
              description: typeof r.description === 'string' ? r.description : '',
              category: r.category === 'core' || r.category === 'non-core' ? r.category : 'core',
              notes: typeof r.notes === 'string' ? r.notes : '',
            });
          }
        }
      }
      // Changelog idempotency: if all addNamed* were no-ops, next === prev.
      if (next === prev) return prev;
      // CRITICAL — changelog collapse:
      // next._changeLog now has 500+ 'add' entries from the helpers above.
      // We MUST use `prev` (not `next`) as the base for appendChangeLogEntry,
      // so the final _changeLog = prev._changeLog + one 'import' entry. The
      // spread { ...next, _changeLog } overrides next._changeLog with this
      // collapsed value. Final count = prev._changeLog.length + 1.
      return {
        ...next,
        _changeLog: appendChangeLogEntry(prev, { op: 'import', entity: 'product', source: 'ai' }),
      };
    }
    case 'create_theme': {
      // Defense-in-depth: payload field types are validated by the LP MCP Zod
      // schema on the write path, but the D5 drain replays raw docs. typeof-guard
      // every field reaching state so a non-string can never be cast-laundered.
      if (typeof p.themeId !== 'string' || typeof p.name !== 'string') return prev;
      return addNamedThemeToProduct(prev, p.themeId, { name: p.name });
    }
    case 'create_backbone': {
      if (typeof p.themeId !== 'string' || typeof p.backboneId !== 'string' ||
          typeof p.name !== 'string') return prev;
      return addNamedBackboneToProduct(prev, p.themeId, p.backboneId,
        { name: p.name, description: typeof p.description === 'string' ? p.description : undefined });
    }
    case 'create_rib': {
      if (typeof p.themeId !== 'string' || typeof p.backboneId !== 'string' ||
          typeof p.ribId !== 'string' || typeof p.name !== 'string') return prev;
      return addNamedRibToProduct(prev, p.themeId, p.backboneId, p.ribId, {
        name: p.name,
        description: typeof p.description === 'string' ? p.description : '',
        category: p.category === 'core' || p.category === 'non-core' ? p.category : 'core',
        notes: typeof p.notes === 'string' ? p.notes : '',
      });
    }
    case 'update_theme': {
      // typeof-guard (not just !== undefined) so a non-string name cannot be
      // cast-laundered into state. Local capture keeps the narrowing across the
      // .map closure (property narrowing on `p` does not survive closures).
      if (typeof p.name !== 'string') return prev;
      const name = p.name;
      let didUpdate = false;
      const themes = prev.themes.map(t => {
        if (t.id !== p.themeId) return t;
        didUpdate = true;
        return { ...t, name };
      });
      if (!didUpdate) return prev;
      const next = { ...prev, themes };
      return {
        ...next,
        _changeLog: appendChangeLogEntry(next, {
          op: 'update', entity: 'theme', id: p.themeId as string, source: 'ai',
        }),
      };
    }
    case 'update_backbone': {
      const name = typeof p.name === 'string' ? p.name : undefined;
      const description = typeof p.description === 'string' ? p.description : undefined;
      if (name === undefined && description === undefined) return prev;
      let didUpdate = false;
      const themes = prev.themes.map(t => {
        if (t.id !== p.themeId) return t;
        const backboneItems = t.backboneItems.map(b => {
          if (b.id !== p.backboneId) return b;
          didUpdate = true;
          return {
            ...b,
            ...(name !== undefined && { name }),
            ...(description !== undefined && { description }),
          };
        });
        return { ...t, backboneItems };
      });
      if (!didUpdate) return prev;
      const next = { ...prev, themes };
      return {
        ...next,
        _changeLog: appendChangeLogEntry(next, {
          op: 'update', entity: 'backbone', id: p.backboneId as string, source: 'ai',
        }),
      };
    }
    case 'update_rib': {
      // typeof/enum-guard each field so a non-string (or invalid category) cannot
      // be cast-laundered into state — this also closes the `category:'bogus'` write.
      const name = typeof p.name === 'string' ? p.name : undefined;
      const description = typeof p.description === 'string' ? p.description : undefined;
      // Cast (not just narrow) to match the bulk_update_ribs pattern: an extracted
      // local spread into the rib literal widens to `string` without the cast.
      const category = p.category === 'core' || p.category === 'non-core'
        ? p.category as 'core' | 'non-core'
        : undefined;
      const notes = typeof p.notes === 'string' ? p.notes : undefined;
      if (
        name === undefined && description === undefined &&
        category === undefined && notes === undefined && p.size === undefined
      ) return prev;
      // Build a valid-label set once, pre-walk. Mirrors sizeRibInProduct Guard 1.
      // Null is the clear sentinel — always allowed through regardless of sizeMapping.
      // Non-null values not in this product's sizeMapping are silently dropped.
      const validSizeSet = new Set<string>((prev.sizeMapping ?? []).map(m => m.label));
      let didUpdate = false;
      const themes = prev.themes.map(t => {
        if (t.id !== p.themeId) return t;
        const backboneItems = t.backboneItems.map(b => {
          if (b.id !== p.backboneId) return b;
          const ribItems = b.ribItems.map(r => {
            if (r.id !== p.ribId) return r;
            didUpdate = true;
            // Mirror the Sizing UI lock (CLAUDE.md #26): do not resize a rib
            // with sprint progress. Corrupting doneValue = points × delta-percent
            // breaks historical Forecaster math. The ?? [] guard handles
            // hand-edited/imported products where progressHistory may be absent.
            const locked = isRibLocked(r);
            return {
              ...r,
              ...(name !== undefined && { name }),
              ...(description !== undefined && { description }),
              ...(category !== undefined && { category }),
              ...(notes !== undefined && { notes }),
              // Size silently dropped for locked ribs; other fields still apply.
              // Also dropped when a non-null label is absent from sizeMapping
              // (null is the clear sentinel and always passes).
              ...(!locked && p.size !== undefined && (
                p.size === null ||
                (typeof p.size === 'string' && validSizeSet.has(p.size))
              ) && { size: p.size as Size }),
            };
          });
          return { ...b, ribItems };
        });
        return { ...t, backboneItems };
      });
      if (!didUpdate) return prev;
      const next = { ...prev, themes };
      return {
        ...next,
        _changeLog: appendChangeLogEntry(next, {
          op: 'update', entity: 'rib', id: p.ribId as string, source: 'ai',
        }),
      };
    }
    case 'create_release': {
      // Payload: { releaseId: string, name: string }
      if (typeof p.releaseId !== 'string' || !p.releaseId) return prev;
      if (typeof p.name !== 'string' || !p.name) return prev;
      return addNamedReleaseToProduct(prev, p.releaseId as string, { name: p.name as string });
    }
    case 'allocate_rib': {
      // Payload: { ribId: string, releaseId: string }
      // No themeId/backboneId — global rib lookup inside allocateRibInProduct
      if (typeof p.ribId !== 'string' || !p.ribId) return prev;
      if (typeof p.releaseId !== 'string' || !p.releaseId) return prev;
      return allocateRibInProduct(prev, p.ribId as string, p.releaseId as string);
    }
    case 'unassign_rib': {
      // Payload: { ribId: string }
      if (typeof p.ribId !== 'string' || !p.ribId) return prev;
      return unassignRibInProduct(prev, p.ribId as string);
    }
    case 'size_rib': {
      // Payload: { ribId: string, size: string }
      // typeof guards reject non-string payloads (mirrors allocate_rib, aiOps.ts:185–186).
      // sizeMapping validation, lock guard, and Form B additive guard are in sizeRibInProduct.
      if (typeof p.ribId !== 'string' || !p.ribId) return prev;
      if (typeof p.size !== 'string' || !p.size) return prev;
      return sizeRibInProduct(prev, p.ribId as string, p.size as string);
    }
    // ── Phase 4 — bulk ops ─────────────────────────────────────────────────────
    case 'bulk_create_releases': {
      // Payload: { releases: Array<{ releaseId: string, name: string }> }
      // No Read Mode required — AI supplies its own UUIDs (same as create_release).
      // @no-throw — safe in drain path.
      if (!Array.isArray(p.releases) || p.releases.length === 0) return prev;
      let next = prev;
      for (const raw of p.releases as unknown[]) {
        if (!raw || typeof raw !== 'object') continue;
        const e = raw as { releaseId?: unknown; name?: unknown };
        if (typeof e.releaseId !== 'string' || !e.releaseId) continue;
        if (typeof e.name !== 'string' || !e.name) continue;
        next = addNamedReleaseToProduct(next, e.releaseId, { name: e.name });
      }
      if (next === prev) return prev;
      // Collapse N helper-appended entries to one using `prev` (not `next`) as base.
      return {
        ...next,
        _changeLog: appendChangeLogEntry(prev, {
          op: 'add', entity: 'release', source: 'ai',
        }),
      };
    }
    case 'bulk_allocate': {
      // Payload: { allocations: Array<{ ribId: string, releaseId: string }> }
      // Read Mode required — AI reads ribIds from storymap_get_project.
      // Inherits all 4 allocateRibInProduct guards.
      // @no-throw — safe in drain path.
      if (!Array.isArray(p.allocations) || p.allocations.length === 0) return prev;
      let next = prev;
      for (const raw of p.allocations as unknown[]) {
        if (!raw || typeof raw !== 'object') continue;
        const e = raw as { ribId?: unknown; releaseId?: unknown };
        if (typeof e.ribId !== 'string' || !e.ribId) continue;
        if (typeof e.releaseId !== 'string' || !e.releaseId) continue;
        next = allocateRibInProduct(next, e.ribId, e.releaseId);
      }
      if (next === prev) return prev;
      return {
        ...next,
        _changeLog: appendChangeLogEntry(prev, {
          op: 'update', entity: 'rib', source: 'ai',
        }),
      };
    }
    case 'bulk_size': {
      // Payload: { sizes: Array<{ ribId: string, size: string }> }
      // Read Mode required — AI reads ribIds and sizeMapping from storymap_get_project.
      // sizeRibInProduct Guard 1 (label membership) is the real size validator.
      // Inherits all 4 sizeRibInProduct guards.
      // @no-throw — safe in drain path.
      if (!Array.isArray(p.sizes) || p.sizes.length === 0) return prev;
      let next = prev;
      for (const raw of p.sizes as unknown[]) {
        if (!raw || typeof raw !== 'object') continue;
        const e = raw as { ribId?: unknown; size?: unknown };
        if (typeof e.ribId !== 'string' || !e.ribId) continue;
        if (typeof e.size !== 'string' || !e.size) continue;
        next = sizeRibInProduct(next, e.ribId, e.size);
      }
      if (next === prev) return prev;
      return {
        ...next,
        _changeLog: appendChangeLogEntry(prev, {
          op: 'update', entity: 'rib', source: 'ai',
        }),
      };
    }
    // ── Phase 5 — bulk unassign ──────────────────────────────────────────────
    case 'bulk_unassign': {
      // Payload: { ribIds: string[] }
      // Read Mode required — AI reads ribIds (+ locked state) from storymap_get_project.
      // Loops unassignRibInProduct per entry. Inherits all 3 guards:
      //   1. rib not found → prev ref-equal
      //   2. rib is locked → prev ref-equal
      //   3. rib already unassigned → prev ref-equal
      // @no-throw — safe in drain path.
      if (!Array.isArray(p.ribIds) || p.ribIds.length === 0) return prev;
      let next = prev;
      for (const raw of p.ribIds as unknown[]) {
        if (typeof raw !== 'string' || !raw) continue;
        next = unassignRibInProduct(next, raw);
      }
      if (next === prev) return prev;
      // Changelog collapse: discard N per-rib entries; replace with one summary entry.
      // CRITICAL — base is `prev` not `next` (see CLAUDE.md #51).
      return {
        ...next,
        _changeLog: appendChangeLogEntry(prev, {
          op: 'update', entity: 'rib', source: 'ai',
        }),
      };
    }
    // ── Phase 6 — bulk text-field update ────────────────────────────────────
    case 'bulk_update_ribs': {
      // Payload: { updates: Array<{ ribId, description?, category?, notes? }> }
      // Read Mode required — AI reads ribIds from storymap_get_project.
      // Text fields REPLACE when present (incl. ''); undefined = skip field.
      // No name, no size (excluded by contract).
      // No locked-rib guard on text fields — only size is lock-gated (update_rib).
      // Runtime category enum guard + cast: guard drops invalid values at runtime;
      // cast satisfies tsc (without it, category widens to string → TS2322).
      // Accepted wart: an entry where all fields fail their type/enum guards (e.g.
      // category:'bogus' or description:42) sets didUpdate on ribId match and appends
      // one summary entry for zero net change — mirrors update_rib:472. (CLAUDE.md #54)
      // @no-throw — safe in drain path. Unlike additive bulk ops, re-application
      // rewrites field values again (replace semantics) and is not state-idempotent.
      if (!Array.isArray(p.updates) || p.updates.length === 0) return prev;
      let next = prev;
      for (const raw of p.updates as unknown[]) {
        if (!raw || typeof raw !== 'object') continue;
        const e = raw as {
          ribId?: unknown; description?: unknown;
          category?: unknown; notes?: unknown;
        };
        if (typeof e.ribId !== 'string' || !e.ribId) continue;
        // Per-entry all-fields-undefined skip: a bare {ribId} entry is a true no-op.
        // Prevents spurious didUpdate + changelog churn (mirrors update_rib top guard
        // aiOps.ts:137-140).
        if (
          e.description === undefined &&
          e.category === undefined &&
          e.notes === undefined
        ) continue;
        // Inline global-ribId walk (CLAUDE.md #54). No updateRibTextInProduct helper.
        let didUpdate = false;
        // LOAD-BEARING: map source is `next.themes`, not `prev.themes`.
        // Using `prev.themes` as map source silently discards all prior entries in the
        // batch — only the last matching entry's updates would survive. The multi-rib
        // test ('updates multiple ribs in one call') catches this regression.
        const themes = next.themes.map(t => ({
          ...t,
          backboneItems: t.backboneItems.map(b => ({
            ...b,
            ribItems: b.ribItems.map(r => {
              if (r.id !== e.ribId) return r;
              didUpdate = true;
              return {
                ...r,
                // typeof guard prevents non-string values reaching product state on
                // injection/drain paths (LP Zod guards the normal path).
                ...(typeof e.description === 'string' && {
                  description: e.description,
                }),
                // Runtime enum guard + cast (both required — see comment above).
                ...(
                  (e.category === 'core' || e.category === 'non-core') &&
                  { category: e.category as 'core' | 'non-core' }
                ),
                ...(typeof e.notes === 'string' && {
                  notes: e.notes,
                }),
              };
            }),
          })),
        }));
        // Guard next reassignment on actual ribId match so non-matching entries
        // keep next ref-equal to prev, preserving the final idempotency check.
        if (didUpdate) next = { ...next, themes };
      }
      if (next === prev) return prev;
      // Changelog collapse: N updates → one summary entry.
      // Base is `prev` (CLAUDE.md #51). For this inline-walk op,
      // prev._changeLog === next._changeLog throughout (the walk never appends to
      // _changeLog), so prev and next are equivalent — prev is used for consistency.
      return {
        ...next,
        _changeLog: appendChangeLogEntry(prev, {
          op: 'update', entity: 'rib', source: 'ai',
        }),
      };
    }
    default:
      console.warn(`[AI] Unknown op "${op}" — no-op.`);
      return prev;
  }
}

/**
 * Apply a batch of drain ops to a product in document order. Pure function,
 * no side effects. Extracted from the D5 null-window recovery path so the
 * core logic is independently testable.
 *
 * Returns the updated product and the seq of the last successfully applied
 * op (nextSeq). If drainOps is empty or its first op throws, returns the
 * original product and nextSeq 0.
 *
 * ⚠ TWO-CALL COUPLING: The drain path calls this twice — once on
 * productRef.current (a pre-commit snapshot) to read nextSeq, and once
 * inside updateProduct's functional form (on prev, the committed state).
 * This is safe only while all Phase-1 ops are no-throw: computeSafePrefix
 * returns the full array regardless of product state, so nextSeq is
 * product-state-independent. If a future op can throw, the two calls may
 * return different safeOps/nextSeq, causing setLastSeq to advance past ops
 * the functional update never applied (silent permanent loss). Add an
 * explicit no-throw contract to any new op before using it in the drain path.
 */
export function applyDrainOps(
  product: Product,
  drainOps: AiOpDoc[],
): { product: Product; nextSeq: number } {
  const { safeOps, nextSeq } = computeSafePrefix(product, drainOps);
  // safeOps is the no-throw prefix. The try/catch below mirrors onNext for
  // symmetry; it cannot fire for Phase-1 vocabulary (default case returns
  // prev, never throws), but is kept as a safety net for future ops.
  const nextProduct = safeOps.reduce((acc, opDoc) => {
    try { return applyAiOp(acc, opDoc.op, opDoc.payload); }
    catch { return acc; }
  }, product);
  return { product: nextProduct, nextSeq };
}
