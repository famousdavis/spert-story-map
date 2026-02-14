import { describe, it, expect } from 'vitest';
import {
  getRibItemPoints,
  getAllRibItems,
  getTotalProjectPoints,
  getPointsForRelease,
  getCoreNonCorePoints,
  getRibReleaseProgressForSprint,
  getRibReleaseProgressAsOf,
  getRibReleaseProgress,
  getRibItemPercentComplete,
  getRibItemPercentCompleteForSprint,
  getRibItemPercentCompleteAsOf,
  getReleasePercentComplete,
  getProjectPercentComplete,
  getCoreNonCorePointsForRelease,
  getAllocationTotal,
  getSizingDistribution,
  getThemeStats,
  getBackboneStats,
  getProgressOverTime,
  getSprintSummary,
  getReleaseProgressOverTime,
} from '../lib/calculations';

const SIZE_MAPPING = [
  { label: 'S', points: 10 },
  { label: 'M', points: 20 },
  { label: 'L', points: 40 },
];

function makeRib(id, { size = null, category = 'core', allocations = [], history = [] } = {}) {
  return {
    id,
    name: `Rib ${id}`,
    size,
    category,
    releaseAllocations: allocations,
    progressHistory: history,
    order: 1,
  };
}

function makeBackbone(id, ribs = []) {
  return { id, name: `Backbone ${id}`, ribItems: ribs, order: 1 };
}

function makeTheme(id, backbones = []) {
  return { id, name: `Theme ${id}`, backboneItems: backbones, order: 1 };
}

function makeProduct({ themes = [], releases = [], sprints = [], sizeMapping = SIZE_MAPPING } = {}) {
  return { themes, releases, sprints, sizeMapping, releaseCardOrder: {} };
}

// --- getRibItemPoints ---
describe('getRibItemPoints', () => {
  it('returns 0 for unsized rib', () => {
    expect(getRibItemPoints(makeRib('r1'), SIZE_MAPPING)).toBe(0);
  });

  it('returns correct points for sized rib', () => {
    expect(getRibItemPoints(makeRib('r1', { size: 'M' }), SIZE_MAPPING)).toBe(20);
  });

  it('returns 0 for unknown size', () => {
    expect(getRibItemPoints(makeRib('r1', { size: 'XXXL' }), SIZE_MAPPING)).toBe(0);
  });
});

// --- getAllRibItems ---
describe('getAllRibItems', () => {
  it('returns empty array for empty product', () => {
    expect(getAllRibItems(makeProduct())).toEqual([]);
  });

  it('flattens ribs from all themes/backbones', () => {
    const product = makeProduct({
      themes: [
        makeTheme('t1', [makeBackbone('b1', [makeRib('r1'), makeRib('r2')])]),
        makeTheme('t2', [makeBackbone('b2', [makeRib('r3')])]),
      ],
    });
    const items = getAllRibItems(product);
    expect(items).toHaveLength(3);
    expect(items[0].themeId).toBe('t1');
    expect(items[0].backboneId).toBe('b1');
    expect(items[2].themeId).toBe('t2');
  });
});

// --- getTotalProjectPoints ---
describe('getTotalProjectPoints', () => {
  it('returns 0 for empty product', () => {
    expect(getTotalProjectPoints(makeProduct())).toBe(0);
  });

  it('sums points across all ribs', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', { size: 'S' }),
        makeRib('r2', { size: 'M' }),
        makeRib('r3'), // unsized
      ])])],
    });
    expect(getTotalProjectPoints(product)).toBe(30); // 10 + 20 + 0
  });
});

// --- getPointsForRelease ---
describe('getPointsForRelease', () => {
  it('returns 0 if no ribs allocated to release', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [makeRib('r1', { size: 'M' })])])],
    });
    expect(getPointsForRelease(product, 'rel-1')).toBe(0);
  });

  it('calculates points based on allocation percentage', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', { size: 'M', allocations: [{ releaseId: 'rel-1', percentage: 50, memo: '' }] }),
      ])])],
    });
    expect(getPointsForRelease(product, 'rel-1')).toBe(10); // 20 * 0.5
  });

  it('handles 100% allocation', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', { size: 'L', allocations: [{ releaseId: 'rel-1', percentage: 100, memo: '' }] }),
      ])])],
    });
    expect(getPointsForRelease(product, 'rel-1')).toBe(40);
  });
});

