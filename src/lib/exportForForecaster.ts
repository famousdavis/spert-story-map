// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// Pure transformation: Story Map product → SPERT Release Forecaster import format
import type { Product, Sprint } from '../types';
import { getRibItemPoints, getRibItemPercentCompleteAsOf, getPointsForRelease, getTotalProjectPoints } from './calculations';
import { reduceRibs } from './ribHelpers';

// Hex colors matching THEME_COLOR_OPTIONS Tailwind-600 shades
const MILESTONE_HEX_COLORS = [
  '#2563eb', // blue
  '#0d9488', // teal
  '#7c3aed', // violet
  '#e11d48', // rose
  '#d97706', // amber
  '#059669', // emerald
  '#4f46e5', // indigo
  '#ea580c', // orange
];

/** Add `days` to a YYYY-MM-DD string, returning a new YYYY-MM-DD string. */
export function addDays(dateStr: string, days: number): string {
  const d = new Date(dateStr + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Derive the first sprint start date from the first sprint's end date and cadence. */
export function computeFirstSprintStartDate(endDate: string | null, cadenceWeeks: number | null): string | null {
  if (!endDate || !cadenceWeeks) return null;
  return addDays(endDate, -(cadenceWeeks * 7 - 1));
}

/** Round to 2 decimal places to avoid floating-point noise. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * Build the complete Forecaster ExportData object from a Story Map product.
 * Pure function — no side effects.
 */
export function buildForecasterExport(product: Product) {
  const now = new Date().toISOString();
  const createdAt = product.createdAt || now;
  const updatedAt = product.updatedAt || now;

  // Sort releases and sprints by order
  const sortedReleases = [...(product.releases || [])].sort((a, b) => a.order - b.order);
  const sortedSprints = [...(product.sprints || [])].sort((a, b) => a.order - b.order);

  // --- Milestones from releases ---
  const milestones = [];
  for (const release of sortedReleases) {
    const backlogSize = round2(getPointsForRelease(product, release.id));
    if (backlogSize < 0.01) continue; // Forecaster requires > 0
    milestones.push({
      id: release.id,
      name: release.name,
      backlogSize,
      color: MILESTONE_HEX_COLORS[milestones.length % MILESTONE_HEX_COLORS.length],
      showOnChart: true,
      createdAt,
      updatedAt,
    });
  }

  // --- Sprints ---
  // Type predicate, not a bare truthiness filter: every sprint that survives
  // this genuinely has a date, and saying so lets the reads below (startDate,
  // sprintFinishDate) use it without re-asserting.
  const sprintsWithDates = sortedSprints.filter(
    (s): s is Sprint & { endDate: string } => Boolean(s.endDate)
  );
  const cadence = product.sprintCadenceWeeks || 2;
  const firstWithDate = sprintsWithDates[0];
  const firstSprintStart = firstWithDate
    ? computeFirstSprintStartDate(firstWithDate.endDate, cadence)
    : null;

  const totalProjectPoints = getTotalProjectPoints(product);
  const sprintRecords = [];

  for (const [i, sprint] of sprintsWithDates.entries()) {
    const prevSprint = i > 0 ? sprintsWithDates[i - 1] ?? null : null;

    // Compute per-sprint velocity and cumulative completed points
    const { doneValue, cumulativeCompleted } = reduceRibs(product, (acc, rib) => {
      const ribPts = getRibItemPoints(rib, product.sizeMapping);
      if (ribPts === 0) return acc;

      const pctAsOf = getRibItemPercentCompleteAsOf(rib, sprint.id, sortedSprints);
      const pctPrev = prevSprint
        ? getRibItemPercentCompleteAsOf(rib, prevSprint.id, sortedSprints)
        : 0;

      acc.doneValue += ribPts * (pctAsOf - pctPrev) / 100;
      acc.cumulativeCompleted += ribPts * pctAsOf / 100;
      return acc;
    }, { doneValue: 0, cumulativeCompleted: 0 });

    const startDate = prevSprint
      ? addDays(prevSprint.endDate, 1)
      : firstSprintStart;

    sprintRecords.push({
      id: sprint.id,
      projectId: product.id,
      sprintNumber: i + 1,
      sprintStartDate: startDate,
      sprintFinishDate: sprint.endDate,
      doneValue: round2(doneValue),
      backlogAtSprintEnd: round2(totalProjectPoints - cumulativeCompleted),
      includedInForecast: true,
      createdAt,
      updatedAt,
    });
  }

  // --- Project ---
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- forecaster project object has dynamic optional fields
  const project: Record<string, any> = {
    id: product.id,
    name: product.name,
    unitOfMeasure: 'Story Points',
    createdAt,
    updatedAt,
  };
  if (cadence) project.sprintCadenceWeeks = cadence;
  if (firstSprintStart) project.firstSprintStartDate = firstSprintStart;
  if (milestones.length > 0) project.milestones = milestones;

  return {
    version: '1.0',
    exportedAt: now,
    projects: [project],
    sprints: sprintRecords,
  };
}

/** Download the Forecaster export as a JSON file. */
export function downloadForecasterExport(product: Product): void {
  const data = buildForecasterExport(product);
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  a.href = url;
  a.download = `${product.name.replace(/[^a-zA-Z0-9]/g, '_')}_forecaster_${timestamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
}
