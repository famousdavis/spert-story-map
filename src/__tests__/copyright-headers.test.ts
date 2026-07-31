// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Files that legitimately carry no header, each with its reason.
 * Keep this short and explicit — never a pattern that could swallow future files.
 *
 * `src/vite-env.d.ts` is the sole entry and is a special case worth knowing: this
 * repository's copy DOES carry a conforming header, stamped by the March 2026
 * sweep, while the byte-identical copies in spert-ahp, spert-ssv and
 * spert-scheduler carry none. It is exempt because Vite scaffolds it rather than
 * a human authoring it, and it is not stripped because "never remove an existing
 * header" outranks tidiness. The guard skips it either way.
 */
const EXEMPT = new Map<string, string>([
  ['src/vite-env.d.ts', 'scaffolded by Vite, not hand-authored'],
]);

/** Non-vacuity floor — ~90% of the 182 files in scope today. */
const MIN_FILES = 163;

/** Scope clauses this repo contains. */
const CLAUSES: string[] = ['src-code', 'src-css', 'root-config', 'scripts', 'index.html'];

const CODE_EXT = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs']);

const LINE_1 = /^Copyright \(C\) \d{4} William W\. Davis, MSPM, PMP\. All rights reserved\.$/;
const LINE_2 = 'Licensed under the GNU General Public License v3.0.';
const LINE_3 = 'See LICENSE file in the project root for full license text.';

type Framing = 'slash' | 'block' | 'html';

/** Which scope clause a path belongs to, or null if out of scope. */
function clauseOf(path: string): string | null {
  if (EXEMPT.has(path)) return null;
  const ext = extname(path);
  if (path.startsWith('src/') && CODE_EXT.has(ext)) return 'src-code';
  if (path.startsWith('src/') && ext === '.css') return 'src-css';
  if (path.startsWith('functions/src/') && CODE_EXT.has(ext)) return 'functions-src';
  if (/^functions\/[^/]+$/.test(path) && CODE_EXT.has(ext)) return 'functions-root';
  if (/^(functions\/)?scripts\/[^/]+$/.test(path) && CODE_EXT.has(ext)) return 'scripts';
  if (!path.includes('/') && CODE_EXT.has(ext)) return 'root-config';
  if (path === 'index.html' || path === 'firestore.rules') return path;
  return null;
}

function framingFor(path: string): Framing {
  const ext = extname(path);
  if (ext === '.css') return 'block';
  if (ext === '.html') return 'html';
  return 'slash';
}

/** Strip comment framing so one comparison covers every accepted form. */
function strip(line: string): string {
  return line
    .replace(/^\s*(\/\/|\/\*|<!--|\*)\s?/, '')
    .replace(/\s*(\*\/|-->)\s*$/, '')
    .trim();
}

/**
 * Framing must suit the extension AND the comment must actually close.
 * Checked only after the three logical lines have matched, so "wrong framing"
 * is never reported for a file that simply has no header.
 *
 * The closure half is not decoration: `index.html` is the one file here that
 * neither `tsc` nor Vite parses, so a backfill bug emitting `<!--` with no
 * `-->` would swallow the whole document with nothing else to catch it.
 */
function framingProblem(
  l0: string,
  l1: string,
  l2: string,
  l3: string,
  framing: Framing,
): string | null {
  if (framing === 'slash') {
    if (!l0.trimStart().startsWith('//')) return 'expected // framing';
    if (!l1.trimStart().startsWith('//')) return 'header line 2 is not a // comment';
    if (!l2.trimStart().startsWith('//')) return 'header line 3 is not a // comment';
    return null;
  }
  if (framing === 'html') {
    if (!l0.trimStart().startsWith('<!--')) return 'expected <!-- --> framing';
    if (!l2.trimEnd().endsWith('-->')) return 'HTML comment is never closed';
    return null;
  }
  if (!l0.trimStart().startsWith('/*') || l0.trimStart().startsWith('/**')) {
    return 'expected /* */ framing (not /**)';
  }
  // Closer may sit at the end of line 3, or alone on line 4 (the ` * ` continuation form).
  if (!l2.trimEnd().endsWith('*/') && l3.trim() !== '*/') return 'block comment is never closed';
  return null;
}

/** null if the file is fine, otherwise a human-readable reason. */
function headerProblem(root: string, path: string): string | null {
  let text: string;
  try {
    text = readFileSync(join(root, path), 'utf-8');
  } catch {
    return 'in scope but unreadable';
  }
  const lines = text.split('\n');
  const start = (lines[0] ?? '').startsWith('#!') ? 1 : 0;
  const l0 = lines[start] ?? '';
  const l1 = lines[start + 1] ?? '';
  const l2 = lines[start + 2] ?? '';
  const l3 = lines[start + 3] ?? '';

  if (!LINE_1.test(strip(l0))) return 'no copyright header';
  if (strip(l1) !== LINE_2) return 'header line 2 does not match the template';
  if (strip(l2) !== LINE_3) return 'header line 3 missing (V0) or does not match';
  return framingProblem(l0, l1, l2, l3, framingFor(path));
}

let cache: { root: string; files: string[] } | null = null;

/**
 * Enumerate tracked AND untracked-but-not-ignored files, so a new unstaged
 * source file cannot pass locally and fail in CI. The cost is that an
 * uncommitted scratch file with a code extension under a scoped directory also
 * fails — gitignore it or give it a header.
 */
function scan(): { root: string; files: string[] } {
  if (cache) return cache;
  const root = execFileSync('git', ['rev-parse', '--show-toplevel'], {
    cwd: process.cwd(),
    encoding: 'utf-8',
  }).trim();
  const files = execFileSync(
    'git',
    ['ls-files', '--cached', '--others', '--exclude-standard'],
    { cwd: root, encoding: 'utf-8' },
  )
    .split('\n')
    .filter(Boolean)
    .filter((p) => clauseOf(p) !== null);
  cache = { root, files };
  return cache;
}

describe('copyright headers', () => {
  it('finds files to check, so an empty walk cannot pass vacuously', () => {
    expect(scan().files.length).toBeGreaterThanOrEqual(MIN_FILES);
  });

  it('sees exactly the scope clauses this repo is known to contain', () => {
    const found = new Set<string>();
    for (const file of scan().files) {
      const clause = clauseOf(file);
      if (clause !== null) found.add(clause);
    }
    expect([...found].sort()).toEqual([...CLAUSES].sort());
  });

  it('exempts only paths that still exist', () => {
    const { root } = scan();
    const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf-8' }).split('\n');
    expect([...EXEMPT.keys()].filter((key) => !tracked.includes(key))).toEqual([]);
  });

  it('every in-scope file carries the suite-standard header', () => {
    const { root, files } = scan();
    const offenders = files
      .map((file) => ({ file, problem: headerProblem(root, file) }))
      .filter((result) => result.problem !== null);
    expect(offenders).toEqual([]);
  });
});
