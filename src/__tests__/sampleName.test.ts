// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Load Sample's name and message (v0.58.0, contract §7, William's wording 2026-11-26): "Sample: ‹name›", else the
 * lowest free "(2)", "(3)", …, compared exactly; and "Added “‹name›” to your products and opened it."
 * The page-level cases (an archived product holding the name, the names read fresh) are in `loadSample.test.tsx`.
 */
import { describe, it, expect } from 'vitest';
import { sampleName, sampleAddedMessage, SAMPLE_PREFIX } from '../lib/sampleName';

const BASE = 'Billing System v2';

describe('sampleName', () => {
  it('no products: "Sample: Billing System v2"', () => {
    expect(sampleName(BASE, [])).toBe('Sample: Billing System v2');
  });

  it('the base taken: "(2)"', () => {
    expect(sampleName(BASE, ['Sample: Billing System v2'])).toBe('Sample: Billing System v2 (2)');
  });

  it('the base and (2) taken: "(3)"', () => {
    expect(sampleName(BASE, ['Sample: Billing System v2', 'Sample: Billing System v2 (2)'])).toBe('Sample: Billing System v2 (3)');
  });

  it('(2) taken but the base free: the base wins', () => {
    expect(sampleName(BASE, ['Sample: Billing System v2 (2)'])).toBe('Sample: Billing System v2');
  });

  it('the lowest number free: the base and (3) taken gives (2)', () => {
    expect(sampleName(BASE, ['Sample: Billing System v2', 'Sample: Billing System v2 (3)'])).toBe('Sample: Billing System v2 (2)');
  });

  it('an item holding the name, archived or not, is a name taken: the caller passes every name', () => {
    // Archive is a per-person setting, never a removal: the product is still in the list the caller reads.
    const all = ['Alpha', 'Sample: Billing System v2' /* archived */, 'Beta'];
    expect(sampleName(BASE, all)).toBe('Sample: Billing System v2 (2)');
  });

  it('a person\'s own product named like a sample counts too', () => {
    expect(sampleName(BASE, ['My work', 'Sample: Billing System v2'])).toBe('Sample: Billing System v2 (2)');
  });

  it('exact names only: another case, a trailing space or the old unprefixed sample are different names', () => {
    expect(sampleName(BASE, ['sample: billing system v2', 'Sample: Billing System v2 ', 'Billing System v2'])).toBe('Sample: Billing System v2');
  });

  it('takes any iterable of names, a Set included', () => {
    expect(sampleName(BASE, new Set(['Sample: Billing System v2']))).toBe('Sample: Billing System v2 (2)');
  });

  it('the prefix is "Sample: ", the base name follows it unchanged', () => {
    expect(SAMPLE_PREFIX).toBe('Sample: ');
    expect(sampleName('X', [])).toBe('Sample: X');
  });
});

describe('sampleAddedMessage', () => {
  it('the contract\'s sentence, curly quotes, "products" in lower case', () => {
    expect(sampleAddedMessage('Sample: Billing System v2')).toBe('Added “Sample: Billing System v2” to your products and opened it.');
    expect(sampleAddedMessage('Sample: Billing System v2 (2)')).toBe('Added “Sample: Billing System v2 (2)” to your products and opened it.');
  });
});
