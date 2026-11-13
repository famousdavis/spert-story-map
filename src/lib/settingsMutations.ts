// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product, ProgressEntry, RibItem, Size, SizeMapping } from '../types';
import { hasValue } from './progressRule';
import { forEachRib, isRibLocked } from './ribHelpers';
import { missingSizeLabel } from './missingSize';

/**
 * `rib` with only the records `keep` passes. A rib with no list stays as it is: the
 * validator keeps the key absent on import, and a throw here lands in an updater
 * React evaluates during render, which blanks the page.
 */
function keepRecords(rib: RibItem, keep: (entry: ProgressEntry) => boolean): RibItem {
  return rib.progressHistory ? { ...rib, progressHistory: rib.progressHistory.filter(keep) } : rib;
}

/**
 * Pure functions for release/sprint cascade deletion.
 * Each takes a product and returns a new product with the entity removed
 * and all references cleaned up.
 */

/** Remove a release and clean all references from allocations, progressHistory, and card order. */
export function deleteReleaseFromProduct(product: Product, releaseId: string): Product {
  const { [releaseId]: _, ...restCardOrder } = product.releaseCardOrder || {};
  return {
    ...product,
    releases: product.releases.filter(r => r.id !== releaseId).map((r, i) => ({ ...r, order: i + 1 })),
    themes: product.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => keepRecords(
          { ...r, releaseAllocations: r.releaseAllocations.filter(a => a.releaseId !== releaseId) },
          p => p.releaseId !== releaseId,
        )),
      })),
    })),
    releaseCardOrder: restCardOrder,
  };
}

/** Remove a sprint and clean all progressHistory references. */
export function deleteSprintFromProduct(product: Product, sprintId: string): Product {
  return {
    ...product,
    sprints: product.sprints.filter(s => s.id !== sprintId).map((s, i) => ({ ...s, order: i + 1 })),
    themes: product.themes.map(t => ({
      ...t,
      backboneItems: t.backboneItems.map(b => ({
        ...b,
        ribItems: b.ribItems.map(r => keepRecords(r, p => p.sprintId !== sprintId)),
      })),
    })),
  };
}

/** Every release delete says this when it will take records with it. */
export const RELEASE_RECORDS_LINE = 'Recorded progress and notes for this release are deleted too.';
export const SPRINT_RECORDS_LINE = 'Recorded progress and notes for this sprint are deleted too.';

/** A value or a comment. A typed 0 is a value. An empty null entry holds nothing. */
const holdsRecord = (entry: ProgressEntry) => hasValue(entry) || Boolean(entry.comment);

function anyEntry(product: Product, test: (entry: ProgressEntry) => boolean): boolean {
  return product.themes.some(t => t.backboneItems.some(b => b.ribItems.some(r => (r.progressHistory ?? []).some(test))));
}

/**
 * Would deleting this release take a record with it? Any entry with a value or a
 * comment, in any sprint, because `deleteReleaseFromProduct` drops all of them,
 * comments included. Not `strandedSeries`, which sees only positive records on known
 * sprints, and not the lock, which sees only current allocations.
 */
export function releaseHoldsRecords(product: Product, releaseId: string): boolean {
  return anyEntry(product, entry => entry.releaseId === releaseId && holdsRecord(entry));
}

/**
 * A release delete's confirm: `lead`, then the shared line when it applies. All three
 * surfaces build their message here, so the line and its condition cannot drift.
 */
export function releaseDeleteMessage(lead: string, product: Product, releaseId: string): string {
  return [lead, releaseHoldsRecords(product, releaseId) ? RELEASE_RECORDS_LINE : ''].filter(Boolean).join(' ');
}

/** Would deleting this sprint take a record with it? `deleteSprintFromProduct` drops comments too. */
export function sprintHoldsRecords(product: Product, sprintId: string): boolean {
  return anyEntry(product, entry => entry.sprintId === sprintId && holdsRecord(entry));
}

/** Check if any rib items have allocations referencing a release. */
export function releaseHasAllocations(product: Product, releaseId: string): boolean {
  for (const t of product.themes) {
    for (const b of t.backboneItems) {
      for (const r of b.ribItems) {
        if (r.releaseAllocations.some(a => a.releaseId === releaseId)) return true;
      }
    }
  }
  return false;
}

