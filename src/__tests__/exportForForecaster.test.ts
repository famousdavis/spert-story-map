// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { addDays, computeFirstSprintStartDate, buildForecasterExport } from '../lib/exportForForecaster';
import type { Product, Theme, Backbone, RibItem, ReleaseAllocation, ProgressEntry, Size, Category } from '../types';
import { req } from './testHelpers';

const SIZE_MAPPING = [
  { label: 'S', points: 10 },
  { label: 'M', points: 20 },
  { label: 'L', points: 40 },
];

function makeRib(id: string, { size = null, category = 'core', allocations = [], history = [] }: {
  size?: Size;
  category?: Category;
  allocations?: ReleaseAllocation[];
  history?: ProgressEntry[];
} = {}): RibItem {
  return {
    id, name: `Rib ${id}`, description: '', size, category, order: 1,
    releaseAllocations: allocations,
    progressHistory: history,
  };
}

function makeBackbone(id: string, ribs: RibItem[] = []) {
  // `backboneItems: undefined` is deliberate malformed-shape test data, so the
  // return type stays inferred rather than annotated as Backbone.
  return { id, name: `Backbone ${id}`, backboneItems: undefined, ribItems: ribs, order: 1 };
}

function makeTheme(id: string, backbones: Backbone[] = []): Theme {
  return { id, name: `Theme ${id}`, backboneItems: backbones, order: 1 };
}

// Annotated both ways: an untyped `overrides` made `themes`/`releases`/`sprints`
// infer never[], and the literal was missing `description` and `schemaVersion`,
// so every one of the 29 call sites reported the same two absences.
function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1',
    name: 'Test Product',
    description: '',
    schemaVersion: 2,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-02-01T00:00:00.000Z',
    sprintCadenceWeeks: 2,
    sizeMapping: SIZE_MAPPING,
    themes: [],
    releases: [],
    sprints: [],
    releaseCardOrder: {},
    ...overrides,
  };
}

