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
  sprints: [{ id: 'sp1', name: 'Sprint 1', order: 1, endDate: null }],
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
                { sprintId: 'sp1', releaseId: 'r1', percentComplete: 75 },
                { sprintId: 'sp1', releaseId: 'r2', percentComplete: 25 },
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
  it('1. Row 1 has project name (large bold), Row 3 is frozen header with 10 column labels', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // Row 1: project title
    const titleCell = ws.getRow(1).getCell(1);
    expect(titleCell.value).toBe('Test Product');
    expect(titleCell.font?.bold).toBe(true);
    expect(titleCell.font?.size).toBe(16);
    // Row 3: column headers (frozen)
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
    const header = ws.getRow(3);
    expect(header.getCell(1).font?.bold).toBe(true);
    const labels = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((c: number) => header.getCell(c).value);
    expect(labels).toEqual([
      'Theme', 'Backbone', 'Rib Item', 'Category', 'Size', 'Points', '% Complete', 'Release(s)', 'Description', 'Notes',
    ]);
  });

  it('2. theme group header has correct value and merges all 10 columns', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // Row 4 is the first theme group header (rows 1-2 title/spacer, row 3 header)
    const cell = ws.getCell(4, 1);
    expect(cell.value).toBe('Theme Alpha');
    // ExcelJS represents merged cells via master cell or isMerged
    expect(cell.isMerged).toBe(true);
    // The merge reaches the last column (Notes) and no further.
    expect(ws.getCell(4, 10).master.address).toBe('A4');
    expect(ws.getCell(4, 11).isMerged).toBe(false);
  });

  it('3. theme group header fill matches theme color key', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    const cell = ws.getCell(4, 1);
    expect(cell.fill?.fgColor?.argb).toBe('FFDBEAFE'); // blue
  });

  it('4. theme group header uses DEFAULT_FILL_COLOR when theme has no color', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // Theme Beta (no color) group header: row 3 header + row 4 theme1 header + row 5 rib1 + row 6 rib2 = row 7
    const cell = ws.getCell(7, 1);
    expect(cell.value).toBe('Theme Beta');
    expect(cell.fill?.fgColor?.argb).toBe('FFF3F4F6');
  });

  it('5. rib item row has correct Theme / Backbone / Name / Category / Size values', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // Row 5 is the first rib data row (row 3 = header, row 4 = theme1 header)
    const row = ws.getRow(5);
    expect(row.getCell(1).value).toBe('Theme Alpha');
    expect(row.getCell(2).value).toBe('Backbone One');
    expect(row.getCell(3).value).toBe('Rib Item One');
    expect(row.getCell(4).value).toBe('core');
    expect(row.getCell(5).value).toBe('M');
  });

  it('6. rib item row has correct Points value from sizeMapping', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib1 is size M = 5 points (row 5)
    expect(ws.getRow(5).getCell(6).value).toBe(5);
    // rib2 is size S = 2 points (row 6)
    expect(ws.getRow(6).getCell(6).value).toBe(2);
  });

  it('7. % Complete cell has green fill when 100%', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib1 has its two releases complete: 75 + 25 — row 5, col 7
    const cell = ws.getRow(5).getCell(7);
    expect(cell.value).toBe(1);
    expect(cell.numFmt).toBe('0%');
    expect(cell.fill?.fgColor?.argb).toBe('FFD1FAE5');
  });

  it('8. % Complete cell has yellow fill when partial (> 0 and < 100)', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib3 (Theme Beta) has 40% — row 8, col 7
    const cell = ws.getRow(8).getCell(7);
    expect(cell.value).toBe(0.4);
    expect(cell.fill?.fgColor?.argb).toBe('FFFEF3C7');
  });

  it('9. % Complete cell has no fill when 0%', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib2 has no progress — row 6, col 7
    const cell = ws.getRow(6).getCell(7);
    expect(cell.value).toBe(0);
    // No fill set — pattern should be null/none/undefined or fgColor absent
    const fillType = cell.fill?.pattern;
    expect(!fillType || fillType === 'none').toBe(true);
  });

  it('10. Release(s) column: single allocation renders as "Release Name (XX%)"', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib3 (row 8) has one allocation: r1 = 50%
    expect(ws.getRow(8).getCell(8).value).toBe('Release 1 (50%)');
  });

  it('11. Release(s) column: multiple allocations render comma-separated sorted by release order', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib1 (row 5) has r1 (order 1) at 75% and r2 (order 2) at 25%
    expect(ws.getRow(5).getCell(8).value).toBe('Release 1 (75%), Release 2 (25%)');
  });

  it('12. Release(s) column: no allocations renders as "Unassigned"', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Rib Items');
    // rib2 (row 6) has no allocations
    expect(ws.getRow(6).getCell(8).value).toBe('Unassigned');
  });
});

