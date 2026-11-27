// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * N1 (FRAME26, v0.57.0): the SPERT® Suite app frame's stylesheet is vendored byte for byte, and imported once.
 *
 * `src/styles/spert-frame.css` is a copy of `spert-suite-docs/suite/frame/spert-frame.css` (contract §9.1). It is
 * never edited here: a change goes to the canonical copy, raises its `--sf-version`, and is re-vendored by every app
 * that has adopted it, one PR each, checked with `md5 -q`. This file pins the md5, so an edit in this repo alone
 * fails here first. It also pins how the file is used: imported exactly once, by `src/index.css`, OUTSIDE any
 * `@layer`, because an unlayered `sf-` rule is what beats every Tailwind utility on the same element.
 */
import { describe, it, expect } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';

const SRC = resolve(__dirname, '..');
const FRAME = resolve(SRC, 'styles/spert-frame.css');
/** The canonical copy's md5 at spert-suite-docs be37884, stylesheet version "4" (v0.59.0: the About page, `.sf-about`). */
const MD5 = '7f8e40a37b008027e06123fe13e1b2f8';
const IMPORT = '@import "./styles/spert-frame.css";';

/** Every source file under src/ that could import a stylesheet, tests aside. */
function sources(dir = SRC): string[] {
  return readdirSync(dir).flatMap(name => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sources(p);
    return /\.(?:css|ts|tsx|js|jsx|mjs|cjs)$/.test(name) ? [p] : [];
  });
}

describe('the vendored frame stylesheet (contract §9.1)', () => {
  it('is byte-identical to the canonical copy: md5 7f8e40a3…', () => {
    expect(createHash('md5').update(readFileSync(FRAME)).digest('hex')).toBe(MD5);
  });

  it('declares stylesheet version "4"', () => {
    expect(readFileSync(FRAME, 'utf8')).toMatch(/--sf-version:\s*"4";/);
  });

  it('src/index.css imports it exactly once, right after Tailwind, outside every @layer', () => {
    const css = readFileSync(resolve(SRC, 'index.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    expect(css.split(IMPORT).length - 1).toBe(1);
    const imports = Array.from(css.matchAll(/^@import\s+"([^"]+)";/gm), m => m[1]);
    expect(imports).toEqual(['tailwindcss', './styles/spert-frame.css']);
    // Unlayered: the import is at the top level, never inside `@layer … { … }` or `@import … layer(…)`.
    const before = css.slice(0, css.indexOf(IMPORT));
    expect(before.split('{').length).toBe(before.split('}').length);
    expect(css).not.toMatch(/spert-frame\.css"\s*layer/);
  });

  it('nothing else in src/ imports it (must-find control: the scan finds index.css)', () => {
    // An import in any form: CSS `@import`, a JS/TS `import`, or `require`. Comments that name the file do not count.
    const importsIt = /(?:@import\s+(?:url\()?["'][^"']*spert-frame\.css|import\s+(?:[^'"]*from\s+)?["'][^"']*spert-frame\.css|require\(\s*["'][^"']*spert-frame\.css)/;
    const importing = sources().filter(p => importsIt.test(readFileSync(p, 'utf8'))).map(p => relative(SRC, p));
    expect(importing).toEqual(['index.css']);
  });
});
