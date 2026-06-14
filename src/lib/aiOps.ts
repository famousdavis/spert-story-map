// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, Size } from '../types';
import {
  addNamedThemeToProduct,
  addNamedBackboneToProduct,
  addNamedRibToProduct,
} from '../hooks/useProductMutations';
import { appendChangeLogEntry } from './storage';

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
      // entry to the accumulating next._changeLog. After 250 ribs,
      // next._changeLog can hold 250+ entries.
      let next = prev;
      for (const theme of (p.themes as unknown[])) {
        if (!theme || typeof theme !== 'object') continue;
        const t = theme as { themeId: string; name: string; backbones: unknown[] };
        if (!Array.isArray(t.backbones)) continue;
        next = addNamedThemeToProduct(next, t.themeId, { name: t.name });
        for (const backbone of t.backbones) {
          if (!backbone || typeof backbone !== 'object') continue;
          const b = backbone as { backboneId: string; name: string; description?: string; ribs: unknown[] };
          if (!Array.isArray(b.ribs)) continue;
          next = addNamedBackboneToProduct(next, t.themeId, b.backboneId,
            { name: b.name, description: b.description });
          for (const rib of b.ribs) {
            if (!rib || typeof rib !== 'object') continue;
            const r = rib as { ribId: string; name: string; description?: string; category?: 'core' | 'non-core'; notes?: string };
            next = addNamedRibToProduct(next, t.themeId, b.backboneId, r.ribId, {
              name: r.name, description: r.description ?? '',
              category: r.category ?? 'core', notes: r.notes ?? '',
            });
          }
        }
      }
      // Changelog idempotency: if all addNamed* were no-ops, next === prev.
      if (next === prev) return prev;
      // CRITICAL — changelog collapse:
      // next._changeLog now has 250+ 'add' entries from the helpers above.
      // We MUST use `prev` (not `next`) as the base for appendChangeLogEntry,
      // so the final _changeLog = prev._changeLog + one 'import' entry. The
      // spread { ...next, _changeLog } overrides next._changeLog with this
      // collapsed value. Final count = prev._changeLog.length + 1.
      return {
        ...next,
        _changeLog: appendChangeLogEntry(prev, { op: 'import', entity: 'product', source: 'ai' }),
      };
    }
    case 'create_theme':
      return addNamedThemeToProduct(prev, p.themeId as string, { name: p.name as string });
    case 'create_backbone':
      return addNamedBackboneToProduct(prev, p.themeId as string, p.backboneId as string,
        { name: p.name as string, description: p.description as string | undefined });
    case 'create_rib':
      return addNamedRibToProduct(prev, p.themeId as string, p.backboneId as string, p.ribId as string, {
        name: p.name as string, description: (p.description as string) ?? '',
        category: (p.category as 'core' | 'non-core') ?? 'core', notes: (p.notes as string) ?? '',
      });
    case 'update_theme': {
      if (p.name === undefined) return prev;
      let didUpdate = false;
      const themes = prev.themes.map(t => {
        if (t.id !== p.themeId) return t;
        didUpdate = true;
        return { ...t, name: p.name as string };
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
      if (p.name === undefined && p.description === undefined) return prev;
      let didUpdate = false;
      const themes = prev.themes.map(t => {
        if (t.id !== p.themeId) return t;
        const backboneItems = t.backboneItems.map(b => {
          if (b.id !== p.backboneId) return b;
          didUpdate = true;
          return {
            ...b,
            ...(p.name !== undefined && { name: p.name as string }),
            ...(p.description !== undefined && { description: p.description as string }),
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
      if (
        p.name === undefined && p.description === undefined &&
        p.category === undefined && p.notes === undefined && p.size === undefined
      ) return prev;
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
            const locked = (r.progressHistory ?? []).some(
              e => (e.percentComplete ?? 0) > 0
            );
            return {
              ...r,
              ...(p.name !== undefined && { name: p.name as string }),
              ...(p.description !== undefined && { description: p.description as string }),
              ...(p.category !== undefined && { category: p.category as 'core' | 'non-core' }),
              ...(p.notes !== undefined && { notes: p.notes as string }),
              // Size silently dropped for locked ribs; other fields still apply.
              ...(!locked && p.size !== undefined && { size: p.size as Size }),
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
