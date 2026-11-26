// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Load Sample's name and message (v0.58.0, FRAME26's clean-up; contract §7, William's wording, 2026-11-26).
//
// Every sample is named "Sample: ‹the sample's name›". If a product already has that exact name (an archived one
// included: the caller passes every product's name), the next is "Sample: ‹name› (2)", then (3), the lowest number
// free. Names are compared exactly, as typed: no case folding and no trimming, so "sample: …" or a trailing space is a
// different name. Samples loaded before v0.58.0 keep their names ("Billing System v2"); nothing migrates them.

export const SAMPLE_PREFIX = 'Sample: ';

/** The first free name for a new sample of `base`: "Sample: base", else "Sample: base (2)", "(3)", …. */
export function sampleName(base: string, takenNames: Iterable<string>): string {
  const taken = new Set(takenNames);
  const first = `${SAMPLE_PREFIX}${base}`;
  if (!taken.has(first)) return first;
  for (let n = 2; ; n += 1) {
    const candidate = `${first} (${n})`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** What the app's live region says once the sample is added and opened. */
export function sampleAddedMessage(name: string): string {
  return `Added “${name}” to your products and opened it.`;
}
