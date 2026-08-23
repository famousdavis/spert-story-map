#!/usr/bin/env node
// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Guarded Stryker runner.
 *
 * ⚠️ The reason this wrapper exists: a mutation run that FAILS TO START emits no
 * survivors and no score. Read casually — or scraped for "survivors: 0" — that is
 * indistinguishable from a perfect result. The failure mode is silent and flatters
 * you, which is the worst combination.
 *
 * So this script never trusts the exit code alone. It re-reads the JSON report and
 * refuses to report success unless mutants were actually generated AND actually
 * executed. Three distinct ways a run can be vacuous, all caught here:
 *
 *   1. No report written at all             -> Stryker died before reporting.
 *   2. Report written, zero mutants         -> `mutate` globs matched nothing.
 *   3. Mutants generated, none executed     -> every mutant is NoCoverage /
 *      CompileError / RuntimeError / Ignored, i.e. not one of them was ever run
 *      against the suite.
 *
 * Usage:  node scripts/mutation-guard.mjs [extra stryker args...]
 *         npm run mutate
 */

import { spawnSync } from 'node:child_process';
import { readFileSync, existsSync, rmSync } from 'node:fs';
import path from 'node:path';

const REPORT = path.resolve('reports/mutation/mutation.json');

function fail(msg) {
  console.error(`\n\x1b[31m\x1b[1mMutation guard FAILED\x1b[0m — ${msg}\n`);
  process.exit(1);
}

const args = process.argv.slice(2);

// ⚠️ Delete any previous report BEFORE running. Without this the guard has the
// exact hole it exists to close: a run that dies before reporting leaves the
// last successful report on disk, and every assertion below would then pass
// against stale numbers from a different run. The report must be an artifact of
// THIS invocation or of nothing.
rmSync(REPORT, { force: true });
console.log(`\x1b[1mRunning Stryker\x1b[0m${args.length ? ` (${args.join(' ')})` : ''} …\n`);

const run = spawnSync('npx', ['stryker', 'run', ...args], {
  stdio: 'inherit',
  encoding: 'utf8',
});

// Deliberately NOT an early exit on a non-zero code. Stryker exits non-zero when a
// score threshold breaks, which is a real result with a real report; we still want
// the numbers. The guard below is what decides whether the run meant anything.
const exitCode = run.status;

if (!existsSync(REPORT)) {
  fail(
    `no report at ${path.relative(process.cwd(), REPORT)} (stryker exit ${exitCode}). ` +
      'The run did not reach the reporting stage — treat this as NO RESULT, not as zero survivors.',
  );
}

let report;
try {
  report = JSON.parse(readFileSync(REPORT, 'utf8'));
} catch (err) {
  fail(`report at ${REPORT} is not valid JSON: ${err.message}`);
}

const counts = {};
let total = 0;
for (const file of Object.values(report.files ?? {})) {
  for (const mutant of file.mutants ?? []) {
    counts[mutant.status] = (counts[mutant.status] ?? 0) + 1;
    total += 1;
  }
}

if (total === 0) {
  fail(
    'the report contains ZERO mutants. The `mutate` globs matched nothing — ' +
      'a run over an empty scope is not a passing run, it is no run at all.',
  );
}

const killed = counts.Killed ?? 0;
const survived = counts.Survived ?? 0;
const timeout = counts.Timeout ?? 0;
const noCoverage = counts.NoCoverage ?? 0;
const compileError = counts.CompileError ?? 0;
const runtimeError = counts.RuntimeError ?? 0;
const ignored = counts.Ignored ?? 0;

// "Executed" means the suite genuinely ran against the mutant and returned a
// verdict. NoCoverage does NOT count: it records that no test reached the mutant,
// so the suite never ran for it, and absence of a run cannot evidence a working
// harness. An ALL-NoCoverage run is therefore vacuous however it arose — every
// mutant reads "untested", the score reads 0.00%, and that is precisely the
// flattering-and-silent result this wrapper exists to refuse.
// ⚠️ NoCoverage still belongs in the SCORE denominator below, and that is not an
// inconsistency: there it is a real verdict ABOUT THE CODE, here it is an absence
// of evidence ABOUT THE RUN. Two questions. Do not collapse them into one sum.
const executed = killed + survived + timeout;
if (executed === 0) {
  fail(
    `${total} mutants were generated but NONE were executed against the suite ` +
      `(NoCoverage ${noCoverage}, CompileError ${compileError}, ` +
      `RuntimeError ${runtimeError}, Ignored ${ignored}). ` +
      'Not one mutant produced a verdict from a real test run — treat this as NO ' +
      'RESULT, not as a clean one.',
  );
}

const denom = killed + timeout + survived + noCoverage;
const denomCovered = killed + timeout + survived;
const score = denom ? ((killed + timeout) / denom) * 100 : 0;
const scoreCovered = denomCovered ? ((killed + timeout) / denomCovered) * 100 : 0;

console.log(`\n\x1b[1mMutation guard\x1b[0m`);
console.log(`  total mutants     ${total}`);
console.log(`  killed            ${killed}`);
console.log(`  survived          ${survived}`);
console.log(`  timeout           ${timeout}`);
console.log(`  no coverage       ${noCoverage}`);
console.log(`  compile error     ${compileError}`);
console.log(`  runtime error     ${runtimeError}`);
console.log(`  ignored           ${ignored}`);
console.log(`  \x1b[1mmutation score    ${score.toFixed(2)}%\x1b[0m  (covered: ${scoreCovered.toFixed(2)}%)`);
console.log(`  stryker exit      ${exitCode}`);
console.log(`\n\x1b[32m\x1b[1mMutation guard passed\x1b[0m — the run produced real verdicts.\n`);
