// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { defineConfig } from 'vite'
import { configDefaults } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  test: {
    environment: 'node',
    // Skip nested git worktrees under .claude/ in addition to vitest's
    // default excludes (node_modules, dist, etc.). Claude Code creates
    // worktrees there for parallel feature work and Vitest would otherwise
    // discover their src/__tests__/*.test.ts files alongside the main copy,
    // inflating test counts ~4–5× when `npm test` runs from the repo root.
    exclude: [...configDefaults.exclude, '**/.claude/**'],
  },
})
