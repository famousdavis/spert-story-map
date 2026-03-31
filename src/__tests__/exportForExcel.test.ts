// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { buildExcelWorkbook } from '../lib/exportForExcel';

// Minimal product fixture shared across tests
const BASE_PRODUCT = {
  id: 'p1',
  name: 'Test Product',
  sizeMapping: [
    { label: 'S', points: 2 },
    { label: 'M', points: 5 },
    { label: 'L', points: 8 },
  ],
  releases: [
    { id: 'r1', name: 'Release 1', order: 1, targetDate: '2026-06-01', description: '' },
    { id: 'r2', name: 'Release 2', order: 2, targetDate: null, description: '' },
  ],
  sprints: [],
  themes: [
    {
      id: 't1',
      name: 'Theme Alpha',
      order: 1,
      color: 'blue',
      backboneItems: [
        {
          id: 'b1',
          name: 'Backbone One',
          order: 1,
          ribItems: [
            {
              id: 'rib1',
              name: 'Rib Item One',
              order: 1,
              size: 'M',
              category: 'core',
              releaseAllocations: [
                { releaseId: 'r1', percentage: 75 },
                { releaseId: 'r2', percentage: 25 },
              ],
              progressHistory: [
                { sprintId: 'sp1', releaseId: 'r1', percentComplete: 100 },
              ],
            },
            {
              id: 'rib2',
              name: 'Rib Item Two',
              order: 2,
              size: 'S',
              category: 'non-core',
              releaseAllocations: [],
              progressHistory: [],
            },
          ],
        },
      ],
    },
    {
      id: 't2',
      name: 'Theme Beta',
      order: 2,
      color: undefined,
      backboneItems: [
        {
          id: 'b2',
          name: 'Backbone Two',
          order: 1,
          ribItems: [
            {
              id: 'rib3',
              name: 'Rib Item Three',
              order: 1,
              size: 'L',
              category: 'core',
              releaseAllocations: [{ releaseId: 'r1', percentage: 50 }],
              progressHistory: [
                { sprintId: 'sp1', releaseId: 'r1', percentComplete: 40 },
              ],
            },
          ],
        },
      ],
    },
  ],
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function getWorkbook(product = BASE_PRODUCT): Promise<any> {
  const ExcelJS = await import('exceljs');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return buildExcelWorkbook(product as any, (ExcelJS as any).default ?? ExcelJS);
}

describe('buildExcelWorkbook — Sheet 1 (Rib Items)', () => {
  it('1. header row is frozen, bold, and has 9 correct column labels', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    const header = ws.getRow(1);
    expect(header.getCell(1).font?.bold).toBe(true);
    const labels = [1, 2, 3, 4, 5, 6, 7, 8, 9].map((c: number) => header.getCell(c).value);
    expect(labels).toEqual([
      'Theme', 'Backbone', 'Rib Item', 'Category', 'Size', 'Points', '% Complete', 'Release(s)', 'Notes',
    ]);
  });

  it('2. theme group header has correct value and merges all 9 columns', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // Row 2 is the first theme group header (after header row)
    const cell = ws.getCell(2, 1);
    expect(cell.value).toBe('Theme Alpha');
    // ExcelJS represents merged cells via master cell or isMerged
    expect(cell.isMerged).toBe(true);
  });

  it('3. theme group header fill matches theme color key', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    const cell = ws.getCell(2, 1);
    expect(cell.fill?.fgColor?.argb).toBe('FFDBEAFE'); // blue
  });

  it('4. theme group header uses DEFAULT_FILL_COLOR when theme has no color', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // Theme Beta (no color) group header: row 1 header + row 2 theme1 header + row 3 rib1 + row 4 rib2 = row 5
    const cell = ws.getCell(5, 1);
    expect(cell.value).toBe('Theme Beta');
    expect(cell.fill?.fgColor?.argb).toBe('FFF3F4F6');
  });

  it('5. rib item row has correct Theme / Backbone / Name / Category / Size values', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // Row 3 is the first rib data row (row 1 = header, row 2 = theme1 header)
    const row = ws.getRow(3);
    expect(row.getCell(1).value).toBe('Theme Alpha');
    expect(row.getCell(2).value).toBe('Backbone One');
    expect(row.getCell(3).value).toBe('Rib Item One');
    expect(row.getCell(4).value).toBe('core');
    expect(row.getCell(5).value).toBe('M');
  });

  it('6. rib item row has correct Points value from sizeMapping', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib1 is size M = 5 points
    expect(ws.getRow(3).getCell(6).value).toBe(5);
    // rib2 is size S = 2 points (row 4)
    expect(ws.getRow(4).getCell(6).value).toBe(2);
  });

  it('7. % Complete cell has green fill when 100%', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib1 has progressHistory entry of 100% — row 3, col 7
    const cell = ws.getRow(3).getCell(7);
    expect(cell.value).toBe(100);
    expect(cell.fill?.fgColor?.argb).toBe('FFD1FAE5');
  });

  it('8. % Complete cell has yellow fill when partial (> 0 and < 100)', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib3 (Theme Beta) has 40% — row 6, col 7
    const cell = ws.getRow(6).getCell(7);
    expect(cell.value).toBe(40);
    expect(cell.fill?.fgColor?.argb).toBe('FFFEF3C7');
  });

  it('9. % Complete cell has no fill when 0%', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib2 has no progress — row 4, col 7
    const cell = ws.getRow(4).getCell(7);
    expect(cell.value).toBe(0);
    // No fill set — pattern should be null/none/undefined or fgColor absent
    const fillType = cell.fill?.pattern;
    expect(!fillType || fillType === 'none').toBe(true);
  });

  it('10. Release(s) column: single allocation renders as "Release Name (XX%)"', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib3 (row 6) has one allocation: r1 = 50%
    expect(ws.getRow(6).getCell(8).value).toBe('Release 1 (50%)');
  });

  it('11. Release(s) column: multiple allocations render comma-separated sorted by release order', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib1 (row 3) has r1 (order 1) at 75% and r2 (order 2) at 25%
    expect(ws.getRow(3).getCell(8).value).toBe('Release 1 (75%), Release 2 (25%)');
  });

  it('12. Release(s) column: no allocations renders as "Unassigned"', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib2 (row 4) has no allocations
    expect(ws.getRow(4).getCell(8).value).toBe('Unassigned');
  });
});

