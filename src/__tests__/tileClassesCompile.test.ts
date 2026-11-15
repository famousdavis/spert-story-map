// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * v0.56.0 R-2: every class the Products page's tiles, dialogs and archive controls use compiles to
 * CSS against Story Map's own stylesheet. SPERT Forecaster's classes name theme tokens Story Map does
 * not define (`accent-spert-blue`, `text-spert-text-secondary`, …): copied raw they produce NO CSS
 * and nothing else notices (#75). Each candidate is compiled on its own compiler, because
 * Tailwind's `build()` is cumulative: a reading taken after another candidate reports false empties.
 * The must-find control proves the check can fail the way a copied class would.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { compile } from '@tailwindcss/node';
import * as tileColor from '../components/product/tile-color-styles';
import * as dashboard from '../components/product/dashboard-styles';
import * as buttons from '../components/product/button-styles';

const SRC = resolve(__dirname, '..');
const CSS = readFileSync(resolve(SRC, 'index.css'), 'utf8');
/** Markers that are meant to produce no CSS of their own. */
const MARKERS = new Set(['group/tile']);

function stringsOf(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (value && typeof value === 'object') return Object.values(value).flatMap(stringsOf);
  return [];
}
/** Every class these modules hand to `className`, plus the inline ones in the archive controls. */
const CANDIDATES = [...new Set(
  [...stringsOf(tileColor), ...stringsOf(dashboard), ...stringsOf(buttons), '-mt-1 mb-4 leading-[normal]']
    .flatMap(s => s.split(/\s+/)).filter(t => t && !MARKERS.has(t)),
)].sort();

let base = 0;
/** The CSS `candidate` adds over an empty build, on a fresh compiler. */
async function cssFor(candidate: string): Promise<number> {
  const compiler = await compile(CSS, { base: SRC, onDependency() {} });
  return compiler.build([candidate]).length - base;
}

beforeAll(async () => {
  base = (await compile(CSS, { base: SRC, onDependency() {} })).build([]).length;
}, 60_000);

describe('R-2: the tiles\' classes compile against Story Map\'s stylesheet', () => {
  it('must-find control: Forecaster\'s theme-token classes produce no CSS here, their values do', async () => {
    for (const bad of ['accent-spert-blue', 'text-spert-text-secondary', 'bg-spert-blue', 'border-spert-error', 'border-spert-blue']) {
      expect(await cssFor(bad), bad).toBe(0);
    }
    for (const good of ['accent-[#0070f3]', 'text-[#555]']) expect(await cssFor(good), good).toBeGreaterThan(0);
  }, 60_000);

  it('every candidate produces CSS', async () => {
    expect(CANDIDATES.length).toBeGreaterThan(150);
    const empty: string[] = [];
    for (const c of CANDIDATES) if ((await cssFor(c)) === 0) empty.push(c);
    expect(empty).toEqual([]);
  }, 120_000);
});
