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
import { initValidatorObserver } from './lib/validatorObserver'

// Top-level await: migrate legacy localStorage keys (rp_* → rp:local:*)
// BEFORE React mounts. The first read inside StorageProvider's effect
// happens with the new key shape, so there's no race between migration
// and the first product load. tsconfig.app.json has module=ESNext +
// target=ES2020; Vite bundles with esbuild which supports TLA at the
// entry point.
await runLegacyMigration();

// Brief 10 §3f: read the observer flag ONCE, here, before React mounts. It must be
// read before StorageProvider's effect binds the uid namespace (StorageProvider.tsx:59),
// because the key is a bare literal and is never namespaced. Off by default; a
// no-op registration slot means the read seams cost nothing unless it is on.
initValidatorObserver();

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
