// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * Fixture products for the Forecaster export contract.
 *
 * Every product here sets `createdAt` and `updatedAt` EXPLICITLY. Both fall back
 * to `new Date()` inside `buildForecasterExport` when the product omits them,
 * which would make the built payload non-deterministic and the committed
 * fixtures unstable.
 *
 * `exportedAt` is the ONLY remaining non-determinism — measured, not assumed.
 * `normaliseExport` strips exactly that field and nothing else.
 *
 * These are also the payloads a future Forecaster-side consumer would run
 * through its real validator, which is why the boundary cases come in PAIRS:
 * at the limit (must be produced) and one past it (must be blocked). A
 * one-sided case passes just as happily with the limit set wrong.
 */
import type {
  Product, Theme, Backbone, RibItem, ReleaseAllocation, ProgressEntry, Size, Category,
} from '../../types';

export const FIXTURE_SIZE_MAPPING = [
  { label: 'S', points: 10 },
  { label: 'M', points: 20 },
  { label: 'L', points: 40 },
];

export function makeRib(
  id: string,
  { size = null, category = 'core', allocations = [], history = [] }: {
    size?: Size; category?: Category;
    allocations?: ReleaseAllocation[]; history?: ProgressEntry[];
  } = {},
): RibItem {
  return {
    id, name: `Rib ${id}`, description: '', size, category, order: 1,
    releaseAllocations: allocations, progressHistory: history,
  };
}

export const makeBackbone = (id: string, ribItems: RibItem[] = []): Backbone =>
  ({ id, name: `Backbone ${id}`, ribItems, order: 1 });

export const makeTheme = (id: string, backboneItems: Backbone[] = []): Theme =>
  ({ id, name: `Theme ${id}`, backboneItems, order: 1 });

/** Fixed timestamps — see the file comment. */
export function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-fixture', name: 'Fixture Product', description: '', schemaVersion: 2,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
    sprintCadenceWeeks: 2, sizeMapping: FIXTURE_SIZE_MAPPING,
    themes: [], releases: [], sprints: [], releaseCardOrder: {},
    ...overrides,
  };
}

/** `n` releases, each with one sized rib, so each becomes a milestone. */
export function withSizedReleases(n: number, name: (i: number) => string = (i) => `Release ${i + 1}`): Product {
  return makeProduct({
    themes: [makeTheme('t1', [makeBackbone('b1',
      Array.from({ length: n }, (_, i) => makeRib(`r${i}`, {
        size: 'S', allocations: [{ releaseId: `rel-${i}`, percentage: 100 }],
      })))])],
    releases: Array.from({ length: n }, (_, i) =>
      ({ id: `rel-${i}`, name: name(i), order: i + 1, targetDate: null })),
    sprints: [{ id: 'sp-1', name: 'Sprint 1', order: 1, endDate: '2026-01-14' }],
  });
}

/**
 * The canonical product: 3 ribs across 2 releases, progress over 4 dated sprints.
 * This is the one pinned as a committed JSON fixture.
 */
export const CANONICAL_PRODUCT: Product = makeProduct({
  themes: [makeTheme('t1', [makeBackbone('b1', [
    makeRib('r1', {
      size: 'S', allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [
        { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 25 },
        { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 60 },
        { sprintId: 'sp-4', releaseId: 'rel-1', percentComplete: 100 },
      ],
    }),
    makeRib('r2', {
      size: 'M', allocations: [{ releaseId: 'rel-1', percentage: 100 }],
      history: [
        { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 10 },
        { sprintId: 'sp-3', releaseId: 'rel-1', percentComplete: 45 },
      ],
    }),
    makeRib('r3', {
      size: 'L', allocations: [{ releaseId: 'rel-2', percentage: 100 }],
      history: [{ sprintId: 'sp-4', releaseId: 'rel-2', percentComplete: 30 }],
    }),
  ])])],
  releases: [
    { id: 'rel-1', name: 'Release One', order: 1, targetDate: null },
    { id: 'rel-2', name: 'Release Two', order: 2, targetDate: null },
  ],
  sprints: [
    { id: 'sp-1', name: 'Sprint 1', order: 1, endDate: '2026-01-14' },
    { id: 'sp-2', name: 'Sprint 2', order: 2, endDate: '2026-01-28' },
    { id: 'sp-3', name: 'Sprint 3', order: 3, endDate: '2026-02-11' },
    { id: 'sp-4', name: 'Sprint 4', order: 4, endDate: '2026-02-25' },
  ],
});

