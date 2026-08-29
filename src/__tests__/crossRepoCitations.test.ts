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

export interface Source {
  readonly path: string;
  readonly text: string;
}

/**
 * Every separator-less citation inside a cross-repo file.
 *
 * ⚠️ Takes SOURCES, not paths, so the control below can drive THIS function
 * rather than a replica of it. v0.52.18's control defined its own inline copy
 * of this logic: gutting this function to `return []` left all three tests
 * green, so the guard could go vacuous with nothing red. That is the exact
 * failure the control exists to prevent, one level up — it proved a copy of the
 * classifier worked, not the classifier.
 *
 * ⚠️ There is deliberately NO self-citation exemption. v0.52.18 exempted
 * `cited === basename(file)` on the reasoning that a file citing its own lines
 * cannot be ambiguous. That is false in exactly one case — when the FOREIGN
 * file shares the basename — so the exemption fired for the collision it was
 * meant to catch. And the collision is not rare: 26 basenames exist in BOTH
 * repos, `constants.ts`, `import-utils.ts`, `useImportState.ts` and `storage.ts`
 * among them. Requiring a path on self-citations too costs two lines in
 * `aiOps.ts` and removes an undecidable predicate from the rule.
 */
export function findBareCrossRepoCitations(sources: readonly Source[]): BareCitation[] {
  const out: BareCitation[] = [];
  for (const { path, text } of sources) {
    // The guard's own file is the single exclusion: it must contain examples of
    // both the legal and the illegal form for its control to mean anything.
    if (basename(path) === 'crossRepoCitations.test.ts') continue;
    if (!CROSS_REPO.test(text)) continue;
    text.split('\n').forEach((line, i) => {
      for (const m of line.matchAll(CITATION)) {
        const cited = m[1];
        if (!cited || cited.includes('/')) continue;
        out.push({ file: path, line: i + 1, citation: m[0] });
      }
    });
  }
  return out;
}

describe('cross-repo citations carry a path', () => {
  const sources: Source[] = sourceFiles(SRC).map((path) => ({
    path,
    text: readFileSync(path, 'utf-8'),
  }));

  it('finds source to check at all (guards against a vacuous pass)', () => {
    expect(sources.length).toBeGreaterThan(50);
    expect(sources.filter((s) => CROSS_REPO.test(s.text)).length).toBeGreaterThan(5);
  });

  it('no cross-repo file cites a bare basename', () => {
    expect(
      findBareCrossRepoCitations(sources).map(
        (b) => `${b.file.replace(SRC, 'src')}:${b.line} → ${b.citation}`,
      ),
    ).toEqual([]);
  });

  // ── The control drives the REAL function, in every direction ──────────────
  // Measured three times in this campaign: a control that exercises a copy, or
  // only the class you expect, passes while the shipped classifier is broken.
  describe('the shipped finder itself', () => {
    const probe = (text: string) => findBareCrossRepoCitations([{ path: 'src/lib/probe.ts', text }]);

    it('FLAGS a bare basename in a cross-repo file', () => {
      expect(probe('// Forecaster: see constants.ts:39')).toHaveLength(1);
    });

    it('SPARES a full path', () => {
      expect(
        probe('// Forecaster: spert-forecaster/src/features/forecast/constants.ts:39'),
      ).toHaveLength(0);
    });

    it('SPARES a file outside cross-repo scope — the scope discriminator', () => {
      expect(probe('// unrelated note: constants.ts:39')).toHaveLength(0);
    });

    it('FLAGS a self-citation — the v0.52.18 exemption is gone on purpose', () => {
      expect(probe('// Forecaster: probe.ts:12')).toHaveLength(1);
    });
  });
});
