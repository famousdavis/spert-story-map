// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import sonarjs from 'eslint-plugin-sonarjs'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  // Skip the build output and any nested git worktrees under .claude/ —
  // Claude Code creates these for parallel feature work, and their freshly
  // built `dist/` bundles caused ESLint to scan ~30k minified-bundle errors
  // when run from the repo root. Worktrees lint themselves; we don't lint
  // them through the parent.
  // ⚠️ `.stryker-tmp` and `reports` are Stryker output and MUST stay ignored here,
  // not only in .gitignore. The sandboxes are full project copies containing mutated
  // source, so linting them adds hundreds of findings from files with no source of
  // truth. That is worse in this repo than in a sibling: the lint gate is held at an
  // accepted baseline (see below), so the extra findings do not read as "Stryker
  // output leaked in" — the ship gate fails with "new problems were introduced",
  // names Stryker nowhere, and points at the wrong thing entirely.
  // Anything added later that copies the project tree belongs in this list AND in
  // vite.config.ts's test.exclude.
  { ignores: ['dist', '.claude/**', '.stryker-tmp/**', 'reports/**'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{js,jsx,ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^[A-Z_]', caughtErrorsIgnorePattern: '^_' },
      ],
      'react-hooks/set-state-in-effect': 'warn',
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
    },
  },
  // Cognitive complexity, across the same file scope as the block above.
  //
  // WHY WHOLE-REPO RATHER THAN SCOPED TO THE WELL-TESTED CODE. Scoping to src/lib/**
  // was considered and rejected. That argument assumed the untested parts of this app
  // were static, so a ratchet there would guard code nobody was going to change. The
  // opposite is true: much of this app has not been exercised in earnest yet, and the
  // months ahead are expected to bring steady tweaks, fixes and enhancements — to
  // which parts, nobody can currently say. Untested code that is about to be edited
  // is exactly where a ratchet earns its keep, because nothing else is watching it.
  // Coverage and complexity both describe the code as it stands; neither says
  // anything about what is about to be edited.
  //
  // ⚠️ A FINDING IN AN UNTESTED FILE IS A SIGNAL TO ADD TESTS FIRST, NOT TO REFACTOR.
  // This baseline deliberately covers files with no test coverage at all. Refactoring
  // one of those to get under the threshold, with nothing in place to catch a
  // behaviour change, is the wrong trade in the direction that ships bugs. The
  // ratchet's job here is to stop complexity getting WORSE during the churn ahead.
  // It is not a demand that it get better.
  //
  // That is not an edge case here: 9 of the 22 findings — 41% of the baseline — are
  // in files where no test executes a single statement. Measured 2026-08-16, one
  // finding each:
  //
  //     src/components/sizing/SizingContent.tsx        src/hooks/useAiConnectivity.ts
  //     src/components/sizing/SizingRibModal.tsx       src/lib/AuthProvider.tsx
  //     src/components/storymap/ReleaseDivider.tsx     src/lib/migrateLegacyKeys.ts
  //     src/components/storymap/useMapKeyboard.ts      src/pages/InsightsView.tsx
  //     src/pages/StoryMapView.tsx
  //
  // For any of those nine, cover it before you touch it. The list is a snapshot, not
  // a definition — re-derive it from a coverage run rather than trusting it after the
  // files have moved on.
  //
  // ZERO IS NOT THE TARGET. An informed decline — measured, and recorded at the site
  // — is a permitted outcome for any individual finding.
  //
  // Only `cognitive-complexity` is enabled. The plugin's `recommended` set brings
  // rules that are codebase idiom or false positives here, and adopting it without a
  // disposition pass has been declined elsewhere in the suite.
  //
  // The accepted count lives in shipgate.config.json as `expectProblems` on the LINT
  // STEP (not at top level). `npm run lint` therefore exits NON-ZERO at the baseline,
  // by design — the gate holds the NUMBER steady and never reads the exit code. It
  // fails in BOTH directions: new findings must be fixed rather than baselined, and
  // resolved ones must be accounted for by lowering the number.
  //
  // ⚠️ If this ever reaches a true zero, DELETE the `expectProblems` key. ESLint
  // prints no `✖ N problems` line when there is nothing to report, and the gate fails
  // at shipgate.mjs:333 looking for one ("could not read a problem count").
  //
  // The scope matches the block above, which means `.mjs` is not covered — so
  // scripts/shipgate.mjs is outside it. Measured: including `.mjs` gives the same
  // count, because that file has no function over the threshold. So the exclusion
  // protects nothing today. It is worth keeping anyway, because shipgate.mjs is
  // byte-identical across the suite and must not be edited here — a finding in it
  // could never be dispositioned in this repo.
  {
    files: ['**/*.{js,jsx,ts,tsx}'],
    plugins: { sonarjs },
    rules: {
      'sonarjs/cognitive-complexity': ['error', 15],
    },
  },
)
