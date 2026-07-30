#!/usr/bin/env node
// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Typecheck ratchet.
 *
 * WHY THIS EXISTS AND WHY IT IS NOT SIMPLY `tsc -b`
 *
 * This repository's `build` script is a bare `vite build`, which strips types
 * without checking them, and until v0.49.5 there was no `typecheck` script at
 * all and no CI. So nothing — not the build, not a test, not a lint run, not a
 * deploy — had ever run `tsc` against this codebase.
 *
 * The first run found **2,183 errors across 77 files**. Roughly 1,720 are in
 * `src/__tests__`; about 460 are in production source. `tsconfig.app.json` sets
 * `strict`, `noUnusedLocals`, `noUnusedParameters` and `noUncheckedIndexedAccess`
 * — an aspirational configuration the code was never held to, because nothing
 * ever enforced it. (`noUncheckedIndexedAccess` alone accounts for ~360 of them.)
 *
 * None of that is a reason to keep shipping blind, and none of it can be fixed
 * in a release whose purpose is to install a gate. So this holds the line
 * instead: the count may not grow. It is the same discipline already used for
 * ESLint in SPERT Scheduler — gate on the number, not the exit code.
 *
 * `tsc -b` is deliberately NOT wired into `build`. Doing that today would fail
 * the Vercel deploy on every push.
 *
 * The ratchet only turns one way. Fixing errors fails this check too, with a
 * message telling you to lower the number — that is intentional, so progress
 * gets recorded instead of quietly leaving headroom for regressions.
 */

import { execSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
const BASELINE_PATH = join(ROOT, 'typecheck-baseline.json')

const baseline = JSON.parse(readFileSync(BASELINE_PATH, 'utf-8'))

let output = ''
try {
  output = execSync('npx tsc -b --force', { cwd: ROOT, encoding: 'utf-8', stdio: 'pipe' })
} catch (err) {
  output = `${err.stdout ?? ''}${err.stderr ?? ''}`
}

// tsc error lines start at column 0 with a file path; continuation lines are
// indented. Counting only unindented `error TS####` lines counts each error once.
const errorLines = output.split('\n').filter((line) => /^\S.*error TS\d+/.test(line))
const count = errorLines.length

const byFile = new Map()
for (const line of errorLines) {
  const file = line.split('(')[0]
  byFile.set(file, (byFile.get(file) ?? 0) + 1)
}

console.log(`typecheck: ${count} errors across ${byFile.size} files (baseline ${baseline.errors})`)

if (count > baseline.errors) {
  const worst = [...byFile.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)

  console.error(
    `\n✗ Type errors increased by ${count - baseline.errors}: ${baseline.errors} → ${count}.\n` +
      '  New type errors were introduced. Fix them — do not raise the baseline.\n' +
      '\n  Files with the most errors right now:\n' +
      worst.map(([file, n]) => `    ${String(n).padStart(5)}  ${file}`).join('\n') +
      '\n\n  Full detail: npm run typecheck\n',
  )
  process.exit(1)
}

if (count < baseline.errors) {
  console.error(
    `\n✗ Type errors decreased: ${baseline.errors} → ${count}. Good — now record it.\n` +
      `  Set "errors" to ${count} in typecheck-baseline.json so the gain cannot be lost again.\n`,
  )
  process.exit(1)
}

console.log('✓ typecheck at accepted baseline')
