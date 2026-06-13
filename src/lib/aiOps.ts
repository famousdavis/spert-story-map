// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product } from '../types';
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
    case 'update_theme':
      return { ...prev, themes: prev.themes.map(t =>
        t.id !== p.themeId ? t : { ...t, name: p.name as string }) };
    case 'update_backbone':
      return { ...prev, themes: prev.themes.map(t =>
        t.id !== p.themeId ? t : { ...t, backboneItems: t.backboneItems.map(b =>
          b.id !== p.backboneId ? b : { ...b, name: p.name as string }) }) };
    case 'update_rib':
      return { ...prev, themes: prev.themes.map(t =>
        t.id !== p.themeId ? t : { ...t, backboneItems: t.backboneItems.map(b =>
          b.id !== p.backboneId ? b : { ...b, ribItems: b.ribItems.map(r =>
            r.id !== p.ribId ? r : {
              ...r,
              ...(p.name !== undefined && { name: p.name as string }),
              ...(p.description !== undefined && { description: p.description as string }),
              ...(p.category !== undefined && { category: p.category as 'core' | 'non-core' }),
              ...(p.notes !== undefined && { notes: p.notes as string }),
            }) }) }) };
    default:
      console.warn(`[AI] Unknown op "${op}" — no-op.`);
      return prev;
  }
}