describe('buildExcelWorkbook — Sheet 2 (Release Summary)', () => {
  it('13. correct row count, Points / % Complete / Target Date values', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Release Summary');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
    // Row 4 = Release 1
    const row4 = ws.getRow(4);
    expect(row4.getCell(1).value).toBe('Release 1');
    expect(typeof row4.getCell(2).value).toBe('number'); // Total Points
    expect(row4.getCell(6).value).toBe('2026-06-01');
    // Row 5 = Release 2 (no targetDate)
    const row5 = ws.getRow(5);
    expect(row5.getCell(1).value).toBe('Release 2');
    expect(row5.getCell(6).value).toBe('');
  });

  it('13b. adds the same lines as Insights, so the sheet adds up to the project', async () => {
    const wb = await getWorkbook();
    const ws = wb.getWorksheet('Release Summary');
    const cells = (rowNum: number) => [1, 2, 3, 4, 5].map(c => ws.getRow(rowNum).getCell(c).value);
    // rib1 (M, 5 pts) fully allocated; rib2 (S, 2 pts, non-core) unassigned; rib3 (L, 8 pts) at 50%.
    expect(cells(6)).toEqual(['Unallocated', 6, '', 4, 2]);
    expect(ws.getRow(7).getCell(1).value).toBe('Total');
    expect(ws.getRow(7).getCell(2).value).toBe(15);
    expect(ws.getRow(7).getCell(3).value).toBeCloseTo(8.2 / 15);
    expect(ws.getRow(7).getCell(3).numFmt).toBe('0%');
    expect(ws.getRow(7).font?.bold).toBe(true);
    expect(ws.getRow(6).font?.bold).toBeFalsy();
    expect(ws.getRow(8).getCell(1).value).toBeNull();
    const releases = [4, 5].reduce((sum, r) => sum + Number(ws.getRow(r).getCell(2).value), 0);
    expect(releases + Number(ws.getRow(6).getCell(2).value)).toBeCloseTo(15);
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
    // Title + spacer + header + 2 release rows = 5 rows total
    const rows: string[] = [];
    ws.eachRow((_row: any, rowNum: number) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      if (rowNum > 3) rows.push(ws.getRow(rowNum).getCell(1).value as string);
    });
    expect(rows).toContain('Empty Release');
  });
});

// v0.54.2: descriptions in the export. A theme with no backbones and a backbone with
// no ribs are included on purpose: Rib Items is built rib by rib and drops both.
function makeDescriptionProduct() {
  return {
    ...BASE_PRODUCT,
    themes: [
      {
        ...BASE_PRODUCT.themes[0]!,
        description: 'Everything a customer sees',
        backboneItems: [
          {
            ...BASE_PRODUCT.themes[0]!.backboneItems[0]!,
            description: 'Signing up and getting started',
            ribItems: BASE_PRODUCT.themes[0]!.backboneItems[0]!.ribItems.map((r, i) =>
              (i === 0 ? { ...r, description: 'The first rib, described', notes: 'A note' } : r)),
          },
          { id: 'b-empty', name: 'Empty Backbone', order: 2, description: '=HYPERLINK("x")', ribItems: [] },
        ],
      },
      BASE_PRODUCT.themes[1]!,
      { id: 't-empty', name: 'Empty Theme', order: 3, color: 'teal', description: 'No backbones yet', backboneItems: [] },
    ],
  };
}

