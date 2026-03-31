// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import type { Product } from '../types';
import { forEachRib } from './ribHelpers';
import {
  getRibItemPoints,
  getRibItemPercentComplete,
  getPointsForRelease,
  getReleasePercentComplete,
  getCoreNonCorePointsForRelease,
} from './calculations';

const THEME_FILL_COLORS: Record<string, string> = {
  blue:    'FFDBEAFE',
  teal:    'FFCCFBF4',
  violet:  'FFEDE9FE',
  rose:    'FFFFE4E6',
  amber:   'FFFEF3C7',
  emerald: 'FFD1FAE5',
  indigo:  'FFE0E7FF',
  orange:  'FFFFEDD5',
};
const DEFAULT_FILL_COLOR = 'FFF3F4F6';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function argbFill(argb: string): any {
  return { type: 'pattern', pattern: 'solid', fgColor: { argb } };
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function buildExcelWorkbook(product: Product, ExcelJS: any): Promise<any> {
  const workbook = new ExcelJS.Workbook();

  // ── Sheet 1: Rib Items ────────────────────────────────────────────────────
  const ws1 = workbook.addWorksheet('Rib Items');
  ws1.columns = [
    { width: 20 },
    { width: 22 },
    { width: 35 },
    { width: 12 },
    { width: 8 },
    { width: 8 },
    { width: 12 },
    { width: 40 },
    { width: 80 },
  ];

  const headerRow = ws1.addRow([
    'Theme', 'Backbone', 'Rib Item', 'Category', 'Size', 'Points', '% Complete', 'Release(s)', 'Notes',
  ]);
  headerRow.font = { bold: true };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  headerRow.eachCell((cell: any) => { cell.fill = argbFill(DEFAULT_FILL_COLOR); });
  ws1.views = [{ state: 'frozen', ySplit: 1 }];

  // Build release lookup: id → { name, order }
  const releaseMap = new Map<string, { name: string; order: number }>(
    product.releases.map(r => [r.id, { name: r.name, order: r.order }]),
  );

  let currentThemeId = '';

  forEachRib(product, (rib, { theme, backbone }) => {
    // Insert theme group header row on theme boundary
    if (theme.id !== currentThemeId) {
      currentThemeId = theme.id;
      const groupRow = ws1.addRow([]);
      const rowNum: number = groupRow.number;
      ws1.mergeCells(rowNum, 1, rowNum, 9);
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cell: any = ws1.getCell(rowNum, 1);
      cell.value = theme.name;
      cell.font = { bold: true };
      cell.fill = argbFill(THEME_FILL_COLORS[theme.color ?? ''] ?? DEFAULT_FILL_COLOR);
    }

    const points = getRibItemPoints(rib, product.sizeMapping);
    const pct = getRibItemPercentComplete(rib);

    // Build release(s) string sorted by release order
    let releaseStr = 'Unassigned';
    if (rib.releaseAllocations.length > 0) {
      releaseStr = rib.releaseAllocations
        .slice()
        .sort((a, b) => {
          const oa = releaseMap.get(a.releaseId)?.order ?? 0;
          const ob = releaseMap.get(b.releaseId)?.order ?? 0;
          return oa - ob;
        })
        .map(alloc => {
          const rName = releaseMap.get(alloc.releaseId)?.name ?? alloc.releaseId;
          return `${rName} (${alloc.percentage}%)`;
        })
        .join(', ');
    }

    const dataRow = ws1.addRow([
      theme.name,
      backbone.name,
      rib.name,
      rib.category,
      rib.size ?? '',
      points,
      pct / 100,
      releaseStr,
      rib.notes ?? '',
    ]);

    // Notes cell: wrap text, anchor to top (column 9)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const notesCell: any = dataRow.getCell(9);
    notesCell.alignment = { wrapText: true, vertical: 'top' };

    // % Complete cell: percentage format + conditional fill (column 7)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pctCell: any = dataRow.getCell(7);
    pctCell.numFmt = '0%';
    if (pct === 100) {
      pctCell.fill = argbFill('FFD1FAE5'); // light green
    } else if (pct > 0) {
      pctCell.fill = argbFill('FFFEF3C7'); // light yellow
    }
  });

  // ── Sheet 2: Release Summary ──────────────────────────────────────────────
  const ws2 = workbook.addWorksheet('Release Summary');
  ws2.columns = [
    { width: 25 },  // Release
    { width: 14 },  // Total Points
    { width: 14 },  // % Complete
    { width: 14 },  // Core Points
    { width: 16 },  // Non-Core Points
    { width: 14 },  // Target Date
  ];

  const relHeader = ws2.addRow([
    'Release', 'Total Points', '% Complete', 'Core Points', 'Non-Core Points', 'Target Date',
  ]);
  relHeader.font = { bold: true };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  relHeader.eachCell((cell: any) => { cell.fill = argbFill(DEFAULT_FILL_COLOR); });
  ws2.views = [{ state: 'frozen', ySplit: 1 }];

  const sortedReleases = product.releases.slice().sort((a, b) => a.order - b.order);
  for (const release of sortedReleases) {
    const totalPoints = getPointsForRelease(product, release.id);
    const pctComplete = getReleasePercentComplete(product, release.id);
    const { core, nonCore } = getCoreNonCorePointsForRelease(product, release.id);
    const relRow = ws2.addRow([
      release.name,
      totalPoints,
      pctComplete / 100,
      core,
      nonCore,
      release.targetDate ?? '',
    ]);
    relRow.getCell(3).numFmt = '0%';
  }

  return workbook;
}

export async function downloadExcelExport(product: Product): Promise<void> {
  // Dynamic import keeps ExcelJS (~1 MB) out of the initial bundle
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const mod = await import('exceljs') as any;
  const ExcelJS = mod.default ?? mod;
  const workbook = await buildExcelWorkbook(product, ExcelJS);
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([new Uint8Array(buffer as ArrayBuffer)], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${product.name.replace(/[^a-zA-Z0-9]/g, '_')}_storymap_${timestamp}.xlsx`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