// ─── The size list (Settings → T-Shirt Size Mapping) ────────────────────────
//
// A rib holds its size as a LABEL, so the list is a lookup other records point at by
// name. Points come from the FIRST row holding a label (`calculations.ts` sizeIndex);
// a later row with the same label is shadowed and gives no item its points. Every
// transform below returns `prev` itself when it changes nothing and never edits a
// row object in place (rows are cached by identity and shared with the defaults).
// Every lookup keyed by a label is a Map or an own-property check (`owns`): a label such as
// `constructor` would otherwise read Object.prototype inside an updater, which React
// runs during render, and blank the page.

export const MAX_SIZE_LABEL = 20;
export const MAX_SIZES = 20;

/** The row's points as a number, as `getRibItemPoints` reads them (stored text included). */
export function sizeRowPoints(row: SizeMapping | undefined): number {
  const points = Number(row?.points);
  return Number.isFinite(points) ? points : 0;
}

/** The first row holding `label` exactly: the one whose points count. -1 when none. */
export function effectiveSizeIndex(rows: SizeMapping[], label: string): number {
  return rows.findIndex(r => r.label === label);
}

/** The second row holding `label` exactly: the one that counts if the first goes. -1 when none. */
export function nextSizeIndex(rows: SizeMapping[], label: string): number {
  const first = effectiveSizeIndex(rows, label);
  return first < 0 ? -1 : rows.findIndex((r, i) => i > first && r.label === label);
}

export interface SizeUse { items: number; locked: number; points: number }

/**
 * Label → how many items use it, how many of those are locked, and the points they
 * count. One pass over the tree. An empty label is used by nothing.
 */
export function sizeUsage(product: Pick<Product, 'themes' | 'sprints' | 'sizeMapping'>): Map<string, SizeUse> {
  const usage = new Map<string, SizeUse>();
  forEachRib(product, rib => {
    const label = rib.size;
    if (!label) return;
    const use = usage.get(label) ?? { items: 0, locked: 0, points: 0 };
    use.items++;
    if (isRibLocked(rib, product.sprints)) use.locked++;
    usage.set(label, use);
  });
  for (const [label, use] of usage) {
    const row = product.sizeMapping[effectiveSizeIndex(product.sizeMapping, label)];
    use.points = row ? use.items * sizeRowPoints(row) : 0;
  }
  return usage;
}

/** `Object.hasOwn`, which this build's `lib` does not declare. */
const owns = (obj: object, key: string) => Object.prototype.hasOwnProperty.call(obj, key);

const sameIgnoringCase = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();
const quoted = (label: string) => `“${label}”`;

/** Why `label` cannot be row `index`'s label, or null. Trims first, as a rename does. */
export function sizeLabelProblem(rows: SizeMapping[], index: number, label: string): string | null {
  const trimmed = label.trim();
  if (!trimmed) return 'A size needs a label.';
  if (trimmed.length > MAX_SIZE_LABEL) return `At most ${MAX_SIZE_LABEL} characters.`;
  if (trimmed.toLowerCase() === 'unsized') return `${quoted('unsized')} is reserved.`;
  const other = rows.find((r, i) => i !== index && sameIgnoringCase(String(r.label), trimmed));
  return other ? `${quoted(other.label)} is already in the list.` : null;
}

function relabelRibs(themes: Product['themes'], from: string, to: Size): Product['themes'] {
  return themes.map(t => ({
    ...t,
    backboneItems: t.backboneItems.map(b => ({
      ...b,
      ribItems: b.ribItems.map(r => (from && r.size === from ? { ...r, size: to } : r)),
    })),
  }));
}

/**
 * `sizingCardOrder[from]` moved to `[to]`, ahead of any ids already under `[to]`, with no
 * id twice. The Unsized zone's own key, `unsized`, is never moved.
 */
