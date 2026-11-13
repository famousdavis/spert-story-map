// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom

/**
 * A JSON import with no `updatedAt` (Brief 22 PC-6, the reachable production path).
 *
 * Moved here unchanged from `projectCardUpdatedAt.test.tsx` (v0.55.0). The card test
 * beside it went with the card's date; this one never depended on the card.
 */

import { describe, it, expect } from 'vitest';
import { importProductFromJSON } from '../lib/importExport';

describe('PC-6 — the reachable production path: JSON import', () => {
  /** A valid export with no `updatedAt` — what `importProductFromJSON` accepts. */
  const IMPORTABLE = JSON.stringify({
    id: 'imported-1', name: 'Imported Project', description: '',
    createdAt: '2026-01-01T00:00:00.000Z', schemaVersion: 2, themes: [],
  });

  it('imports cleanly without updatedAt — validateProduct never required it', () => {
    const p = importProductFromJSON(IMPORTABLE);
    expect(p.name).toBe('Imported Project');   // harness control: the import ran
    expect(p.updatedAt).toBeUndefined();       // the field really is absent
  });
});