describe('buildExcelWorkbook — descriptions (v0.54.2)', () => {
  it('15. sheets are Rib Items, Backbone Items, Release Summary, in that order', async () => {
    const wb = await getWorkbook(makeDescriptionProduct() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(wb.worksheets.map((w: { name: string }) => w.name)).toEqual(['Rib Items', 'Backbone Items', 'Release Summary']);
  });

  it('16. Backbone Items: title, frozen header, then a theme row before its backbones', async () => {
    const wb = await getWorkbook(makeDescriptionProduct() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const ws = wb.getWorksheet('Backbone Items');
    expect(ws.getRow(1).getCell(1).value).toBe('Test Product');
    expect(ws.views[0]).toMatchObject({ state: 'frozen', ySplit: 3 });
    const cells = (r: number) => [1, 2, 3].map(c => ws.getRow(r).getCell(c).value);
    expect(cells(3)).toEqual(['Theme', 'Backbone', 'Description']);
    expect(cells(4)).toEqual(['Theme Alpha', '', 'Everything a customer sees']);
    expect(cells(5)).toEqual(['Theme Alpha', 'Backbone One', 'Signing up and getting started']);
    expect(cells(6)).toEqual(['Theme Alpha', 'Empty Backbone', '\'=HYPERLINK("x")']);
    expect(cells(7)).toEqual(['Theme Beta', '', '']);
    expect(cells(8)).toEqual(['Theme Beta', 'Backbone Two', '']);
    expect(cells(9)).toEqual(['Empty Theme', '', 'No backbones yet']);
    expect(ws.getRow(10).getCell(1).value).toBeNull();
  });

  it('17. Backbone Items: theme rows are bold and shaded by theme colour; backbone rows are not', async () => {
    const wb = await getWorkbook(makeDescriptionProduct() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const ws = wb.getWorksheet('Backbone Items');
    expect(ws.getRow(4).font?.bold).toBe(true);
    for (const col of [1, 2, 3]) expect(ws.getRow(4).getCell(col).fill?.fgColor?.argb).toBe('FFDBEAFE');
    expect(ws.getRow(7).getCell(1).fill?.fgColor?.argb).toBe('FFF3F4F6');
    expect(ws.getRow(9).getCell(3).fill?.fgColor?.argb).toBe('FFCCFBF4');
    expect(ws.getRow(5).font?.bold).toBeFalsy();
    expect(ws.getRow(5).getCell(1).fill).toBeUndefined();
  });

  it('18. Backbone Items: descriptions wrap and sit at the top', async () => {
    const wb = await getWorkbook(makeDescriptionProduct() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const ws = wb.getWorksheet('Backbone Items');
    for (const r of [4, 5]) {
      expect(ws.getRow(r).getCell(3).alignment).toMatchObject({ wrapText: true, vertical: 'top' });
    }
  });

  it('19. Rib Items: Description holds the rib description, blank when it has none', async () => {
    const wb = await getWorkbook(makeDescriptionProduct() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const ws = wb.getWorksheet('Rib Items');
    expect(ws.getRow(5).getCell(9).value).toBe('The first rib, described');
    expect(ws.getRow(5).getCell(10).value).toBe('A note');
    expect(ws.getRow(6).getCell(9).value).toBe('');
    expect(ws.getRow(5).getCell(9).alignment).toMatchObject({ wrapText: true, vertical: 'top' });
    // The empty theme and the empty backbone have no ribs, so they add nothing here.
    const firstColumn: unknown[] = [];
    ws.eachRow((row: any) => { firstColumn.push(row.getCell(1).value); }); // eslint-disable-line @typescript-eslint/no-explicit-any
    expect(firstColumn).not.toContain('Empty Theme');
  });

  it('20. survives being written to an .xlsx file and read back', async () => {
    const ExcelJS = await import('exceljs');
    const XL = (ExcelJS as any).default ?? ExcelJS; // eslint-disable-line @typescript-eslint/no-explicit-any
    const wb = await getWorkbook(makeDescriptionProduct() as any); // eslint-disable-line @typescript-eslint/no-explicit-any
    const buffer = await wb.xlsx.writeBuffer();
    const back = new XL.Workbook();
    await back.xlsx.load(buffer);
    expect(back.worksheets.map((w: { name: string }) => w.name)).toEqual(['Rib Items', 'Backbone Items', 'Release Summary']);
    const bb = back.getWorksheet('Backbone Items');
    expect(bb.getRow(5).getCell(3).value).toBe('Signing up and getting started');
    expect(bb.getRow(5).getCell(3).alignment).toMatchObject({ wrapText: true, vertical: 'top' });
    const ribs = back.getWorksheet('Rib Items');
    expect(ribs.getRow(5).getCell(9).value).toBe('The first rib, described');
    expect(ribs.getCell(4, 10).master.address).toBe('A4');
  });
});