// --- addDays ---
describe('addDays', () => {
  it('adds positive days', () => {
    expect(addDays('2026-01-10', 5)).toBe('2026-01-15');
  });

  it('subtracts days with negative value', () => {
    expect(addDays('2026-01-15', -5)).toBe('2026-01-10');
  });

  it('crosses month boundary forward', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  it('crosses month boundary backward', () => {
    expect(addDays('2026-02-01', -1)).toBe('2026-01-31');
  });

  it('crosses year boundary', () => {
    expect(addDays('2025-12-31', 1)).toBe('2026-01-01');
  });
});

// --- computeFirstSprintStartDate ---
describe('computeFirstSprintStartDate', () => {
  it('returns null when endDate is null', () => {
    expect(computeFirstSprintStartDate(null, 2)).toBeNull();
  });

  it('returns null when cadenceWeeks is null', () => {
    expect(computeFirstSprintStartDate('2026-01-24', null)).toBeNull();
  });

  it('computes correctly for 2-week cadence', () => {
    // endDate = Jan 24, cadence = 2 weeks (14 days), start = Jan 24 - 13 = Jan 11
    expect(computeFirstSprintStartDate('2026-01-24', 2)).toBe('2026-01-11');
  });

  it('computes correctly for 1-week cadence', () => {
    // endDate = Jan 10, cadence = 1 week (7 days), start = Jan 10 - 6 = Jan 4
    expect(computeFirstSprintStartDate('2026-01-10', 1)).toBe('2026-01-04');
  });

  it('computes correctly for 3-week cadence', () => {
    // endDate = Jan 21, cadence = 3 weeks (21 days), start = Jan 21 - 20 = Jan 1
    expect(computeFirstSprintStartDate('2026-01-21', 3)).toBe('2026-01-01');
  });
});

// --- buildForecasterExport: basic structure ---
describe('buildForecasterExport — structure', () => {
  it('returns correct envelope fields', () => {
    const result = buildForecasterExport(makeProduct());
    expect(result.version).toBe('1.0');
    expect(result.exportedAt).toBeTruthy();
    expect(Array.isArray(result.projects)).toBe(true);
    expect(Array.isArray(result.sprints)).toBe(true);
  });

  it('has exactly one project', () => {
    const result = buildForecasterExport(makeProduct());
    expect(result.projects).toHaveLength(1);
  });

  it('maps project fields correctly', () => {
    const result = buildForecasterExport(makeProduct());
    const proj = req(result.projects[0], 'proj');
    expect(proj.id).toBe('prod-1');
    expect(proj.name).toBe('Test Product');
    expect(proj.unitOfMeasure).toBe('Story Points');
    expect(proj.sprintCadenceWeeks).toBe(2);
    expect(proj.createdAt).toBe('2026-01-01T00:00:00.000Z');
    expect(proj.updatedAt).toBe('2026-02-01T00:00:00.000Z');
  });

  it('omits milestones when no releases', () => {
    const result = buildForecasterExport(makeProduct());
    expect(req(result.projects[0], 'projects[0]').milestones).toBeUndefined();
  });

  it('omits firstSprintStartDate when no sprints', () => {
    const result = buildForecasterExport(makeProduct());
    expect(req(result.projects[0], 'projects[0]').firstSprintStartDate).toBeUndefined();
  });

  it('returns empty sprints array when no sprints', () => {
    const result = buildForecasterExport(makeProduct());
    expect(result.sprints).toHaveLength(0);
  });
});

// --- buildForecasterExport: milestones ---
describe('buildForecasterExport — milestones', () => {
  it('creates milestones from releases with allocated points', () => {
    const rib = makeRib('r1', {
      size: 'M',
      allocations: [{ releaseId: 'rel-1', percentage: 60 }, { releaseId: 'rel-2', percentage: 40 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [
        { id: 'rel-1', name: 'Release 1', order: 1 },
        { id: 'rel-2', name: 'Release 2', order: 2 },
      ],
    });

    const result = buildForecasterExport(product);
    const milestones = result.projects[0]?.milestones;
    expect(milestones).toHaveLength(2);
    expect(milestones[0].name).toBe('Release 1');
    expect(milestones[0].backlogSize).toBe(12); // 20 * 60/100
    expect(milestones[1].name).toBe('Release 2');
    expect(milestones[1].backlogSize).toBe(8); // 20 * 40/100
  });

  it('skips releases with 0 allocated points', () => {
    const rib = makeRib('r1', {
      size: 'M',
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [
        { id: 'rel-1', name: 'Release 1', order: 1 },
        { id: 'rel-2', name: 'Empty Release', order: 2 },
      ],
    });

    const result = buildForecasterExport(product);
    const milestones = result.projects[0]?.milestones;
    expect(milestones).toHaveLength(1);
    expect(milestones[0].name).toBe('Release 1');
  });

  it('cycles colors through MILESTONE_HEX_COLORS', () => {
    const ribs = Array.from({ length: 9 }, (_, i) => makeRib(`r${i}`, {
      size: 'S',
      allocations: [{ releaseId: `rel-${i}`, percentage: 100 }],
    }));
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', ribs)])],
      releases: Array.from({ length: 9 }, (_, i) => ({
        id: `rel-${i}`, name: `Release ${i}`, order: i + 1,
      })),
    });

    const result = buildForecasterExport(product);
    const milestones = result.projects[0]?.milestones;
    expect(milestones).toHaveLength(9);
    // 9th milestone (index 8) wraps back to first color
    expect(milestones[8].color).toBe(milestones[0].color);
    // First two have different colors
    expect(milestones[0].color).not.toBe(milestones[1].color);
  });

  it('assigns colors based on kept milestones, not original release indices', () => {
    const rib = makeRib('r1', {
      size: 'M',
      allocations: [{ releaseId: 'rel-2', percentage: 100 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [
        { id: 'rel-1', name: 'Empty', order: 1 },
        { id: 'rel-2', name: 'Has Points', order: 2 },
      ],
    });

    const result = buildForecasterExport(product);
    const milestones = result.projects[0]?.milestones;
    expect(milestones).toHaveLength(1);
    // Gets first color since it's the first kept milestone
    expect(milestones[0].color).toBe('#2563eb');
  });

  it('preserves release order', () => {
    const rib = makeRib('r1', {
      size: 'L',
      allocations: [
        { releaseId: 'rel-b', percentage: 50 },
        { releaseId: 'rel-a', percentage: 50 },
      ],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [
        { id: 'rel-b', name: 'Beta', order: 2 },
        { id: 'rel-a', name: 'Alpha', order: 1 },
      ],
    });

    const result = buildForecasterExport(product);
    const milestones = result.projects[0]?.milestones;
    expect(milestones[0].name).toBe('Alpha');
    expect(milestones[1].name).toBe('Beta');
  });
});

// --- buildForecasterExport: milestone backlogSize is REMAINING work ---
// Forecaster reads a milestone's backlogSize as the work still to deliver for
// that release, and 0 as "completed". Until v0.53.8 the export sent each
// release's TOTAL points, so finished work arrived counted as outstanding.
describe('buildForecasterExport — milestone remaining work', () => {
  const sizedBacklogs = (product: Product) =>
    buildForecasterExport(product).projects[0]?.milestones.map(
      (m: { backlogSize: number }) => m.backlogSize);

  it('sends the work remaining in each release, not its total', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', { // 40 pts, 30 done
          size: 'L', allocations: [{ releaseId: 'rel-1', percentage: 100 }],
          history: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 75 }],
        }),
        makeRib('r2', { size: 'M', allocations: [{ releaseId: 'rel-1', percentage: 100 }] }), // 20 pts, none done
        makeRib('r3', { // 10 pts, 4 done
          size: 'S', allocations: [{ releaseId: 'rel-2', percentage: 100 }],
          history: [{ sprintId: 's1', releaseId: 'rel-2', percentComplete: 40 }],
        }),
      ])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }, { id: 'rel-2', name: 'R2', order: 2 }],
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' }],
    });
    // Totals would be [60, 10].
    expect(sizedBacklogs(product)).toEqual([30, 6]);
  });

  it('sends a fully done release as 0, which Forecaster reads as completed, rather than skipping it', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', {
          size: 'S', allocations: [{ releaseId: 'rel-1', percentage: 100 }],
          history: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 100 }],
        }),
        makeRib('r2', { size: 'M', allocations: [{ releaseId: 'rel-2', percentage: 100 }] }),
      ])])],
      releases: [{ id: 'rel-1', name: 'Done', order: 1 }, { id: 'rel-2', name: 'Open', order: 2 }],
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' }],
    });
    const milestones = buildForecasterExport(product).projects[0]?.milestones;
    expect(milestones.map((m: { name: string }) => m.name)).toEqual(['Done', 'Open']);
    expect(sizedBacklogs(product)).toEqual([0, 20]);
  });

  it('counts a split rib only against the share allocated to each release', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [makeRib('r1', {
        size: 'M', // 20 pts: 10 to each release
        allocations: [{ releaseId: 'rel-1', percentage: 50 }, { releaseId: 'rel-2', percentage: 50 }],
        history: [
          { sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 }, // rel-1's half is done
          { sprintId: 's1', releaseId: 'rel-2', percentComplete: 20 }, // 4 of rel-2's 10
        ],
      })])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }, { id: 'rel-2', name: 'R2', order: 2 }],
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' }],
    });
    expect(sizedBacklogs(product)).toEqual([0, 6]);
  });

  it('measures at the last exported sprint, the one whose backlogAtSprintEnd Forecaster reads', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [makeRib('r1', {
        size: 'L', allocations: [{ releaseId: 'rel-1', percentage: 100 }],
        history: [
          { sprintId: 's1', releaseId: 'rel-1', percentComplete: 25 },
          { sprintId: 's2', releaseId: 'rel-1', percentComplete: 50 },
          { sprintId: 's3', releaseId: 'rel-1', percentComplete: 100 },
        ],
      })])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [
        { id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' },
        { id: 's2', name: 'Sprint 2', order: 2, endDate: '2026-01-24' },
        // Undated, so not exported. Its progress is outside the history
        // Forecaster receives, and must not appear in the milestone either.
        { id: 's3', name: 'Sprint 3', order: 3, endDate: null },
      ],
    });
    const result = buildForecasterExport(product);
    expect(result.sprints).toHaveLength(2);
    // As of s2: 40 × 50% left. (As of s1 it would be 30, latest progress 0, total 40.)
    expect(sizedBacklogs(product)).toEqual([20]);
    expect(result.sprints[1]?.backlogAtSprintEnd).toBe(20);
  });

  it('adds up to the backlog Forecaster reads when every rib is fully allocated', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', {
          size: 'S', allocations: [{ releaseId: 'rel-1', percentage: 100 }],
          history: [
            { sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 },
            { sprintId: 's2', releaseId: 'rel-1', percentComplete: 70 },
          ],
        }),
        makeRib('r2', {
          size: 'L',
          allocations: [{ releaseId: 'rel-1', percentage: 25 }, { releaseId: 'rel-2', percentage: 75 }],
          history: [
            { sprintId: 's1', releaseId: 'rel-1', percentComplete: 10 },
            { sprintId: 's2', releaseId: 'rel-2', percentComplete: 30 },
          ],
        }),
        makeRib('r3', {
          size: 'M', allocations: [{ releaseId: 'rel-3', percentage: 100 }],
          history: [{ sprintId: 's1', releaseId: 'rel-3', percentComplete: 35 }],
        }),
      ])])],
      releases: [
        { id: 'rel-1', name: 'R1', order: 1 },
        { id: 'rel-2', name: 'R2', order: 2 },
        { id: 'rel-3', name: 'R3', order: 3 },
      ],
      sprints: [
        { id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' },
        { id: 's2', name: 'Sprint 2', order: 2, endDate: '2026-01-24' },
      ],
    });
    const result = buildForecasterExport(product);
    // R1: 10 + 10 allocated, 7 + 4 done. R2: 30 allocated, 12 done. R3: 20 allocated, 7 done.
    // Exact here because every figure is whole. Each milestone and the backlog
    // are rounded to 2 places separately, so with fractional points the sum can
    // overshoot by up to 0.005 per release. Forecaster should compare with a
    // tolerance; this export cannot make the rounded parts add up exactly.
    expect(sizedBacklogs(product)).toEqual([9, 18, 13]);
    expect(9 + 18 + 13).toBe(result.sprints[1]?.backlogAtSprintEnd);
  });

  it('uses the latest sprint by order when no sprint has an end date', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [makeRib('r1', {
        size: 'M', allocations: [{ releaseId: 'rel-1', percentage: 100 }],
        // Recorded out of order: sprint 1 was back-filled after sprint 2.
        history: [
          { sprintId: 's2', releaseId: 'rel-1', percentComplete: 60 },
          { sprintId: 's1', releaseId: 'rel-1', percentComplete: 30 },
        ],
      })])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [
        { id: 's1', name: 'Sprint 1', order: 1, endDate: null },
        { id: 's2', name: 'Sprint 2', order: 2, endDate: null },
      ],
    });
    expect(buildForecasterExport(product).sprints).toHaveLength(0);
    // As of s2: 20 × 40% left. (Last entry by position, s1's 30%, would leave 14.)
    expect(sizedBacklogs(product)).toEqual([8]);
  });

  it('declares that milestone backlogSize is remaining work', () => {
    expect(buildForecasterExport(makeProduct()).milestoneBacklog).toBe('remaining');
  });
});

