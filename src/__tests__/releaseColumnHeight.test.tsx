// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * S9 (v0.58.0): Release Planning's columns, re-derived from the frame's numbers. Before, each column's card list
 * carried `max-h-[calc(100vh-280px)]` (Unassigned `-250px`), sized for the header and tabs above v0.57.0's frame and
 * holding a guess at the column header, whose height differs by release: on v0.57.0 every column ended 57 px below
 * the window at 1280 × 800, 1440 × 900 and 1920 × 1080. Now the whole column (header and list) is at most
 * `100vh − 244px`: the board's top, `CANVAS_TOP` 176 + the view's title row 28 + its `mb-6` 24 = 228 (measured 228),
 * plus the board's `pb-4` 16. The list takes what the header leaves and scrolls. The after-probe measures each column
 * ending 16 px above the window in Chrome.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import ReleasePlanningView from '../pages/ReleasePlanningView';
import { CANVAS_TOP, RELEASE_BOARD_TOP, RELEASE_COLUMN_MAX_HEIGHT } from '../lib/framePlace';
import { mountHosted } from './fixtures/productHost';
import { makeProduct, makeRib } from './fixtures/progressIntegrity';
import { req } from './testHelpers';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

describe('the board\'s numbers', () => {
  it('the board starts at CANVAS_TOP + the view\'s title row (28) + its mb-6 (24) = 228', () => {
    expect(CANVAS_TOP).toBe(176);
    expect(RELEASE_BOARD_TOP).toBe(228);
  });

  it('a column is at most the window less the board\'s top and its pb-4 (16): calc(100vh - 244px)', () => {
    expect(RELEASE_COLUMN_MAX_HEIGHT).toBe('calc(100vh - 244px)');
  });

  it('no column or list carries the old fixed max-heights', () => {
    const source = readFileSync(resolve(__dirname, '../components/releases/ReleaseColumn.tsx'), 'utf8');
    expect(source).not.toMatch(/max-h-\[calc/);
    expect(source).not.toMatch(/100vh-2[58]0px/);
  });
});

describe('every column carries it, and its list takes what the header leaves', () => {
  it('Unassigned and each release: the column is a flex column at the max-height, the header fixed, the list scrolling', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    mountHosted(ReleasePlanningView, makeProduct([makeRib('r1', [{ releaseId: 'R1', percentage: 100 }], []), makeRib('r2', [], [])]));
    const unassigned = req(screen.getByRole('heading', { level: 3, name: 'Unassigned' }).closest<HTMLElement>('[style]'), 'Unassigned column');
    const columns = [unassigned, ...Array.from(document.querySelectorAll<HTMLElement>('[style]'))
      .filter(el => el !== unassigned && el.style.maxHeight)];
    expect(columns.length).toBe(7); // Unassigned and the fixture's six releases
    for (const col of columns) {
      expect(col.style.maxHeight).toBe('calc(100vh - 244px)');
      const cls = (el: Element) => (el.getAttribute('class') ?? '').split(/\s+/);
      expect(cls(col)).toEqual(expect.arrayContaining(['flex', 'flex-col']));
      const [header, list] = Array.from(col.children);
      expect(cls(req(header, 'header'))).toContain('flex-none');
      expect(cls(req(list, 'list'))).toEqual(expect.arrayContaining(['flex-auto', 'overflow-y-auto', 'min-h-[60px]']));
    }
  });
});
