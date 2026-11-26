// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pinned because the Forecaster crosslink allowlists this origin BY NAME in dev. Vite's
  // default is to walk to 5174+ when 5173 is busy, and a soft port with a hard allowlist
  // entry fails together, silently. If 5173 is genuinely taken, change the receiver's dev
  // allowlist rather than letting this drift.
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    // Skip nested git worktrees under .claude/ in addition to vitest's
    // default excludes (node_modules, dist, etc.). Claude Code creates
    // worktrees there for parallel feature work and Vitest would otherwise
    // discover their src/__tests__/*.test.ts files alongside the main copy,
    // inflating test counts ~4–5× when `npm test` runs from the repo root.
    // `.stryker-tmp` holds Stryker's sandboxes — full copies of the project,
    // including this test suite and, mid-run, MUTATED SOURCE. Vitest's default
    // exclude is only node_modules and .git, so without this line `npm test`
    // discovers every sandbox copy of every test file: the suite inflates several
    // times over and reports "failures" that are actually surviving mutants.
    exclude: [...configDefaults.exclude, '**/.claude/**', '**/.stryker-tmp/**'],
    // Firebase is never configured in a test (v0.58.0), whatever a developer's `.env.local` holds. With it configured,
    // `lib/firebase.ts` built the real app and a test could reach production: the local-store fold's test ended a
    // recorded Connect AI session with a real Firestore delete and a real call to the `teardownAiSession` Cloud
    // Function. CI has no `.env.local`, so this is how the suite already ran there. A test that needs Firebase mocks
    // `lib/firebase` itself. `setup/networkGuard.ts` fails any test file that still connects to a Google or Firebase
    // host, and `networkGuard.test.ts` holds both.
    env: { VITE_FIREBASE_API_KEY: '', VITE_FIREBASE_PROJECT_ID: '', VITE_FIREBASE_APP_ID: '' },
    setupFiles: ['src/__tests__/setup/networkGuard.ts'],
  },
})
