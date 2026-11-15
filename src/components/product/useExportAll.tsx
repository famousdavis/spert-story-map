// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.56.1 (R71 R-6): Export All in Local mode asks first, naming the export name and identifier it stamps.

import { useState } from 'react';
import ConfirmDialog from '../ui/ConfirmDialog';
import type { StorageDriver, UserSettings } from '../../types';

/** The confirm's words: how many products, and what each will be stamped with. */
export function exportAllMessage(count: number, prefs: UserSettings): string {
  const name = typeof prefs.exportName === 'string' && prefs.exportName.trim() ? `the export name “${prefs.exportName}”` : 'no export name';
  const id = typeof prefs.exportId === 'string' && prefs.exportId.trim() ? `the identifier “${prefs.exportId}”` : 'no identifier';
  const products = count === 1 ? 'the 1 product' : `all ${count} products`;
  return `The file will hold ${products} stored in this browser, including any made by other people who use it. Each will be stamped with ${name} and ${id}.`;
}

/**
 * Export All, asking first in Local mode (R-6). Cloud mode exports at once, as before. Returns the
 * click handler and the dialog to render.
 */
export function useExportAll(driver: StorageDriver | null, isLocal: boolean, count: number, run: () => void) {
  const [message, setMessage] = useState<string | null>(null);
  const onExportAll = () => {
    if (!driver) return;
    if (!isLocal) { run(); return; }
    void driver.loadPreferences().then(prefs => setMessage(exportAllMessage(count, prefs)));
  };
  const dialog = (
    <ConfirmDialog
      open={message !== null}
      onClose={() => setMessage(null)}
      onConfirm={() => { setMessage(null); run(); }}
      title="Export All Products"
      message={message ?? ''}
      confirmLabel="Export All"
      danger={false}
    />
  );
  return { onExportAll, dialog };
}