// --- getCoreNonCorePoints ---
describe('getCoreNonCorePoints', () => {
  it('separates core and non-core points', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', { size: 'S', category: 'core' }),
        makeRib('r2', { size: 'M', category: 'non-core' }),
        makeRib('r3', { size: 'L', category: 'core' }),
      ])])],
    });
    const { core, nonCore } = getCoreNonCorePoints(product);
    expect(core).toBe(50); // 10 + 40
    expect(nonCore).toBe(20);
  });
});

// --- getRibReleaseProgressForSprint ---
describe('getRibReleaseProgressForSprint', () => {
  it('returns null if no matching entry', () => {
    const rib = makeRib('r1');
    expect(getRibReleaseProgressForSprint(rib, 'rel-1', 'sp-1')).toBeNull();
  });

  it('returns the percentComplete for matching sprint+release', () => {
    const rib = makeRib('r1', {
      history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 42 }],
    });
    expect(getRibReleaseProgressForSprint(rib, 'rel-1', 'sp-1')).toBe(42);
  });

  it('returns null for different sprint', () => {
    const rib = makeRib('r1', {
      history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 42 }],
    });
    expect(getRibReleaseProgressForSprint(rib, 'rel-1', 'sp-2')).toBeNull();
  });
});

// --- getRibReleaseProgress ---
describe('getRibReleaseProgress', () => {
  it('returns 0 for no history', () => {
    expect(getRibReleaseProgress(makeRib('r1'), 'rel-1')).toBe(0);
  });

  it('returns the last non-null entry', () => {
    const rib = makeRib('r1', {
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 20 },
        { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 60 },
      ],
    });
    expect(getRibReleaseProgress(rib, 'rel-1')).toBe(60);
  });

  it('skips null percentComplete entries', () => {
    const rib = makeRib('r1', {
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 30 },
        { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: null, comment: 'note' },
      ],
    });
    expect(getRibReleaseProgress(rib, 'rel-1')).toBe(30);
  });
});

// --- getRibReleaseProgressAsOf ---
describe('getRibReleaseProgressAsOf', () => {
  const sprints = [
    { id: 'sp-1', order: 1 },
    { id: 'sp-2', order: 2 },
    { id: 'sp-3', order: 3 },
  ];

  it('returns 0 for no history', () => {
    expect(getRibReleaseProgressAsOf(makeRib('r1'), 'rel-1', 'sp-2', sprints)).toBe(0);
  });

  it('walks back to find latest entry at or before target sprint', () => {
    const rib = makeRib('r1', {
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 20 },
        { sprintId: 'sp-3', releaseId: 'rel-1', percentComplete: 80 },
      ],
    });
    // As of sprint 2, should use sprint 1's value
    expect(getRibReleaseProgressAsOf(rib, 'rel-1', 'sp-2', sprints)).toBe(20);
    // As of sprint 3, should use sprint 3's value
    expect(getRibReleaseProgressAsOf(rib, 'rel-1', 'sp-3', sprints)).toBe(80);
  });
});

// --- getRibItemPercentComplete ---
describe('getRibItemPercentComplete', () => {
  it('returns 0 for no history', () => {
    expect(getRibItemPercentComplete(makeRib('r1'))).toBe(0);
  });

  it('sums per-release entries for the last sprint', () => {
    const rib = makeRib('r1', {
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 30 },
        { sprintId: 'sp-1', releaseId: 'rel-2', percentComplete: 20 },
      ],
    });
    expect(getRibItemPercentComplete(rib)).toBe(50);
  });

  it('caps at 100', () => {
    const rib = makeRib('r1', {
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 80 },
        { sprintId: 'sp-1', releaseId: 'rel-2', percentComplete: 80 },
      ],
    });
    expect(getRibItemPercentComplete(rib)).toBe(100);
  });
});

// --- getRibItemPercentCompleteForSprint ---
describe('getRibItemPercentCompleteForSprint', () => {
  it('returns null if no entries for sprint', () => {
    const rib = makeRib('r1', {
      history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 50 }],
    });
    expect(getRibItemPercentCompleteForSprint(rib, 'sp-2')).toBeNull();
  });

  it('sums all release entries for a sprint', () => {
    const rib = makeRib('r1', {
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 30 },
        { sprintId: 'sp-1', releaseId: 'rel-2', percentComplete: 25 },
      ],
    });
    expect(getRibItemPercentCompleteForSprint(rib, 'sp-1')).toBe(55);
  });
});

