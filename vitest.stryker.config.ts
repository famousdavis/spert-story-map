// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Scoped vitest config for Stryker mutation testing.
//
// Stryker runs the suite once per mutant, so running all 40 test files against
// every mutant is unusably slow. This config lists ONLY the tests that exercise
// the files in stryker.config.mjs's `mutate` list.
//
// ⚠️ FORGETTING TO POINT STRYKER AT THIS FILE reports every mutant as `NoCoverage`,
// which reads as "the code is untested" rather than "the runner was misconfigured".
// The wiring lives at `vitest.configFile` in stryker.config.mjs.
//
// ⚠️ DO NOT ADD TEST FILES HERE WITHOUT RE-RECORDING THE BASELINE.
// A comparison is only valid while the killing power on both sides is the same.
// Adding a test gives a later run more killing power than the baseline it is
// measured against, which masks exactly the survivors this scope exists to expose.
// New tests are good; adding them to a scoped COMPARISON config invalidates the
// comparison. Re-record the baseline in the same change, or leave them out.
//
// This repo has no oracle-style test to bar — checked when this file was written:
// no `__snapshots__` directory, no `toMatchSnapshot`, and no test byte-comparing
// output against committed fixtures. (A sibling repo has one, and bars it here,
// because such a test kills a great many mutants and would permanently inflate the
// baseline's killing power.) Re-check rather than trusting this note if one appears.

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Matches vitest.config.ts — this repo's suite runs in `node`, not jsdom.
    environment: 'node',
    // The 19 of 40 test files that exercise a mutate target.
    //
    // ⚠️ DERIVING THIS FROM DIRECT `import` EDGES ALONE IS NOT SUFFICIENT, and the
    // first draft of this list got it wrong. A test can reach a mutate target THROUGH
    // an intermediate module: storage.test.ts imports src/lib/storage.ts, which
    // imports validateProduct.ts — a mutate target — so it is a real killer for that
    // target while importing it nowhere.
    //
    // The defect is silent in the direction that matters: the omitted tests simply do
    // not run, so their mutants report as NoCoverage — "untested" rather than
    // "unreached by this config". Caught by comparing per-target branch coverage under
    // this config against the full 40-file suite; validateProduct.ts read 88.37% here
    // against 89.53% there, and every other target matched to the digit. Adding
    // storage.test.ts closed it exactly. (importUtils.test.ts and storageDriver.test.ts
    // also reach validateProduct transitively and change nothing — they are not
    // included, because a file that adds no coverage adds only killing power.)
    //
    // ⚠️ RE-RUN THAT COMPARISON WHEN THIS LIST CHANGES. It is the only check that
    // distinguishes a genuinely-unreached mutant from a misconfigured one.
    //
    // ⚠️ The four repo-hygiene guards are deliberately absent, and the reason is
    // stronger than "they import nothing from src/lib". They READ THE PROJECT TREE
    // FROM DISK — changelog/public-copy byte-sync, LICENSE conformance, copyright
    // headers, static-asset resolution. Stryker runs the suite inside a sandbox that
    // is a full copy of the project containing MUTATED SOURCE, so those guards would
    // be measuring the sandbox rather than the repo. They belong in `npm test`.
    include: [
      'src/__tests__/aiOps.test.ts',
      'src/__tests__/authName.test.ts',
      'src/__tests__/calculations.test.ts',
      'src/__tests__/exportForExcel.test.ts',
      'src/__tests__/exportForForecaster.test.ts',
      'src/__tests__/formatDate.test.ts',
      'src/__tests__/invitationErrors.test.ts',
      'src/__tests__/migration.test.ts',
      'src/__tests__/progressMutations.test.ts',
      'src/__tests__/progressViewHelpers.test.ts',
      'src/__tests__/ribCardColors.test.ts',
      'src/__tests__/ribHelpers.test.ts',
      'src/__tests__/settingsMutations.test.ts',
      'src/__tests__/signOutCleanup.test.ts',
      'src/__tests__/sortByOrder.test.ts',
      // Reaches validateProduct.ts through src/lib/storage.ts — see the note above.
      'src/__tests__/schemaVersion.test.ts',
      'src/__tests__/storage.test.ts',
      'src/__tests__/themeColors.test.ts',
      'src/__tests__/useProductMutations.test.ts',
      'src/__tests__/validateProduct.test.ts',
    ],
  },
})
