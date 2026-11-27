// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * S8 (v0.58.0): Structure's theme colour picker was `z-50`, above the sticky navigation row (`.sf-nav--sticky`,
 * z-index 30, exception X3). Scrolled under the row it painted over it: on v0.57.0 the topmost element in the row's
 * band was the picker. It stacks below the row now (`z-20`), and still above the page. The after-probe scrolls it under
 * the row in Chrome and reads `elementFromPoint`.
 */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import StructureView from '../pages/StructureView';
import { mountHosted } from './fixtures/productHost';
import { makeProduct, makeRib } from './fixtures/progressIntegrity';
import { req } from './testHelpers';

const FRAME = readFileSync(resolve(__dirname, '../styles/spert-frame.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

/** The `z-index` a frame rule sets. */
function frameZ(selector: string): number {
  const at = FRAME.indexOf(`\n${selector} {`);
  if (at < 0) throw new Error(`spert-frame.css: no ${selector}`);
  return Number(req(/z-index:\s*(\d+)/.exec(FRAME.slice(at, FRAME.indexOf('}', at)))?.[1], `${selector} z-index`));
}

describe('Structure\'s colour picker stacks below the sticky navigation row (S8)', () => {
  it('the row is sticky at z-index 30 (must-find control: read from the vendored stylesheet)', () => {
    expect(frameZ('.sf-nav--sticky')).toBe(30);
  });

  it('the open picker\'s z-index is below the row\'s, and above the page (more than 0)', () => {
    vi.stubGlobal('matchMedia', () => ({ matches: false, addEventListener: () => {}, removeEventListener: () => {} }));
    mountHosted(StructureView, makeProduct([makeRib('r1', [], [], 'M')]));
    fireEvent.click(screen.getAllByTitle('Change theme color')[0] as HTMLElement);
    const swatch = screen.getAllByTitle('Change theme color')[0] as HTMLElement;
    const picker = req(swatch.parentElement?.querySelector<HTMLElement>('div.absolute'), 'the open picker');
    const z = (picker.getAttribute('class') ?? '').split(/\s+/).filter(c => /^z-\d+$/.test(c));
    expect(z).toHaveLength(1);
    const value = Number(req(z[0], 'z class').slice(2));
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThan(frameZ('.sf-nav--sticky'));
  });
});