// --- getReleasePercentComplete ---
describe('getReleasePercentComplete', () => {
  it('returns 0 for no allocated ribs', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [makeRib('r1', { size: 'M' })])])],
    });
    expect(getReleasePercentComplete(product, 'rel-1')).toBe(0);
  });

  it('computes weighted percent complete', () => {
    const rib = makeRib('r1', {
      size: 'M',
      allocations: [{ releaseId: 'rel-1', percentage: 100, memo: '' }],
      history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 50 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      sprints: [{ id: 'sp-1', order: 1 }],
    });
    expect(getReleasePercentComplete(product, 'rel-1')).toBe(50);
  });
});

// --- getProjectPercentComplete ---
describe('getProjectPercentComplete', () => {
  it('returns 0 for empty product', () => {
    expect(getProjectPercentComplete(makeProduct())).toBe(0);
  });

  it('computes weighted project percent', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', {
          size: 'S', // 10 pts
          allocations: [{ releaseId: 'rel-1', percentage: 100, memo: '' }],
          history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 100 }],
        }),
        makeRib('r2', { size: 'S' }), // 10 pts, 0% complete
      ])])],
    });
    // r1 is 100% of 10pts = 10pts complete, r2 is 0% = 0pts. Total 10/20 = 50%
    expect(getProjectPercentComplete(product)).toBe(50);
  });
});

// --- getCoreNonCorePointsForRelease ---
describe('getCoreNonCorePointsForRelease', () => {
  it('separates core/non-core for a release', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', { size: 'M', category: 'core', allocations: [{ releaseId: 'rel-1', percentage: 100, memo: '' }] }),
        makeRib('r2', { size: 'S', category: 'non-core', allocations: [{ releaseId: 'rel-1', percentage: 50, memo: '' }] }),
      ])])],
    });
    const { core, nonCore } = getCoreNonCorePointsForRelease(product, 'rel-1');
    expect(core).toBe(20); // M = 20 * 100%
    expect(nonCore).toBe(5); // S = 10 * 50%
  });
});

// --- getAllocationTotal ---
describe('getAllocationTotal', () => {
  it('returns 0 for no allocations', () => {
    expect(getAllocationTotal(makeRib('r1'))).toBe(0);
  });

  it('sums allocation percentages', () => {
    const rib = makeRib('r1', {
      allocations: [
        { releaseId: 'rel-1', percentage: 60, memo: '' },
        { releaseId: 'rel-2', percentage: 40, memo: '' },
      ],
    });
    expect(getAllocationTotal(rib)).toBe(100);
  });
});

// --- getSizingDistribution ---
describe('getSizingDistribution', () => {
  it('counts sized and unsized items', () => {
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', { size: 'S' }),
        makeRib('r2', { size: 'S' }),
        makeRib('r3', { size: 'M' }),
        makeRib('r4'), // unsized
      ])])],
    });
    const dist = getSizingDistribution(product);
    expect(dist['S']).toBe(2);
    expect(dist['M']).toBe(1);
    expect(dist['L']).toBe(0);
    expect(dist['Unsized']).toBe(1);
  });
});

// --- getThemeStats ---
describe('getThemeStats', () => {
  it('computes theme-level stats', () => {
    const theme = makeTheme('t1', [makeBackbone('b1', [
      makeRib('r1', { size: 'M' }),
      makeRib('r2'), // unsized
    ])]);
    const stats = getThemeStats(theme, SIZE_MAPPING);
    expect(stats.totalItems).toBe(2);
    expect(stats.totalPoints).toBe(20);
    expect(stats.unsized).toBe(1);
    expect(stats.percentComplete).toBe(0);
  });
});

// --- getBackboneStats ---
describe('getBackboneStats', () => {
  it('computes backbone-level stats', () => {
    const backbone = makeBackbone('b1', [
      makeRib('r1', {
        size: 'S',
        history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 100 }],
      }),
      makeRib('r2', { size: 'S' }),
    ]);
    const stats = getBackboneStats(backbone, SIZE_MAPPING);
    expect(stats.totalItems).toBe(2);
    expect(stats.totalPoints).toBe(20);
    expect(stats.percentComplete).toBe(50); // 10/20
    expect(stats.remainingPoints).toBe(10);
  });
});

