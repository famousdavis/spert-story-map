// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Mutation testing configuration.
//
// Run with `npm run mutate`, which goes through scripts/mutation-guard.mjs.
// ⚠️ Do NOT reach past the guard for a bare `npx stryker run`: a mutation run that
// fails to START emits no survivors and no score, which is indistinguishable from a
// perfect result. The guard is the part that tells those apart.
//
// ⚠️ `npm run mutate` is a MEASUREMENT, not a gate. It is deliberately absent from
// shipgate.config.json and carries no score threshold. Wiring it into the ship gate
// would be a separate, deliberate decision.
//
// Do not commit Stryker output directories — `.stryker-tmp/` and `reports/` are
// gitignored, and both are also excluded from vitest and ESLint. See the note in
// eslint.config.ts for why that second exclusion matters here specifically.

/** @type {import('@stryker-mutator/core').PartialStrykerOptions} */
export default {
  packageManager: 'npm',

  // "json" writes the machine-readable survivor list (file, line, mutator, status),
  // which is how a run is compared against a recorded baseline rather than eyeballed.
  // Bundled in @stryker-mutator/core; no plugin install.
  // ⚠️ A CLI `--reporters` flag REPLACES this list rather than adding to it — same
  // semantics as `--mutate`. Dropping "json" silently removes the file every
  // comparison depends on, and the guard throws a named error for exactly that case.
  reporters: ['html', 'clear-text', 'progress', 'json'],

  testRunner: 'vitest',
  checkers: ['typescript'],

  // ⚠️ THIS MUST BE THE CONFIG THAT ACTUALLY GOVERNS src/**, AND IT IS TWO-SIDED.
  // Verified by rejection rather than by reading: an injected type error in
  // src/lib/aiOps.ts is caught by tsconfig.app.json (exit 2) and seen by NEITHER
  // tsconfig.json (a pure solution file — `files: []`, so it checks nothing) nor
  // tsconfig.node.json (config files only).
  //
  //   · Point it at a config that does not cover the targets and the checker
  //     validates nothing — non-compiling mutants are then accepted and reported as
  //     SURVIVORS, which makes the tests look weak rather than looking broken. That
  //     direction does not get audited.
  //   · Point it at a config that EXCLUDES a mutate target and the checker crashes on
  //     the first mutant instead ("no watcher is registered for it").
  //
  // tsconfig.app.json satisfies both: it includes src/**/*.ts(x) with no `exclude`,
  // so every target below is inside its program.
  //
  // ⚠️ FRAGILITY, stated so it is not misdiagnosed as a Stryker fault: because there
  // is no `exclude`, src/__tests__ is inside that program too, and the checker
  // compiles the WHOLE program before running a single mutant. Any type error
  // anywhere — including in a test file — is a hard init blocker. This repo is at
  // zero type errors, which is the enabling condition, not a permanent one.
  tsconfigFile: 'tsconfig.app.json',

  // The 21 files in src/lib/** at or above 70% branch coverage (90.24% aggregate,
  // 1026/1137 branches), measured 2026-08-16.
  //
  // ⚠️ ENUMERATED DELIBERATELY RATHER THAN GLOBBED. A glob would silently re-include
  // a file the day its coverage moves. This is a MEASURED SUBSET, not a rule — the
  // other 20 files in src/lib/** are out for two different reasons: 13 are below the
  // coverage floor (8 of them at zero, where mutation would rediscover that the code
  // is untested), and 7 are branch-free constants modules with no rule content to
  // mutate. Those seven are at 100% coverage; they are excluded on rule-content
  // grounds, NOT coverage grounds, so nobody re-includes them when a test lands.
  mutate: [
    'src/lib/aiOps.ts',
    'src/lib/productTransforms.ts',
    'src/lib/validateProduct.ts',
    'src/lib/calculations.ts',
    'src/lib/progressViewHelpers.ts',
    'src/lib/exportForForecaster.ts',
    'src/lib/exportForExcel.ts',
    'src/lib/progressMutations.ts',
    'src/lib/invitationErrors.ts',
    'src/lib/ribCardColors.ts',
    'src/lib/aiSnapshot.ts',
    'src/lib/formatDate.ts',
    'src/lib/migration.ts',
    'src/lib/ribHelpers.ts',
    // ⚠️ firestoreUtils.ts has NO direct test. Its 80% coverage comes only through
    // firestoreDriver.ts and AuthProvider.tsx (both at zero coverage, so neither can
    // kill anything) and migration.ts. migration.test.ts is therefore its entire
    // killing power. Read its survivors as ABSENT tests rather than weak ones — its
    // profile is not comparable to the other twenty.
    'src/lib/firestoreUtils.ts',
    'src/lib/sortByOrder.ts',
    'src/lib/themeColors.ts',
    'src/lib/settingsMutations.ts',
    'src/lib/signOutCleanup.ts',
    'src/lib/auth-name.ts',
    'src/lib/driverCleanupRegistry.ts',
    // Added v0.52.5. 100% statements/branches/functions/lines, and it is pure rule
    // content — it is the SINGLE predicate deciding whether the destructive v1→v2
    // migration runs, after four inline copies of that decision disagreed and the
    // cloud silently zeroed progress history. Exactly the kind of file where a
    // surviving mutant would matter.
    'src/lib/schemaVersion.ts',
  ],

  // Run only the tests that cover the mutated files. ⚠️ Omitting this reports every
  // mutant as NoCoverage — "untested" rather than "misconfigured".
  vitest: {
    configFile: 'vitest.stryker.config.ts',
  },

  // ⚠️ REQUIRED — DO NOT REMOVE ON THE GROUNDS THAT A CONTROL RUN WAS CLEAN.
  // With unlimited test-runner reuse, mutant activation in reused vitest workers can
  // go stale: the run exits 0 while nearly every mutant "survives", INCLUDING mutants
  // whose covering tests directly assert the mutated behaviour. That failure reports
  // as good news, which is the worst combination.
  //
  // Observed once in the suite (Stryker 9.6.1 + vitest-runner + Vitest 4.1.6, Node
  // 24): one file scored 10.07% with default reuse and 84.21% with reuse 1, while a
  // control file scored 100% either way. Two sibling repos ran their own controls and
  // it did NOT reproduce in either. This repo is on Vitest 4.1.5, not 4.1.6.
  //
  // The line stays regardless: the scoped suite runs in about a second, so the cost is
  // noise, and the failure it prevents is silent and arrives disguised as a good
  // score. A clean control is a clean control on one file on one day, and the
  // toolchain moves. If a score ever looks like mass survival of obviously-killable
  // mutants, suspect this first — and delete the incremental file below, because a
  // poisoned cache replays the old false "Survived" results after the config is fixed.
  maxTestRunnerReuse: 1,

  // ⚠️ NOTHING IS EXCLUDED, AND THAT IS A DECISION RATHER THAN AN OMISSION.
  //
  // The suite does not agree on this. Two sibling repos exclude StringLiteral and
  // ObjectLiteral; a third excludes nothing. Note that the two agreeing carry
  // byte-identical comments, so that is one decision replicated, not two independent
  // ones. There is no convention to inherit here — decide it per repo.
  //
  // The case FOR excluding: string-content changes often produce equivalent mutants,
  // and empty-object mutations rarely affect behaviour. Real, and it buys a cleaner
  // number.
  //
  // The case AGAINST, which decides it here: this repo writes short string labels
  // (`op`, `entity`) into `_changeLog`, an exported provenance record. A mutated
  // label is not an equivalent mutant — it is silent corruption of data that leaves
  // the app, and the file where that matters most (aiOps.ts) is the single
  // highest-value target in the list above. A sibling repo measured exactly this
  // class: fifteen StringLiteral survivors that turned out to be provenance labels.
  //
  // ⚠️ The asymmetry is what settles it. Excluding hides a class PERMANENTLY AND
  // INVISIBLY. Including produces equivalent mutants that can be classified EQUIV
  // with a stated reason, at classification time, where the judgement is visible.
  // You can always exclude later with evidence; you cannot recover a class you never
  // measured.
  //
  // ⚠️ THE COST, ACCEPTED EXPLICITLY: a wider mutator set means decomposition shrinks
  // the denominator, because new helper returns are object literals. A score that
  // FALLS after a refactor while absolute `Survived` holds is arithmetic, not a
  // regression. Gate any comparison on whether the survivor delta RECONCILES, never
  // on the score alone.

  // Half the available CPUs. ⚠️ Higher concurrency thrashes and inflates `Timeout`,
  // which counts as DETECTED — so it produces a faster run with a BETTER score for
  // entirely the wrong reason.
  concurrency: 2,
  timeoutMS: 10000,
  timeoutFactor: 2.5,

  // ⚠️ LOAD-BEARING FOR scripts/mutation-guard.mjs, WITH NO COMPILE-TIME LINK.
  // That script reads `reports/mutation/mutation.json` as a hardcoded path (see the
  // note at its top). Changing this value makes the guard read a path that is not
  // there, and it will report a missing report rather than a wrong directory. The two
  // are a hand-maintained pair; change them together.
  reportsDirectory: 'reports/mutation',
  htmlReporter: {
    fileName: 'reports/mutation/mutation-report.html',
  },

  // Speed while iterating. ⚠️ MUST be cleared for any run intended for COMPARISON —
  // delete reports/mutation/.stryker-incremental.json first, or the run replays
  // cached verdicts from a different scope.
  incremental: true,
  incrementalFile: 'reports/mutation/.stryker-incremental.json',
}
