// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * A citation to another repository must not be written as a bare basename.
 *
 * ── WHY THIS EXISTS ─────────────────────────────────────────────────────────
 * Seven consecutive corrections to the Forecaster handoff introduced a defect
 * through their own fix. The seventh was this: v0.52.17 wrote
 * "`MAX_MILESTONES` at `constants.ts:39`" meaning spert-forecaster's file —
 * but THIS repo has `src/lib/constants.ts`, and its line 39 is a real, exported
 * `NOTES_MAX = 2000`. A reader opens the obvious local file and lands somewhere
 * plausible and wrong. That is the dangerous kind of wrong: it does not
 * announce itself.
 *
 * The rule that ends the regress has to be owned by a check, not by a reader.
 * Six reviews did not catch it; the seventh was caught only by a second pair of
 * eyes that happened to look.
 *
 * ── WHY THE OBVIOUS RULE IS NOT CHECKABLE ───────────────────────────────────
 * The natural statement is "a citation to a file whose basename also exists in
 * this repo must carry a full path." It is right for a human and USELESS as a
 * check: deciding whether a citation means the foreign file requires reading
 * intent, and that is undecidable exactly when the basename collides — the case
 * the rule exists for. Measured: 26 of 27 citations in this repo are bare
 * basenames, and ~24 are ordinary LOCAL references that are perfectly clear.
 * Enforced literally, that rule fires on all of them.
 *
 * ── WHAT IS CHECKED INSTEAD ─────────────────────────────────────────────────
 * Scope is DERIVED, not listed: any source file that talks about the other repo
 * (matches /spert-forecaster|Forecaster/). A new cross-repo file is covered the
 * day it is written, with nothing to remember. Inside that scope every citation
 * must carry a path separator, EXCEPT a self-citation (a file pointing at its
 * own lines), which cannot be ambiguous.
 *
 * This is narrower than the human rule and strictly decidable. It does not
 * protect a bare local citation in a file that never mentions Forecaster — by
 * design; nothing there crosses a boundary.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, basename } from 'node:path';

const SRC = join(import.meta.dirname, '..');

/** Anything shaped like `some/path/file.ts:123` or `file.tsx:12-34`. */
const CITATION = /([A-Za-z0-9_./-]+\.(?:ts|tsx)):(\d+(?:-\d+)?)/g;
/** A file is in scope if it discusses the other repo at all. */
const CROSS_REPO = /spert-forecaster|Forecaster/;

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(name) ? [full] : [];
  });
}

export interface BareCitation {
  readonly file: string;
  readonly line: number;
  readonly citation: string;
}

/** Bare (separator-less) citations in cross-repo files, excluding self-citations. */
export function findBareCrossRepoCitations(files: readonly string[]): BareCitation[] {
  const out: BareCitation[] = [];
  for (const file of files) {
    // This file is the one source that cannot be scanned by itself: it must
    // contain example citations of both the illegal and the legal form for its
    // own control to mean anything. Excluded deliberately, and it is the only
    // exclusion — a growing skip list would hollow the guard out.
    if (basename(file) === 'crossRepoCitations.test.ts') continue;
    const text = readFileSync(file, 'utf-8');
    if (!CROSS_REPO.test(text)) continue;
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(CITATION)) {
        const cited = m[1];
        if (!cited || cited.includes('/')) continue;
        if (cited === basename(file)) continue; // self-citation: unambiguous
        out.push({ file, line: i + 1, citation: m[0] });
      }
    });
  }
  return out;
}

describe('cross-repo citations carry a path', () => {
  const files = sourceFiles(SRC);

  it('finds source to check at all (guards against a vacuous pass)', () => {
    expect(files.length).toBeGreaterThan(50);
    expect(files.filter((f) => CROSS_REPO.test(readFileSync(f, 'utf-8'))).length)
      .toBeGreaterThan(5);
  });

  it('no cross-repo file cites a bare basename', () => {
    const bare = findBareCrossRepoCitations(files);
    expect(
      bare.map((b) => `${b.file.replace(SRC, 'src')}:${b.line} → ${b.citation}`),
    ).toEqual([]);
  });

  // ── The control must exercise the DISCRIMINATOR, not just the answer ──────
  // Measured twice in this campaign: a control that only confirms "rows of the
  // expected class exist" passes while the classifier is broken for the other
  // class. So assert BOTH directions on a synthetic file.
  it('flags a bare foreign citation and spares the two legitimate forms', () => {
    const tmp = join(SRC, '__tests__', 'fixtures', '__citation_probe__.ts');
    // Not written to disk — exercise the matcher directly on known input.
    const probe = (text: string): number => {
      const hits: string[] = [];
      text.split('\n').forEach((line) => {
        for (const m of line.matchAll(CITATION)) {
          const cited = m[1];
          if (!cited || cited.includes('/')) continue;
          if (cited === basename(tmp)) continue;
          hits.push(m[0]);
        }
      });
      return hits.length;
    };
    // MUST flag: bare basename naming another repo's file.
    expect(probe('// Forecaster: see constants.ts:39')).toBe(1);
    // MUST NOT flag: full path.
    expect(probe('// Forecaster: spert-forecaster/src/features/forecast/constants.ts:39')).toBe(0);
    // MUST NOT flag: self-citation.
    expect(probe('// Forecaster: __citation_probe__.ts:12')).toBe(0);
  });
});
