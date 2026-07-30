// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import {
  isRibCardColorKey,
  resolveCardColorKey,
  migrateCardColors,
  RIB_CARD_COLOR_KEYS,
} from '../lib/ribCardColors';
import { req } from './testHelpers';

function rib(id: string, cardColor?: string) {
  return { id, name: id, size: null, category: 'core', order: 1, releaseAllocations: [], progressHistory: [], ...(cardColor ? { cardColor } : {}) };
}

function product(ribs: unknown[], cardColorLabels?: Record<string, string>) {
  return {
    id: 'p1', name: 'P', themes: [{ id: 't1', name: 'T', order: 1, backboneItems: [{ id: 'b1', name: 'B', order: 1, ribItems: ribs }] }],
    releases: [], sprints: [], sizeMapping: [],
    ...(cardColorLabels ? { cardColorLabels } : {}),
  };
}

describe('ribCardColors palette', () => {
  it('uses orange, not amber, in the current palette', () => {
    expect(RIB_CARD_COLOR_KEYS).toContain('orange');
    expect(RIB_CARD_COLOR_KEYS).not.toContain('amber');
  });

  it('isRibCardColorKey rejects the legacy amber key', () => {
    expect(isRibCardColorKey('orange')).toBe(true);
    expect(isRibCardColorKey('amber')).toBe(false);
  });

  it('resolveCardColorKey maps amber→orange and passes current keys through', () => {
    expect(resolveCardColorKey('amber')).toBe('orange');
    expect(resolveCardColorKey('orange')).toBe('orange');
    expect(resolveCardColorKey('rose')).toBe('rose');
    expect(resolveCardColorKey('nope')).toBeUndefined();
    expect(resolveCardColorKey(undefined)).toBeUndefined();
  });
});

describe('migrateCardColors', () => {
  it('returns null unchanged', () => {
    expect(migrateCardColors(null)).toBeNull();
  });

  it('rewrites amber cardColor to orange on ribs', () => {
    const p = product([rib('r1', 'amber'), rib('r2', 'rose'), rib('r3')]);
    const next = req(migrateCardColors(p), 'next');
    const ribs = req(next.themes[0]?.backboneItems[0]?.ribItems, 'ribs');
    expect(ribs[0]?.cardColor).toBe('orange');
    expect(ribs[1]?.cardColor).toBe('rose');
    expect(ribs[2].cardColor).toBeUndefined();
  });

  it('remaps the cardColorLabels amber key to orange', () => {
    const p = product([rib('r1', 'amber')], { amber: 'Deferred', rose: 'Blocked' });
    const next = req(migrateCardColors(p), 'next');
    expect(next.cardColorLabels).toEqual({ orange: 'Deferred', rose: 'Blocked' });
  });

  it('keeps an existing orange label over the legacy amber one', () => {
    const p = product([rib('r1', 'amber')], { amber: 'old', orange: 'new' });
    const next = req(migrateCardColors(p), 'next');
    expect(next.cardColorLabels).toEqual({ orange: 'new' });
  });

  it('is idempotent — returns the SAME reference when nothing is legacy', () => {
    const p = product([rib('r1', 'orange'), rib('r2', 'sky')], { orange: 'X' });
    const next = req(migrateCardColors(p), 'next');
    expect(next).toBe(p);
  });
});
