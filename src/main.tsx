// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import './index.css'
import App from './App'
import { AuthProvider } from './lib/AuthProvider'
import { StorageProvider } from './lib/StorageProvider'
import { runLegacyMigration } from './lib/migrateLegacyKeys'

// Top-level await: migrate legacy localStorage keys (rp_* → rp:local:*)
// BEFORE React mounts. The first read inside StorageProvider's effect
// happens with the new key shape, so there's no race between migration
// and the first product load. tsconfig.app.json has module=ESNext +
// target=ES2020; Vite bundles with esbuild which supports TLA at the
// entry point.
await runLegacyMigration();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <StorageProvider>
          <App />
        </StorageProvider>
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
)