function moveCardOrderKey(order: Product['sizingCardOrder'], from: string, to: string): Product['sizingCardOrder'] {
  if (!order || from === 'unsized' || !owns(order, from)) return order;
  const moved = order[from] ?? [];
  const stale = owns(order, to) ? order[to] ?? [] : [];
  const rest = Object.fromEntries(Object.entries(order).filter(([key]) => key !== from && key !== to));
  return { ...rest, [to]: [...new Set([...moved, ...stale])] };
}

function dropCardOrderKey(order: Product['sizingCardOrder'], label: string): Product['sizingCardOrder'] {
  if (!order || label === 'unsized' || !owns(order, label)) return order;
  return Object.fromEntries(Object.entries(order).filter(([key]) => key !== label));
}

/**
 * Rename row `index` from `expectedLabel` (the label shown when the edit started) to
 * `newLabel`, trimmed. On the effective row every item on the old label and its card
 * order move with it; a shadowed row changes alone. `prev` when the row no longer holds
 * `expectedLabel`, the label is refused, or nothing changes.
 */
export function renameSizeInProduct(prev: Product, index: number, expectedLabel: string, newLabel: string): Product {
  const row = prev.sizeMapping[index];
  const label = newLabel.trim();
  if (!row || row.label !== expectedLabel || label === row.label) return prev;
  if (sizeLabelProblem(prev.sizeMapping, index, label)) return prev;
  const sizeMapping = prev.sizeMapping.map((r, i) => (i === index ? { ...r, label } : r));
  if (!row.label || effectiveSizeIndex(prev.sizeMapping, row.label) !== index) return { ...prev, sizeMapping };
  return {
    ...prev,
    sizeMapping,
    // A custom label is not one of the seven `Size` literals: the boundary cast, as aiOps and productTransforms do.
    themes: relabelRibs(prev.themes, row.label, label as Size),
    sizingCardOrder: moveCardOrderKey(prev.sizingCardOrder, row.label, label),
  };
}

/** Set row `index`'s points. `prev` when the row no longer holds `expectedLabel`, or for a value import refuses. */
export function setSizePointsInProduct(prev: Product, index: number, expectedLabel: string, points: number): Product {
  const row = prev.sizeMapping[index];
  if (!row || row.label !== expectedLabel || !Number.isFinite(points) || points < 0 || row.points === points) return prev;
  return { ...prev, sizeMapping: prev.sizeMapping.map((r, i) => (i === index ? { ...r, points } : r)) };
}

/** Typed points: a finite number, 0 or more, or null. Blank is null: `Number('')` is 0. */
export function parseSizePoints(text: string): number | null {
  if (!text.trim()) return null;
  const points = Number(text);
  return Number.isFinite(points) && points >= 0 ? points : null;
}

/** A new row's label: `New`, `New 2`, …, unique ignoring case. */
function newSizeLabel(rows: SizeMapping[]): string {
  for (let n = 1; ; n++) {
    const label = n === 1 ? 'New' : `New ${n}`;
    if (!rows.some(r => sameIgnoringCase(String(r.label), label))) return label;
  }
}

/** "+ Add Size": a row named inside the updater, so two quick clicks give `New` and `New 2`. */
export function addSizeToProduct(prev: Product): Product {
  if (prev.sizeMapping.length >= MAX_SIZES) return prev;
  return { ...prev, sizeMapping: [...prev.sizeMapping, { label: newSizeLabel(prev.sizeMapping), points: 0 }] };
}

/**
 * Why an orphan label cannot be added back exactly as stored, or null. Checked on the
 * label as stored, never trimmed: a trimmed row would not bring its items back.
 */
export function addBackProblem(rows: SizeMapping[], label: string, items: number): string | null {
  if (label !== label.trim()) return `${quoted(label)} has a space at the start or end, which a size label can't have.`;
  if (label.length > MAX_SIZE_LABEL) return `At most ${MAX_SIZE_LABEL} characters.`;
  if (label.toLowerCase() === 'unsized') return `${quoted('unsized')} is reserved.`;
  const row = rows.find(r => sameIgnoringCase(String(r.label), label));
  if (row) {
    const join = items === 1 ? 'this item joins it' : 'these items join it';
    return `${quoted(row.label)} is already in the list. Rename it to ${quoted(label)} and ${join}.`;
  }
  return rows.length >= MAX_SIZES ? `At most ${MAX_SIZES} sizes.` : null;
}

