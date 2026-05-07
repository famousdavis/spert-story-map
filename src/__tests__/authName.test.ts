// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { denormalizeLastFirst } from '../lib/auth-name';

describe('denormalizeLastFirst', () => {
  it('reorders standard "Last, First Middle" Microsoft format', () => {
    expect(denormalizeLastFirst('Davis, William W')).toBe('William W Davis');
  });

  it('reorders simple "Last, First"', () => {
    expect(denormalizeLastFirst('Smith, John')).toBe('John Smith');
  });

  it('passes through "First Last" unchanged', () => {
    expect(denormalizeLastFirst('Alice Johnson')).toBe('Alice Johnson');
  });

  it('handles multi-comma "Last, First, Middle"', () => {
    expect(denormalizeLastFirst('Last, First, Middle')).toBe('First Middle Last');
  });

  it('returns empty string for empty input', () => {
    expect(denormalizeLastFirst('')).toBe('');
  });

  it('returns empty string for whitespace-only input', () => {
    expect(denormalizeLastFirst('  ')).toBe('');
  });

  it('returns input unchanged when fewer than 2 non-empty parts (comma-only)', () => {
    // Canonical behavior: split-trim-filter yields empty parts list, falls through
    // to `return s.trim()`. Mirrors mailHeaders.ts denormalizeLastFirst.
    expect(denormalizeLastFirst(',')).toBe(',');
  });

  it('handles single-token input', () => {
    expect(denormalizeLastFirst('Cher')).toBe('Cher');
  });

  it('trims whitespace around each part', () => {
    expect(denormalizeLastFirst('  Davis ,  William W  ')).toBe('William W Davis');
  });
});
