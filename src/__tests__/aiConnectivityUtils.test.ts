// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  getLastSeq, setLastSeq, clearLastSeq, safeParseConsent,
} from '../hooks/aiConnectivityUtils';
import { AI_LAST_SEQ_PREFIX } from '../lib/aiConstants';

// In-memory localStorage mock — mirrors the vi.stubGlobal('crypto', ...) pattern
// in useProductMutations.test.ts. The seq helpers read/write the localStorage
// global, which is absent in the node test environment.
const store = new Map<string, string>();
vi.stubGlobal('localStorage', {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v); },
  removeItem: (k: string) => { store.delete(k); },
  clear: () => { store.clear(); },
});

beforeEach(() => store.clear());

describe('getLastSeq / setLastSeq / clearLastSeq', () => {
  it('round-trips a seq value', () => {
    setLastSeq('sess-1', 42);
    expect(getLastSeq('sess-1')).toBe(42);
  });

  it('returns 0 for an unset session', () => {
    expect(getLastSeq('never-set')).toBe(0);
  });

  it('clears a stored seq back to 0', () => {
    setLastSeq('sess-2', 7);
    clearLastSeq('sess-2');
    expect(getLastSeq('sess-2')).toBe(0);
  });

  it('NaN-guards a non-numeric stored value (Number.isFinite fallback to 0)', () => {
    localStorage.setItem(AI_LAST_SEQ_PREFIX + 'sess-3', 'not-a-number');
    expect(getLastSeq('sess-3')).toBe(0);
  });

  it('namespaces the cursor by session id', () => {
    setLastSeq('a', 1);
    setLastSeq('b', 2);
    expect(getLastSeq('a')).toBe(1);
    expect(getLastSeq('b')).toBe(2);
  });
});

describe('safeParseConsent', () => {
  it('parses a valid consent object', () => {
    expect(safeParseConsent('{"version":2,"read":true,"write":false}'))
      .toEqual({ version: 2, read: true, write: false });
  });

  it('returns null for null input', () => {
    expect(safeParseConsent(null)).toBeNull();
  });

  it('returns null for malformed JSON', () => {
    expect(safeParseConsent('{not valid json')).toBeNull();
  });

  it('returns non-null for valid non-object JSON (only parse errors → null)', () => {
    // The function guards parse errors only, not shape: JSON.parse('42')
    // succeeds, so a primitive is returned; callers (changePermissions) spread
    // defensively over the result.
    expect(safeParseConsent('42')).not.toBeNull();
  });
});

// buildOpsQuery is intentionally NOT unit-tested here: it is a thin Firestore
// query builder with no branching, and exercising it would require mocking the
// full firebase/firestore SDK (collection/query/where/orderBy + db) for zero
// behavioral assertion. Its correctness is covered by the live op-subscription
// path in useAiConnectivity.