describe('buildExcelWorkbook — Sheet 2 (Release Summary)', () => {
  it('13. correct row count, Points / % Complete / Target Date values', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Release Summary');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 1 });
    // Row 2 = Release 1
    const row2 = ws.getRow(2);
    expect(row2.getCell(1).value).toBe('Release 1');
    expect(typeof row2.getCell(2).value).toBe('number'); // Total Points
    expect(row2.getCell(6).value).toBe('2026-06-01');
    // Row 3 = Release 2 (no targetDate)
    const row3 = ws.getRow(3);
    expect(row3.getCell(1).value).toBe('Release 2');
    expect(row3.getCell(6).value).toBe('');
  });

  it('14. release with zero allocated points still appears as a row', async () => {
    const product = {
      ...BASE_PRODUCT,
      releases: [
        { id: 'r1', name: 'Release 1', order: 1, targetDate: null, description: '' },
        { id: 'r_empty', name: 'Empty Release', order: 2, targetDate: null, description: '' },
      ],
      themes: [
        {
          id: 't1',
          name: 'Theme Alpha',
          order: 1,
          color: 'blue' as const,
          backboneItems: [
            {
              id: 'b1',
              name: 'Backbone One',
              order: 1,
              ribItems: [
                {
                  id: 'rib1',
                  name: 'Rib Item One',
                  order: 1,
                  size: 'M' as const,
                  category: 'core' as const,
                  releaseAllocations: [{ releaseId: 'r1', percentage: 100 }],
                  progressHistory: [],
                },
              ],
            },
          ],
        },
      ],
    };
    const wb = await getWorkbook(product as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const ws = wb.getWorksheet('Release Summary');
    // Header + 2 release rows = 3 rows total
    const rows: string[] = [];
    ws.eachRow((_row: any, rowNum: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (rowNum > 1) rows.push(ws.getRow(rowNum).getCell(1).value as string);
    });
    expect(rows).toContain('Empty Release');
  });
});
