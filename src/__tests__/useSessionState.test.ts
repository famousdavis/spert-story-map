// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { readSessionValue, writeSessionValue } from '../hooks/useSessionState';

/** Minimal Storage-shaped mock — no DOM required. */
function makeStorage(initial: Record<string, string> = {}): Storage {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    get length() { return data.size; },
    clear: () => data.clear(),
    getItem: (k: string) => (data.has(k) ? data.get(k)! : null),
    setItem: (k: string, v: string) => { data.set(k, v); },
    removeItem: (k: string) => { data.delete(k); },
    key: (i: number) => Array.from(data.keys())[i] ?? null,
  };
}

function makeQuotaStorage(): Storage {
  return {
    ...makeStorage(),
    setItem: () => { throw new DOMException('quota', 'QuotaExceededError'); },
  };
}

describe('readSessionValue', () => {
  it('returns default when key missing', () => {
    const storage = makeStorage();
    expect(readSessionValue('missing', { hello: 'world' }, storage))
      .toEqual({ hello: 'world' });
  });

  it('round-trips a stored value', () => {
    const storage = makeStorage();
    writeSessionValue('k', { themeIds: ['a', 'b'], hideLocked: true }, storage);
    expect(readSessionValue('k', { themeIds: [], hideLocked: false }, storage))
      .toEqual({ themeIds: ['a', 'b'], hideLocked: true });
  });

  it('falls back to default on bad JSON', () => {
    const storage = makeStorage({ k: '{not json' });
    expect(readSessionValue('k', { fallback: true }, storage))
      .toEqual({ fallback: true });
  });

  it('returns default when storage is null (non-browser env)', () => {
    expect(readSessionValue('k', 42, null)).toBe(42);
  });

  it('keys are namespaced — different keys do not collide', () => {
    const storage = makeStorage();
    writeSessionValue('one', 1, storage);
    writeSessionValue('two', 2, storage);
    expect(readSessionValue('one', 0, storage)).toBe(1);
    expect(readSessionValue('two', 0, storage)).toBe(2);
  });
});

describe('writeSessionValue', () => {
  it('returns true on success', () => {
    const storage = makeStorage();
    expect(writeSessionValue('k', 'v', storage)).toBe(true);
  });

  it('swallows quota-exceeded errors and returns false', () => {
    const storage = makeQuotaStorage();
    expect(writeSessionValue('k', 'v', storage)).toBe(false);
  });

  it('returns false when storage is null', () => {
    expect(writeSessionValue('k', 'v', null)).toBe(false);
  });

  it('serializes complex objects via JSON', () => {
    const storage = makeStorage();
    const obj = { themeIds: ['t1', 't2'], releaseIds: ['r1'], hideLocked: false };
    writeSessionValue('filter', obj, storage);
    expect(JSON.parse(storage.getItem('filter')!)).toEqual(obj);
  });
});
