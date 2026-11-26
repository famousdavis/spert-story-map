// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * N11 (FRAME26, v0.57.0, D5): Story Map's thin scrollbars belong to its own scrolling panels, never to the page.
 *
 * Until v0.56.5 `src/index.css` styled `::-webkit-scrollbar` for every element, the root included. A styled root
 * scrollbar defeats the frame's `scrollbar-gutter: stable` where scrollbars are overlays (a default Mac): measured in
 * Chrome, a short page reserved nothing and a long page drew a 6 px bar, so the centred column moved 3 px (its right
 * edge 6 px) between a short screen and a long one. frame-check cannot see that, because it computes each page from its
 * own width. Scoped to `#root *`, the page's own scrollbar is the platform's: the column stays put with overlay
 * scrollbars, and with classic ones the gutter is reserved on every page. It must not be `body *`: frame-check's
 * classic pass measures the scrollbar width on a probe element it appends to `body`, and that must agree with the
 * root's. The measurements are in the v0.57.0 pull request.
 *
 * v0.58.0: the same rules also name `[data-thin-scrollbars] *`, for the Products page's dialogs, which DialogShell
 * portals to `body`, outside `#root`, where they had lost the thin scrollbar (15 px with classic scrollbars, against
 * 6 px in a Modal). The attribute sits on the portal's own root, so the root's scrollbar is still never styled.
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const CSS = readFileSync(resolve(__dirname, '../index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');

/** Every selector in index.css that names a `::-webkit-scrollbar` pseudo-element. */
const scrollbarSelectors = () =>
  Array.from(CSS.matchAll(/([^{}]*?::-webkit-scrollbar[^{]*)\{/g), m => (m[1] ?? '').trim())
    .flatMap(s => s.split(',').map(x => x.trim()))
    .filter(s => s.includes('::-webkit-scrollbar'));

describe('the thin scrollbar rule (D5)', () => {
  it('must-find control: index.css styles the scrollbar, its track, its thumb and the thumb on hover', () => {
    expect(scrollbarSelectors()).toEqual([
      '#root *::-webkit-scrollbar',
      '[data-thin-scrollbars] *::-webkit-scrollbar',
      '#root *::-webkit-scrollbar-track',
      '[data-thin-scrollbars] *::-webkit-scrollbar-track',
      '#root *::-webkit-scrollbar-thumb',
      '[data-thin-scrollbars] *::-webkit-scrollbar-thumb',
      '#root *::-webkit-scrollbar-thumb:hover',
      '[data-thin-scrollbars] *::-webkit-scrollbar-thumb:hover',
    ]);
  });

  it('every scrollbar selector is scoped to the app\'s own elements, so the root\'s scrollbar is never styled', () => {
    for (const s of scrollbarSelectors()) expect(s, s).toMatch(/^(?:#root|\[data-thin-scrollbars\]) \*::-webkit-scrollbar/);
  });

  it('the dialog shell\'s attribute is set in DialogShell alone (must-find control: the scan finds it), never on the root', () => {
    const SRC = resolve(__dirname, '..');
    const files = (dir: string): string[] => readdirSync(dir).flatMap(name => {
      const p = join(dir, name);
      if (statSync(p).isDirectory()) return name === '__tests__' ? [] : files(p);
      return /\.(?:tsx?|jsx?|html)$/.test(name) ? [p] : [];
    });
    const setters = files(SRC).filter(p => /data-thin-scrollbars/.test(readFileSync(p, 'utf8'))).map(p => relative(SRC, p));
    expect(setters).toEqual(['components/product/DialogShell.tsx']);
    const html = readFileSync(resolve(SRC, '../index.html'), 'utf8');
    expect(html).not.toMatch(/data-thin-scrollbars/);
  });
});