// --- getProgressOverTime ---
describe('getProgressOverTime', () => {
  it('returns empty array for no sprints', () => {
    expect(getProgressOverTime(makeProduct())).toEqual([]);
  });

  it('returns per-sprint progress', () => {
    const rib = makeRib('r1', {
      size: 'S',
      allocations: [{ releaseId: 'rel-1', percentage: 100, memo: '' }],
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 50 },
        { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 100 },
      ],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      sprints: [
        { id: 'sp-1', name: 'Sprint 1', order: 1 },
        { id: 'sp-2', name: 'Sprint 2', order: 2 },
      ],
    });
    const data = getProgressOverTime(product);
    expect(data).toHaveLength(2);
    expect(data[0].sprintName).toBe('Sprint 1');
    expect(data[0].completedPoints).toBe(5); // 10 * 50%
    expect(data[1].completedPoints).toBe(10); // 10 * 100%
  });
});

// --- getSprintSummary ---
describe('getSprintSummary', () => {
  it('returns null for unknown sprint', () => {
    expect(getSprintSummary(makeProduct(), 'nonexistent')).toBeNull();
  });

  it('computes sprint summary', () => {
    const rib = makeRib('r1', {
      size: 'M', // 20 pts
      category: 'core',
      allocations: [{ releaseId: 'rel-1', percentage: 100, memo: '' }],
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 50 },
      ],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
      sprints: [{ id: 'sp-1', name: 'Sprint 1', order: 1 }],
    });
    const summary = getSprintSummary(product, 'sp-1');
    expect(summary.totalPoints).toBe(20);
    expect(summary.completedPoints).toBe(10);
    expect(summary.remainingPoints).toBe(10);
    expect(summary.percentComplete).toBe(50);
    expect(summary.itemsUpdated).toBe(1);
    expect(summary.itemsTotal).toBe(1);
    expect(summary.core.totalPoints).toBe(20);
    expect(summary.nonCore.totalPoints).toBe(0);
  });

  it('computes delta from previous sprint', () => {
    const rib = makeRib('r1', {
      size: 'S', // 10 pts
      allocations: [{ releaseId: 'rel-1', percentage: 100, memo: '' }],
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 30 },
        { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 80 },
      ],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'Release 1', order: 1 }],
      sprints: [
        { id: 'sp-1', name: 'Sprint 1', order: 1 },
        { id: 'sp-2', name: 'Sprint 2', order: 2 },
      ],
    });
    const summary = getSprintSummary(product, 'sp-2');
    // Sprint 2: 80% of 10pts = 8pts completed
    // Sprint 1: 30% of 10pts = 3pts completed
    // Delta: 8 - 3 = 5
    expect(summary.pointsThisSprint).toBe(5);
  });
});

// --- getReleaseProgressOverTime ---
describe('getReleaseProgressOverTime', () => {
  it('returns empty array for no sprints', () => {
    expect(getReleaseProgressOverTime(makeProduct(), 'rel-1')).toEqual([]);
  });

  it('tracks release progress across sprints', () => {
    const rib = makeRib('r1', {
      size: 'M', // 20 pts
      allocations: [{ releaseId: 'rel-1', percentage: 100, memo: '' }],
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 50 },
      ],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      sprints: [{ id: 'sp-1', name: 'Sprint 1', order: 1 }],
    });
    const data = getReleaseProgressOverTime(product, 'rel-1');
    expect(data).toHaveLength(1);
    expect(data[0].totalPoints).toBe(20);
    expect(data[0].completedPoints).toBe(10);
  });
});

// --- getRibItemPercentCompleteAsOf ---
describe('getRibItemPercentCompleteAsOf', () => {
  const sprints = [
    { id: 'sp-1', order: 1 },
    { id: 'sp-2', order: 2 },
  ];

  it('returns 0 for no history', () => {
    expect(getRibItemPercentCompleteAsOf(makeRib('r1'), 'sp-1', sprints)).toBe(0);
  });

  it('sums per-release walk-backs', () => {
    const rib = makeRib('r1', {
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 30 },
        { sprintId: 'sp-1', releaseId: 'rel-2', percentComplete: 20 },
      ],
    });
    expect(getRibItemPercentCompleteAsOf(rib, 'sp-1', sprints)).toBe(50);
  });

  it('falls back gracefully for missing sprintId', () => {
    const rib = makeRib('r1', {
      history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 42 }],
    });
    expect(getRibItemPercentCompleteAsOf(rib, null, sprints)).toBe(42);
  });
});

