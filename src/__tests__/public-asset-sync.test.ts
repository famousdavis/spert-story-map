// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { createHash } from 'node:crypto';
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, it, expect } from 'vitest';

/**
 * Two PDFs live in this repository twice: once at the root, where they are
 * browsable alongside the source, and once under `public/`, which is the copy
 * Vite ships and the copy `AboutView` links to. Only the second one reaches a
 * user.
 *
 * Nothing held them together, and they drifted. `static-assets.test.ts` asserts
 * that every asset linked from source *exists* under `public/`, which is a
 * different question — it passes happily while the two copies say different
 * things. The build reads neither file, no test imports them, and a PDF diff is
 * invisible in review: `git show` renders binary, so a commit touching one copy
 * looks identical to a commit touching both.
 *
 * That is exactly how it failed. The Connect AI Guide was refreshed under
 * `public/` in PR #117 and again in PR #120; the root copy was updated in
 * neither, and sat at v0.48.0 vs v0.46.0 — two releases stale — until this
 * guard was written in August 2026. `CHANGELOG.md` had a dedicated sync guard
 * for precisely this reason and the PDFs did not.
 *
 * `CHANGELOG.md` is deliberately absent from the list below: it has a sharper
 * guard of its own in `changelog-public-sync.test.ts`, which also checks the
 * heading form the renderer requires.
 */
const MIRRORED_ASSETS = [
  'SPERTStoryMap_Quick_Reference_Guide.pdf',
  'SPERTStoryMap_Connect_AI_Guide.pdf',
];

const root = process.cwd();
const digest = (buf: Buffer): string => createHash('sha256').update(buf).digest('hex').slice(0, 12);

describe('root ↔ public/ asset sync', () => {
  it('registers every root-level PDF', () => {
    // A root-level PDF exists only to mirror one under `public/`. A new pair
    // added without a line in MIRRORED_ASSETS would be unguarded, and would
    // drift the same silent way the Connect AI Guide did.
    const rootPdfs = readdirSync(root).filter((name) => name.endsWith('.pdf'));

    // Guards the guard: if the readdir filter ever matches nothing, every
    // assertion below would pass while checking nothing at all.
    expect(rootPdfs.length).toBeGreaterThan(0);

    const unregistered = rootPdfs.filter((name) => !MIRRORED_ASSETS.includes(name));

    expect(
      unregistered,
      `these root PDFs are not covered by the sync guard: ${unregistered.join(', ')}. ` +
        'Add them to MIRRORED_ASSETS, or delete them if they are not mirrors.',
    ).toEqual([]);
  });

  it.each(MIRRORED_ASSETS)('%s exists in both locations', (name) => {
    expect(existsSync(join(root, name)), `${name} is missing from the repository root`).toBe(true);
    expect(
      existsSync(join(root, 'public', name)),
      `public/${name} is missing — this is the copy the app serves, so the ` +
        'About page link now 404s.',
    ).toBe(true);
  });

  it.each(MIRRORED_ASSETS)('%s is byte-identical in both locations', (name) => {
    const rootBuf = readFileSync(join(root, name));
    const publicBuf = readFileSync(join(root, 'public', name));

    if (!rootBuf.equals(publicBuf)) {
      throw new Error(
        `${name} has drifted between the repository root and public/.\n` +
          `  root:      ${rootBuf.length} bytes, sha256 ${digest(rootBuf)}…\n` +
          `  public/:   ${publicBuf.length} bytes, sha256 ${digest(publicBuf)}…\n` +
          'public/ is the copy Vite ships and AboutView links to, so check it first — ' +
          'but confirm which is current before copying, rather than assuming a ' +
          'direction. Overwriting the newer copy with the stale one also makes this ' +
          'test pass.',
      );
    }

    expect(publicBuf.equals(rootBuf)).toBe(true);
  });
});