// --- buildForecasterExport: sprint mapping ---
describe('buildForecasterExport — sprint mapping', () => {
  it('maps sprint numbers as 1-based from sorted order', () => {
    const product = makeProduct({
      sprints: [
        { id: 's2', name: 'Sprint 2', order: 2, endDate: '2026-01-24' },
        { id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' },
      ],
    });

    const result = buildForecasterExport(product);
    expect(result.sprints[0]?.sprintNumber).toBe(1);
    expect(result.sprints[0]?.id).toBe('s1');
    expect(result.sprints[1]?.sprintNumber).toBe(2);
    expect(result.sprints[1]?.id).toBe('s2');
  });

  it('computes sprint dates correctly', () => {
    const product = makeProduct({
      sprintCadenceWeeks: 2,
      sprints: [
        { id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-24' },
        { id: 's2', name: 'Sprint 2', order: 2, endDate: '2026-02-07' },
      ],
    });

    const result = buildForecasterExport(product);
    // Sprint 1: start = Jan 24 - 13 = Jan 11
    expect(result.sprints[0]?.sprintStartDate).toBe('2026-01-11');
    expect(result.sprints[0]?.sprintFinishDate).toBe('2026-01-24');
    // Sprint 2: start = Jan 24 + 1 = Jan 25
    expect(result.sprints[1]?.sprintStartDate).toBe('2026-01-25');
    expect(result.sprints[1]?.sprintFinishDate).toBe('2026-02-07');
  });

  it('skips sprints without endDate', () => {
    const product = makeProduct({
      sprints: [
        { id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' },
        { id: 's2', name: 'Sprint 2', order: 2, endDate: null },
        { id: 's3', name: 'Sprint 3', order: 3, endDate: '2026-02-07' },
      ],
    });

    const result = buildForecasterExport(product);
    expect(result.sprints).toHaveLength(2);
    expect(result.sprints[0]?.id).toBe('s1');
    expect(result.sprints[1]?.id).toBe('s3');
    expect(result.sprints[1]?.sprintNumber).toBe(2);
  });

  it('sets includedInForecast to true for all sprints', () => {
    const product = makeProduct({
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' }],
    });

    const result = buildForecasterExport(product);
    expect(result.sprints[0]?.includedInForecast).toBe(true);
  });

  it('sets firstSprintStartDate on project when sprints exist', () => {
    const product = makeProduct({
      sprintCadenceWeeks: 2,
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-24' }],
    });

    const result = buildForecasterExport(product);
    expect(result.projects[0]?.firstSprintStartDate).toBe('2026-01-11');
  });
});

// --- buildForecasterExport: doneValue (delta percent math) ---
describe('buildForecasterExport — doneValue', () => {
  it('computes doneValue for a single sprint', () => {
    const rib = makeRib('r1', {
      size: 'M', // 20 points
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' }],
    });

    const result = buildForecasterExport(product);
    expect(result.sprints[0]?.doneValue).toBe(10); // 20 * 50/100
  });

  it('computes doneValue as delta between consecutive sprints', () => {
    const rib = makeRib('r1', {
      size: 'L', // 40 points
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [
        { sprintId: 's1', releaseId: 'rel-1', percentComplete: 25 },
        { sprintId: 's2', releaseId: 'rel-1', percentComplete: 75 },
      ],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [
        { id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' },
        { id: 's2', name: 'Sprint 2', order: 2, endDate: '2026-01-24' },
      ],
    });

    const result = buildForecasterExport(product);
    expect(result.sprints[0]?.doneValue).toBe(10); // 40 * 25/100
    expect(result.sprints[1]?.doneValue).toBe(20); // 40 * (75-25)/100
  });

  it('sums doneValue across multiple ribs', () => {
    const rib1 = makeRib('r1', {
      size: 'S', // 10 points
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 100 }],
    });
    const rib2 = makeRib('r2', {
      size: 'M', // 20 points
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib1, rib2])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' }],
    });

    const result = buildForecasterExport(product);
    expect(result.sprints[0]?.doneValue).toBe(20); // 10*100/100 + 20*50/100
  });

  it('returns 0 doneValue for sprint with no progress', () => {
    const rib = makeRib('r1', {
      size: 'M', // 20 points
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' }],
    });

    const result = buildForecasterExport(product);
    expect(result.sprints[0]?.doneValue).toBe(0);
  });

  it('returns 0 doneValue when progress is only in earlier sprints', () => {
    const rib = makeRib('r1', {
      size: 'M',
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [
        { id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' },
        { id: 's2', name: 'Sprint 2', order: 2, endDate: '2026-01-24' },
      ],
    });

    const result = buildForecasterExport(product);
    expect(result.sprints[0]?.doneValue).toBe(10); // 20 * 50/100
    expect(result.sprints[1]?.doneValue).toBe(0);  // no new progress
  });
});

// --- buildForecasterExport: backlogAtSprintEnd ---
describe('buildForecasterExport — backlogAtSprintEnd', () => {
  it('computes remaining backlog correctly', () => {
    const rib = makeRib('r1', {
      size: 'L', // 40 points
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [
        { sprintId: 's1', releaseId: 'rel-1', percentComplete: 25 },
        { sprintId: 's2', releaseId: 'rel-1', percentComplete: 75 },
      ],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [
        { id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' },
        { id: 's2', name: 'Sprint 2', order: 2, endDate: '2026-01-24' },
      ],
    });

    const result = buildForecasterExport(product);
    expect(result.sprints[0]?.backlogAtSprintEnd).toBe(30); // 40 - 40*25/100
    expect(result.sprints[1]?.backlogAtSprintEnd).toBe(10); // 40 - 40*75/100
  });

  it('includes unallocated ribs in backlog total', () => {
    const allocatedRib = makeRib('r1', {
      size: 'M', // 20 points
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
    });
    const unallocatedRib = makeRib('r2', { size: 'S' }); // 10 points, no allocations
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [allocatedRib, unallocatedRib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' }],
    });

    const result = buildForecasterExport(product);
    // Total = 30 (20 + 10), no progress, so backlog = 30
    expect(result.sprints[0]?.backlogAtSprintEnd).toBe(30);
  });
});

// --- buildForecasterExport: edge cases ---
describe('buildForecasterExport — edge cases', () => {
  it('handles empty product (no themes)', () => {
    const result = buildForecasterExport(makeProduct());
    expect(result.projects).toHaveLength(1);
    expect(result.sprints).toHaveLength(0);
    expect(req(result.projects[0], 'projects[0]').milestones).toBeUndefined();
  });

  it('handles unsized ribs (0 points)', () => {
    const rib = makeRib('r1', {
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 100 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' }],
    });

    const result = buildForecasterExport(product);
    // Release has 0 points from unsized rib, so no milestone
    expect(req(result.projects[0], 'projects[0]').milestones).toBeUndefined();
    expect(result.sprints[0]?.doneValue).toBe(0);
  });

  it('handles partial allocation percentages', () => {
    const rib = makeRib('r1', {
      size: 'L', // 40 points
      allocations: [{ releaseId: 'rel-1', percentage: 30 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
    });

    const result = buildForecasterExport(product);
    const milestones = result.projects[0]?.milestones;
    expect(milestones).toHaveLength(1);
    expect(milestones[0].backlogSize).toBe(12); // 40 * 30/100
  });

  it('handles all sprints missing endDate', () => {
    const product = makeProduct({
      sprints: [
        { id: 's1', name: 'Sprint 1', order: 1, endDate: null },
        { id: 's2', name: 'Sprint 2', order: 2, endDate: null },
      ],
    });

    const result = buildForecasterExport(product);
    expect(result.sprints).toHaveLength(0);
    expect(req(result.projects[0], 'projects[0]').firstSprintStartDate).toBeUndefined();
  });

  it('rounds values to avoid floating-point noise', () => {
    // 40 points * 33/100 = 13.2 allocated, which is 13.200000000000001 in
    // floating point. 9 of that 33% done leaves 9.6, unrounded 9.600000000000001.
    const rib = makeRib('r1', {
      size: 'L',
      allocations: [{ releaseId: 'rel-1', percentage: 33 }],
      history: [{ sprintId: 's1', releaseId: 'rel-1', percentComplete: 9 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [{ id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-10' }],
    });

    const result = buildForecasterExport(product);
    // backlogSize = 13.2 allocated - 13.2 * 9/33 done = 9.6
    expect(result.projects[0]?.milestones[0]?.backlogSize).toBe(9.6);
    expect(String(result.projects[0]?.milestones[0]?.backlogSize)).toBe('9.6');
    // doneValue = 40 * 9/100 = 3.6
    expect(result.sprints[0]?.doneValue).toBe(3.6);
    // Verify no floating-point noise
    expect(String(result.sprints[0]?.doneValue)).toBe('3.6');
  });
});

// --- Full integration scenario ---
describe('buildForecasterExport — integration', () => {
  it('produces correct output for a realistic product', () => {
    const rib1 = makeRib('r1', {
      size: 'S', // 10 points
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [
        { sprintId: 's1', releaseId: 'rel-1', percentComplete: 50 },
        { sprintId: 's2', releaseId: 'rel-1', percentComplete: 100 },
      ],
    });
    const rib2 = makeRib('r2', {
      size: 'M', // 20 points
      allocations: [
        { releaseId: 'rel-1', percentage: 50 },
        { releaseId: 'rel-2', percentage: 50 },
      ],
      history: [
        { sprintId: 's1', releaseId: 'rel-1', percentComplete: 25 },
        { sprintId: 's2', releaseId: 'rel-1', percentComplete: 50 },
        { sprintId: 's2', releaseId: 'rel-2', percentComplete: 20 },
        { sprintId: 's3', releaseId: 'rel-2', percentComplete: 50 },
      ],
    });
    const rib3 = makeRib('r3', { size: 'L' }); // 40 points, unallocated, no progress

    const product = makeProduct({
      sprintCadenceWeeks: 2,
      themes: [makeTheme('t1', [makeBackbone('b1', [rib1, rib2, rib3])])],
      releases: [
        { id: 'rel-1', name: 'MVP', order: 1 },
        { id: 'rel-2', name: 'GA', order: 2 },
      ],
      sprints: [
        { id: 's1', name: 'Sprint 1', order: 1, endDate: '2026-01-24' },
        { id: 's2', name: 'Sprint 2', order: 2, endDate: '2026-02-07' },
        { id: 's3', name: 'Sprint 3', order: 3, endDate: '2026-02-21' },
      ],
    });

    const result = buildForecasterExport(product);

    // Project
    const proj = req(result.projects[0], 'proj');
    expect(proj.unitOfMeasure).toBe('Story Points');
    expect(proj.firstSprintStartDate).toBe('2026-01-11');

    // Milestones: work REMAINING per release, as of Sprint 3 (the last exported).
    // MVP: 20 allocated (rib1 100% of 10 + rib2 50% of 20). rib1 is at 100% and
    //      rib2's rel-1 entry is at 50 of its 50, so all 20 are done → 0.
    // GA:  10 allocated (rib2 50% of 20). rib2's rel-2 entry is at 50 of 50 → 0.
    // Both are complete. The 40 left in Sprint 3's backlog is rib3, unallocated.
    expect(proj.milestones).toHaveLength(2);
    expect(proj.milestones[0]?.name).toBe('MVP');
    expect(proj.milestones[0]?.backlogSize).toBe(0);
    expect(proj.milestones[1]?.name).toBe('GA');
    expect(proj.milestones[1]?.backlogSize).toBe(0);

    // Total project points = 10 + 20 + 40 = 70

    // Sprint 1:
    // rib1: pctAsOf=50, pctPrev=0, done=10*50/100=5
    // rib2: pctAsOf=25 (only rel-1 entry), pctPrev=0, done=20*25/100=5
    // rib3: 0 points, skip
    // doneValue = 5 + 5 = 10
    // cumulativeCompleted = 5 + 5 = 10
    // backlogAtSprintEnd = 70 - 10 = 60
    expect(result.sprints[0]?.doneValue).toBe(10);
    expect(result.sprints[0]?.backlogAtSprintEnd).toBe(60);
    expect(result.sprints[0]?.sprintStartDate).toBe('2026-01-11');
    expect(result.sprints[0]?.sprintFinishDate).toBe('2026-01-24');

    // Sprint 2:
    // rib1: pctAsOf=100, pctPrev=50, done=10*50/100=5
    // rib2: pctAsOf=50+20=70, pctPrev=25, done=20*45/100=9
    // doneValue = 5 + 9 = 14
    // cumulativeCompleted = 10 + 14 = 24
    // backlogAtSprintEnd = 70 - 24 = 46
    expect(result.sprints[1]?.doneValue).toBe(14);
    expect(result.sprints[1]?.backlogAtSprintEnd).toBe(46);
    expect(result.sprints[1]?.sprintStartDate).toBe('2026-01-25');

    // Sprint 3:
    // rib1: pctAsOf=100, pctPrev=100, done=0
    // rib2: pctAsOf=50+50=100, pctPrev=70, done=20*30/100=6
    // doneValue = 0 + 6 = 6
    // cumulativeCompleted = 24 + 6 = 30
    // backlogAtSprintEnd = 70 - 30 = 40
    expect(result.sprints[2]?.doneValue).toBe(6);
    expect(result.sprints[2]?.backlogAtSprintEnd).toBe(40);
    expect(result.sprints[2]?.sprintStartDate).toBe('2026-02-08');
  });
});
