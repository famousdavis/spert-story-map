// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// v0.56.1 (R71 R-6): Export All's confirm in Local mode names what the file will stamp on each product.
// It must test the name and identifier exactly as the export does (importExport.ts), or it can say
// "no export name" for a value the file carries.

import { describe, it, expect } from 'vitest';
import { exportAllMessage } from '../components/product/useExportAll';

describe('exportAllMessage', () => {
  it('names the export name and identifier, and counts the products', () => {
    expect(exportAllMessage(2, { exportName: 'Ana', exportId: 'A-1' })).toBe(
      'The file will hold all 2 products stored in this browser, including any made by other people who use it. Each will be stamped with the export name “Ana” and the identifier “A-1”.');
    expect(exportAllMessage(1, {})).toBe(
      'The file will hold the 1 product stored in this browser, including any made by other people who use it. Each will be stamped with no export name and no identifier.');
  });

  it('a name or identifier of spaces is stamped by the export, so the confirm names it too', () => {
    expect(exportAllMessage(1, { exportName: ' ', exportId: ' ' })).toBe(
      'The file will hold the 1 product stored in this browser, including any made by other people who use it. Each will be stamped with the export name “ ” and the identifier “ ”.');
  });
});
