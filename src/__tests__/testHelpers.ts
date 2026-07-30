// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Shared helpers for the test suite. Not a test file itself — vitest collects
 * only `*.test.*`, so this is never run as a suite.
 */

/**
 * Unwrap a value that the type system says might be absent, failing loudly and
 * by name if it really is.
 *
 * Under `noUncheckedIndexedAccess`, `product.themes[0]` is `Theme | undefined`,
 * so binding it and reading a property is an error. Use this at the binding:
 *
 *     const theme = req(product.themes[0], 'themes[0]');
 *     expect(theme.name).toBe('Theme A');   // assertions stay unchanged
 *
 * Preferred over `!` for a binding that feeds several assertions. `!` asserts
 * to the compiler that the value is present — a claim the compiler then trusts
 * and stops checking. This performs a real check, and when it fails it names
 * what was missing instead of surfacing a bare "cannot read property of
 * undefined" from somewhere further down the test.
 *
 * For a single read inside an assertion, prefer plain optional chaining
 * (`expect(cells[0]?.id).toBe('r1')`) — a missing element still fails the
 * assertion, and the line stays readable. Do NOT use optional chaining where
 * the matcher asserts absence (`toBeUndefined`, `toBeNull`, `toBeFalsy`): a
 * missing element would make such an assertion pass for the wrong reason.
 */
export function req<T>(value: T | null | undefined, what: string): T {
  if (value === null || value === undefined) {
    throw new Error(`Test fixture expectation failed: expected ${what} to exist`);
  }
  return value;
}