/**
 * Strip the ONLY non-deterministic field. Returns a deep clone.
 *
 * Deliberately narrow: an over-broad normalisation hides real drift. A test
 * asserts that this removes `exportedAt` and touches nothing else.
 */
export function normaliseExport(data: unknown): Record<string, unknown> {
  const clone = JSON.parse(JSON.stringify(data)) as Record<string, unknown>;
  delete clone.exportedAt;
  return clone;
}

/**
 * Boundary PAIRS. `at` must export cleanly; `over` must be blocked, and the
 * message must name `names`.
 */
export const BOUNDARY_PAIRS: ReadonlyArray<{
  readonly row: string;
  readonly label: string;
  readonly at: () => Product;
  readonly over: () => Product;
  readonly names: readonly string[];
}> = [
  {
    row: 'F14', label: 'milestone count',
    at: () => withSizedReleases(10),
    over: () => withSizedReleases(11),
    names: ['11', '10'],
  },
  {
    row: 'F08', label: 'project name length',
    at: () => makeProduct({ ...CANONICAL_PRODUCT, name: 'N'.repeat(200) }),
    over: () => makeProduct({ ...CANONICAL_PRODUCT, name: 'N'.repeat(201) }),
    names: ['201', '200'],
  },
  {
    row: 'F19', label: 'release name length',
    at: () => withSizedReleases(1, () => 'R'.repeat(200)),
    over: () => withSizedReleases(1, () => 'R'.repeat(201)),
    names: ['201', '200'],
  },
  {
    row: 'F20', label: 'milestone backlogSize ceiling',
    at: () => bigPoints(999999),
    over: () => bigPoints(1000000),
    names: ['1,000,000', '999,999'],
  },
  {
    row: 'F29', label: 'sprint velocity floor',
    at: () => revisedProgress(60),
    over: () => revisedProgress(50),
    names: ['Sprint 2'],
  },
];

/** One rib whose single size carries `points`, allocated to one release. */
function bigPoints(points: number): Product {
  return makeProduct({
    sizeMapping: [{ label: 'S', points }],
    themes: [makeTheme('t1', [makeBackbone('b1', [
      makeRib('r1', { size: 'S', allocations: [{ releaseId: 'rel-1', percentage: 100 }] }),
    ])])],
    releases: [{ id: 'rel-1', name: 'Release One', order: 1, targetDate: null }],
    sprints: [{ id: 'sp-1', name: 'Sprint 1', order: 1, endDate: '2026-01-14' }],
  });
}

/**
 * A rib at 55% in sprint 1, then `second` in sprint 2. `second` below 55
 * produces a negative delta — i.e. negative velocity — which Forecaster rejects.
 */
function revisedProgress(second: number): Product {
  return makeProduct({
    themes: [makeTheme('t1', [makeBackbone('b1', [
      makeRib('r1', {
        size: 'M', allocations: [{ releaseId: 'rel-1', percentage: 100 }],
        history: [
          { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 55 },
          { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: second },
        ],
      }),
    ])])],
    releases: [{ id: 'rel-1', name: 'Release One', order: 1, targetDate: null }],
    sprints: [
      { id: 'sp-1', name: 'Sprint 1', order: 1, endDate: '2026-01-14' },
      { id: 'sp-2', name: 'Sprint 2', order: 2, endDate: '2026-01-28' },
    ],
  });
}