/** Add back: a row `{ label, points: 0 }`, decided inside the updater so a second click adds nothing. */
export function addBackSizeToProduct(prev: Product, label: string): Product {
  if (!label || addBackProblem(prev.sizeMapping, label, 0)) return prev;
  return { ...prev, sizeMapping: [...prev.sizeMapping, { label, points: 0 }] };
}

/** Labels items hold that no row holds (`missingSizeLabel`), with their item counts, in tree order. */
export function orphanLabels(product: Pick<Product, 'themes' | 'sizeMapping'>): { label: string; items: number }[] {
  const counts = new Map<string, number>();
  forEachRib(product, rib => {
    const label = missingSizeLabel(rib.size, product.sizeMapping);
    if (label) counts.set(label, (counts.get(label) ?? 0) + 1);
  });
  return [...counts].map(([label, items]) => ({ label, items }));
}

/** What removing a row would do, decided in this order (brief §3.5). */
export type RemoveSizeDecision =
  | { kind: 'stale' }
  | { kind: 'shadowed' }
  | { kind: 'unused'; dropKey: boolean }
  | { kind: 'samePoints' }
  | { kind: 'refusedNext'; locked: number }
  | { kind: 'confirmNext'; items: number; points: number; nextPoints: number }
  | { kind: 'refusedLocked'; locked: number }
  | { kind: 'confirmUnsized'; items: number; points: number };

/** The one statement of §3.5: the section's check before the write and the updater both call it. */
export function removeSizeDecision(product: Product, index: number, expectedLabel: string): RemoveSizeDecision {
  const rows = product.sizeMapping;
  const row = rows[index];
  if (!row || row.label !== expectedLabel) return { kind: 'stale' };
  if (effectiveSizeIndex(rows, row.label) !== index) return { kind: 'shadowed' };
  const next = nextSizeIndex(rows, row.label);
  const use = row.label ? sizeUsage(product).get(row.label) : undefined;
  if (!use) return { kind: 'unused', dropKey: next < 0 };
  if (next >= 0) {
    const nextPoints = sizeRowPoints(rows[next]);
    if (nextPoints === sizeRowPoints(row)) return { kind: 'samePoints' };
    if (use.locked > 0) return { kind: 'refusedNext', locked: use.locked };
    return { kind: 'confirmNext', items: use.items, points: use.points, nextPoints };
  }
  if (use.locked > 0) return { kind: 'refusedLocked', locked: use.locked };
  return { kind: 'confirmUnsized', items: use.items, points: use.points };
}

/** A decision that needs the person's yes first. */
export const removeNeedsConfirm = (d: RemoveSizeDecision) => d.kind === 'confirmNext' || d.kind === 'confirmUnsized';

/**
 * Remove row `index`, re-deciding against `prev`. `prev` when the row no longer holds
 * `expectedLabel`, when a rule refuses, or when the outcome now needs a confirm the
 * caller did not get (`confirmed`).
 */
export function removeSizeFromProduct(prev: Product, index: number, expectedLabel: string, confirmed = false): Product {
  const decision = removeSizeDecision(prev, index, expectedLabel);
  if (decision.kind === 'stale' || decision.kind === 'refusedNext' || decision.kind === 'refusedLocked') return prev;
  if (removeNeedsConfirm(decision) && !confirmed) return prev;
  const sizeMapping = prev.sizeMapping.filter((_, i) => i !== index);
  if (decision.kind === 'unused') {
    return decision.dropKey
      ? { ...prev, sizeMapping, sizingCardOrder: dropCardOrderKey(prev.sizingCardOrder, expectedLabel) }
      : { ...prev, sizeMapping };
  }
  if (decision.kind !== 'confirmUnsized') return { ...prev, sizeMapping };
  return {
    ...prev,
    sizeMapping,
    themes: relabelRibs(prev.themes, expectedLabel, null),
    sizingCardOrder: dropCardOrderKey(prev.sizingCardOrder, expectedLabel),
  };
}
