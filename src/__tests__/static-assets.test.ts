// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { describe, it, expect } from 'vitest';

/**
 * The app hands users static files out of `public/` — the Quick Reference Guide
 * and Connect AI Guide PDFs, favicons, and the changelog the page fetches at
 * runtime. Nothing holds the link and the file together: rename or drop one of
 * them and the build passes, ESLint passes, every type check passes, and the
 * link 404s in the user's face.
 *
 * This walks the source for root-relative asset references and asserts each one
 * resolves. It is deliberately a source scan rather than a component render, so
 * it covers every link in the app rather than only the ones a test happens to
 * mount.
 *
 * Only root-relative literals are checked. External URLs — the ToS and Privacy
 * PDFs are served from spertsuite.com — are out of scope, because asserting on
 * them here would make this suite depend on another repository's deploy.
 */
const ASSET_HREF = /['"`](\/[A-Za-z0-9._~/-]+\.(?:pdf|md|png|jpg|jpeg|svg|ico|csv|webp))['"`]/g;

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

describe('static assets referenced from source exist in public/', () => {
  const root = process.cwd();
  const references = new Map<string, string[]>();

  for (const file of sourceFiles(join(root, 'src'))) {
    const text = readFileSync(file, 'utf-8');
    for (const match of text.matchAll(ASSET_HREF)) {
      const href = match[1];
      if (href === undefined) continue;
      const list = references.get(href) ?? [];
      list.push(relative(root, file));
      references.set(href, list);
    }
  }

  it('finds at least one referenced asset, so the scan is doing something', () => {
    // Guards the guard: a regex that silently matches nothing would pass every
    // assertion below while checking nothing at all.
    expect(references.size).toBeGreaterThan(0);
  });

  it('resolves every referenced asset in public/', () => {
    const missing: string[] = [];

    for (const [href, files] of references) {
      if (!existsSync(join(root, 'public', href))) {
        missing.push(`${href} — referenced from ${files.join(', ')}`);
      }
    }

    expect(missing, `missing from public/:\n  ${missing.join('\n  ')}`).toEqual([]);
  });
});
