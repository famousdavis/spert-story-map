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
const productsWord = (n: number) => (n === 1 ? 'One product' : `${n} products`);

/** The notice's sentences for an outcome, or null when there is nothing to say. */
export function foldNoticeLines(o: FoldOutcome): string[] | null {
  const out: string[] = [];
  if (o.moved > 0) {
    const one = o.moved === 1;
    out.push(`${productsWord(o.moved)} you made while signed in ${one ? 'was' : 'were'} moved into this browser’s Local storage. Anyone who uses this browser can now see ${one ? 'it' : 'them'}.`);
  }
  if (o.copies > 0) {
    const one = o.copies === 1;
    out.push(`${productsWord(o.copies)} had the same ID as a product already here but different contents, so ${one ? 'it was' : 'they were'} kept as ${one ? 'a separate product' : 'separate products'} with “(Copy)” added to the name.`);
  }
  if (o.unreadable > 0) {
    const one = o.unreadable === 1;
    out.push(`${productsWord(o.unreadable)} could not be read, so ${one ? 'it was' : 'they were'} set aside in this browser’s storage, unchanged, and ${one ? 'is' : 'are'} not shown.`);
  }
  if (o.stopped) {
    out.push('Some products could not be moved because this browser’s storage is full. They are kept, but not shown, until there is room: export or delete products you no longer need, then reload the page.');
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
