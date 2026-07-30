// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

/**
 * In this repository `public/CHANGELOG.md` is LOAD-BEARING, which makes it a
 * sharper problem here than anywhere else in the suite.
 *
 * `ChangelogView` does not import changelog data at build time. It performs a
 * runtime `fetch('/CHANGELOG.md')` and renders whatever comes back. So the
 * public copy is not a served-but-unread artifact the way it is in SPERT
 * Scheduler and SPERT Forecaster — it is the only thing users ever see on the
 * changelog page. If it drifts from the root file, the app does not fail, log,
 * or look broken: it confidently renders an out-of-date changelog. If it goes
 * missing entirely, the page reads "No changelog available."
 *
 * Nothing else can catch that. The build does not read either file, no test
 * imports them, and the root `CHANGELOG.md` is what everyone edits. Scheduler's
 * copy — where the file is merely served — still managed to sit 43 releases
 * behind for five months before a guard like this one was added.
 *
 * If this fails, the fix is: cp CHANGELOG.md public/CHANGELOG.md
 */
describe('CHANGELOG.md ↔ public/CHANGELOG.md sync', () => {
  const rootPath = join(process.cwd(), 'CHANGELOG.md');
  const publicPath = join(process.cwd(), 'public/CHANGELOG.md');

  it('both the root changelog and its public copy exist', () => {
    expect(existsSync(rootPath)).toBe(true);
    expect(
      existsSync(publicPath),
      'public/CHANGELOG.md is missing — the changelog page fetches it at runtime ' +
        'and will render "No changelog available."',
    ).toBe(true);
  });

  it('the public copy is byte-identical to the root changelog', () => {
    const rootBuf = readFileSync(rootPath);
    const publicBuf = readFileSync(publicPath);

    if (!rootBuf.equals(publicBuf)) {
      const newestHeading = (buf: Buffer): string =>
        buf.toString('utf-8').match(/^## .*$/m)?.[0] ?? '(no version heading found)';

      throw new Error(
        'public/CHANGELOG.md has drifted from CHANGELOG.md, and this is the file ' +
          'users actually see.\n' +
          `  root:   ${rootBuf.length} bytes, newest entry ${newestHeading(rootBuf)}\n` +
          `  public: ${publicBuf.length} bytes, newest entry ${newestHeading(publicBuf)}\n` +
          'Fix with: cp CHANGELOG.md public/CHANGELOG.md',
      );
    }

    expect(publicBuf.equals(rootBuf)).toBe(true);
  });

  it('every version heading is one the renderer will show as a heading', () => {
    // MarkdownRenderer only treats a line as a version heading when it starts
    // with exactly '## '. An entry written any other way still appears, but as
    // body text in whatever block precedes it, silently losing its heading.
    const text = readFileSync(rootPath, 'utf-8');
    const headings = text.split('\n').filter((line) => line.startsWith('## '));

    expect(headings.length).toBeGreaterThan(0);

    const malformed = headings.filter(
      (line) => !/^## Version \d+\.\d+\.\d+ \(\d{4}-\d{2}-\d{2}\)$/.test(line),
    );

    expect(
      malformed,
      `these headings do not match '## Version X.Y.Z (YYYY-MM-DD)': ${malformed.join(' | ')}`,
    ).toEqual([]);
  });
});