// --- getReleasePercentComplete with sprintId ---
describe('getReleasePercentComplete with sprint history', () => {
  const sprints = [
    { id: 'sp-1', name: 'Sprint 1', order: 1 },
    { id: 'sp-2', name: 'Sprint 2', order: 2 },
  ];

  it('uses historical walk-back when sprintId is provided', () => {
    const rib = makeRib('r1', {
      size: 'M', // 20 pts
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 40 },
        { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 80 },
      ],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints,
    });
    // As of sp-1: 40/100 = 40%
    expect(getReleasePercentComplete(product, 'rel-1', 'sp-1')).toBe(40);
    // As of sp-2: 80/100 = 80%
    expect(getReleasePercentComplete(product, 'rel-1', 'sp-2')).toBe(80);
  });

  it('handles partial allocations across releases', () => {
    const rib = makeRib('r1', {
      size: 'L', // 40 pts
      allocations: [
        { releaseId: 'rel-1', percentage: 60 },
        { releaseId: 'rel-2', percentage: 40 },
      ],
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 60 },
      ],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [
        { id: 'rel-1', name: 'R1', order: 1 },
        { id: 'rel-2', name: 'R2', order: 2 },
      ],
      sprints,
    });
    // rel-1: allocated 24pts (40*0.6), progress 60/60 = 100% of allocation
    expect(getReleasePercentComplete(product, 'rel-1', 'sp-1')).toBe(100);
    // rel-2: allocated 16pts (40*0.4), no progress → 0%
    expect(getReleasePercentComplete(product, 'rel-2', 'sp-1')).toBe(0);
  });

  it('handles zero-point ribs allocated to release', () => {
    const rib = makeRib('r1', {
      // size: null → 0 points
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 50 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints,
    });
    expect(getReleasePercentComplete(product, 'rel-1', 'sp-1')).toBe(0); // 0 allocated points
  });

  it('returns 100% when all ribs at 100% progress', () => {
    const rib = makeRib('r1', {
      size: 'S', // 10 pts
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 100 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints,
    });
    expect(getReleasePercentComplete(product, 'rel-1', 'sp-1')).toBe(100);
  });
});

// --- getSprintSummary non-core breakdown ---
describe('getSprintSummary core/nonCore breakdown', () => {
  it('correctly splits core and non-core metrics', () => {
    const coreRib = makeRib('r1', {
      size: 'M', // 20 pts
      category: 'core',
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 50 }],
    });
    const nonCoreRib = makeRib('r2', {
      size: 'S', // 10 pts
      category: 'non-core',
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 100 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [coreRib, nonCoreRib])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [{ id: 'sp-1', name: 'Sprint 1', order: 1 }],
    });

    const summary = getSprintSummary(product, 'sp-1');
    expect(summary.core.totalPoints).toBe(20);
    expect(summary.core.completedPoints).toBe(10);
    expect(summary.core.percentComplete).toBe(50);

    expect(summary.nonCore.totalPoints).toBe(10);
    expect(summary.nonCore.completedPoints).toBe(10);
    expect(summary.nonCore.percentComplete).toBe(100);

    expect(summary.totalPoints).toBe(30);
    expect(summary.itemsTotal).toBe(2);
    expect(summary.itemsUpdated).toBe(2);
  });

  it('tracks itemsUpdated vs itemsTotal correctly with mixed updates', () => {
    const updated = makeRib('r1', {
      size: 'S', category: 'core',
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 30 }],
    });
    const notUpdated = makeRib('r2', {
      size: 'M', category: 'non-core',
      allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 50 }],
    });
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [updated, notUpdated])])],
      releases: [{ id: 'rel-1', name: 'R1', order: 1 }],
      sprints: [
        { id: 'sp-1', name: 'Sprint 1', order: 1 },
        { id: 'sp-2', name: 'Sprint 2', order: 2 },
      ],
    });

    const summary = getSprintSummary(product, 'sp-2');
    expect(summary.itemsTotal).toBe(2);
    expect(summary.itemsUpdated).toBe(1); // only r1 has sp-2 entry
  });
});
