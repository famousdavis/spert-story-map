// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * What the fold did (v0.56.1, R71 R-3), for `LocalFoldBanner`. Set by StorageProvider when a fold
 * moved, copied, skipped or stopped; cleared by Dismiss. It lives in memory only, so a reload clears
 * it. The words are here, decided from the outcome.
 */
import type { FoldOutcome } from './localStoreFold';

let lines: string[] | null = null;
const listeners = new Set<() => void>();

const changed = () => { for (const listener of listeners) listener(); };
const STOPPED_LINE = 'Some products could not be moved because this browser’s storage is full. They are kept, but not shown, until there is room: delete products you no longer need, then reload the page.';

/** Singular or plural words for a count. */
function forms(n: number) {
  const one = n === 1;
  return {
    products: one ? 'One product' : `${n} products`,
    was: one ? 'was' : 'were',
    is: one ? 'is' : 'are',
    it: one ? 'it' : 'them',
    itWas: one ? 'it was' : 'they were',
    separate: one ? 'a separate product' : 'separate products',
  };
}

/** The notice's sentences for an outcome, or null when there is nothing to say. */
export function foldNoticeLines(o: FoldOutcome): string[] | null {
  const out: string[] = [];
  if (o.moved > 0) {
    const w = forms(o.moved);
    out.push(`${w.products} you made while signed in ${w.was} moved into this browser’s Local storage. Anyone who uses this browser can now see ${w.it}.`);
  }
  if (o.copies > 0) {
    const w = forms(o.copies);
    out.push(`${w.products} had the same ID as a product already here but different contents, so ${w.itWas} kept as ${w.separate} with “(Copy)” added to the name.`);
  }
  if (o.unreadable > 0) {
    const w = forms(o.unreadable);
    out.push(`${w.products} could not be read, so ${w.itWas} set aside in this browser’s storage, unchanged, and ${w.is} not shown.`);
  }
  if (o.stopped) {
    out.push(STOPPED_LINE);
  }
  return out.length > 0 ? out : null;
}

export function reportFold(o: FoldOutcome): void {
  const next = foldNoticeLines(o);
  if (!next) return;
  lines = next;
  changed();
}

export function dismissFoldNotice(): void {
  if (lines === null) return;
  lines = null;
  changed();
}

export function getFoldNotice(): string[] | null {
  return lines;
}

export function subscribeFoldNotice(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}
