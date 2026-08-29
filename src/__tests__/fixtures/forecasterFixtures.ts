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
 * ── ⚠️ THESE FILES ARE VENDORED INTO `spert-forecaster` ─────────────────────
 * `canonical-export.json` and the twelve `boundary-*.json` payloads are copied
 * byte-for-byte into that repo, which runs them through its REAL
 * `validateImportData`. Nothing automated keeps the two copies in step — no
 * test in either repo can read the other — so `vendored-manifest.json` records
 * a SHA-256 per file, and `VENDORED_MANIFEST_SHA256` pins the manifest.
 *
 * A change to the exporter changes a payload, which changes the manifest, which
 * fails that pin. Updating the pinned constant is the moment you re-vendor.
 *
 * The pin exists because `C5` alone does not catch this. C5 asserts
 * built === committed, so regenerating BOTH the exporter and the fixture keeps
 * it green — and that co-ordinated change is the NORMAL way this contract
 * evolves, i.e. exactly when the far copy goes stale.
 *
 * The boundary cases come in PAIRS: at the limit (must export) and one past it
 * (must be blocked). A one-sided case passes just as happily with the limit set
 * wrong. Both halves are real exporter output — the `over` halves are what
 * `buildForecasterExport` produces before `downloadForecasterExport` refuses
 * them, which is what lets the far side assert its validator rejects them.
 */
import { buildForecasterExport } from '../../lib/exportForForecaster';
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

export type BuiltExport = ReturnType<typeof buildForecasterExport>;

/**
 * Boundary PAIRS. `at` must export cleanly; `over` must be blocked and name `names`.
 *
 * ⚠️ `atProof`/`atExpected` exist because asserting the at-half merely EXPORTS is
 * not enough: a half built comfortably under the limit accepts for the wrong
 * reason, and the pair is one-sided in disguise. That is not hypothetical — the
 * F29 at-half shipped in v0.52.13 at doneValue 1 when the floor is 0, and it
 * passed every check here. spert-forecaster caught it by asserting the at-halves
 * sit exactly AT the limit; this is that assertion, adopted.
 *
 * A `variant` lets one register row carry more than one pair. Both F32 pairs
 * report row 'F32', so the far side's per-row message guard still matches.
 */
export interface BoundaryPair {
  readonly row: string;
  readonly variant?: string;
  readonly label: string;
  readonly at: () => Product;
  readonly over: () => Product;
  readonly names: readonly string[];
  /** Pulls the value under test out of a BUILT at-half payload. */
  readonly atProof: (built: BuiltExport) => unknown;
  /** What `atProof` must return — the limit itself, not merely a value under it. */
  readonly atExpected: unknown;
}

/** Stable identity for a pair: the register row, plus a variant when one row has several. */
export const pairKey = (p: Pick<BoundaryPair, 'row' | 'variant'>): string =>
  p.variant ? `${p.row}-${p.variant}` : p.row;

const firstMilestone = (b: BuiltExport) =>
  (b.projects[0]?.milestones as Array<{ name: string; backlogSize: number }> | undefined)?.[0];

export const BOUNDARY_PAIRS: readonly BoundaryPair[] = [
  {
    row: 'F14', label: 'milestone count',
    at: () => withSizedReleases(10),
    over: () => withSizedReleases(11),
    names: ['11', '10'],
    atProof: (b) => (b.projects[0]?.milestones as unknown[] | undefined)?.length,
    atExpected: 10,
  },
  {
    row: 'F08', label: 'project name length',
    at: () => makeProduct({ ...CANONICAL_PRODUCT, name: 'N'.repeat(200) }),
    over: () => makeProduct({ ...CANONICAL_PRODUCT, name: 'N'.repeat(201) }),
    names: ['201', '200'],
    atProof: (b) => (b.projects[0]?.name as string | undefined)?.length,
    atExpected: 200,
  },
  {
    row: 'F19', label: 'release name length',
    at: () => withSizedReleases(1, () => 'R'.repeat(200)),
    over: () => withSizedReleases(1, () => 'R'.repeat(201)),
    names: ['201', '200'],
    atProof: (b) => firstMilestone(b)?.name.length,
    atExpected: 200,
  },
  {
    row: 'F20', label: 'milestone backlogSize ceiling',
    at: () => bigPoints(999999),
    over: () => bigPoints(1000000),
    names: ['1,000,000', '999,999'],
    atProof: (b) => firstMilestone(b)?.backlogSize,
    atExpected: 999999,
  },
  {
    // Sized but UNALLOCATED ribs: total points stay large while zero milestones
    // are emitted, so this trips F30 and CANNOT alias onto F20. The v0.52.13
    // F20-over payload happened to carry an over-cap backlogAtSprintEnd too, but
    // it throws the F20 message first — milestone validation precedes sprint
    // validation — so F30 had no payload of its own.
    row: 'F30', label: 'remaining backlog ceiling (no milestones)',
    at: () => unallocatedPoints(999999),
    over: () => unallocatedPoints(1000000),
    names: ['Sprint 1', '1,000,000', '999,999'],
    atProof: (b) => b.sprints[0]?.backlogAtSprintEnd,
    atExpected: 999999,
  },
  {
    row: 'F32', label: 'sprint end date shape',
    at: () => lastSprintEndDate('2026-01-28'),
    over: () => lastSprintEndDate('2026-13-45'),
    names: ['Sprint 2', '2026-13-45'],
    atProof: (b) => b.sprints[b.sprints.length - 1]?.sprintFinishDate,
    atExpected: '2026-01-28',
  },
  {
    // '2026-13-45' is an Invalid Date and dies at Forecaster's isNaN guard,
    // never reaching its auto-correction check. Only a non-leap Feb 29 parses
    // cleanly and then silently shifts (2027-02-29 -> 2027-03-01 UTC), so this
    // pair is the one that exercises the SECOND half of that rule. The at-half
    // is a real leap day, which is the adjacent valid value.
    row: 'F32', variant: 'leap', label: 'sprint end date calendar validity',
    at: () => lastSprintEndDate('2028-02-29'),
    over: () => lastSprintEndDate('2027-02-29'),
    names: ['Sprint 2', '2027-02-29'],
    atProof: (b) => b.sprints[b.sprints.length - 1]?.sprintFinishDate,
    atExpected: '2028-02-29',
  },
  {
    // The floor is 0, not 1. v0.52.13 shipped this at 1 and nothing here noticed.
    row: 'F29', label: 'sprint velocity floor',
    at: () => revisedProgress(55),
    over: () => revisedProgress(50),
    names: ['Sprint 2'],
    atProof: (b) => Math.min(...b.sprints.map((x) => x.doneValue)),
    atExpected: 0,
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
 * A rib at 55% in sprint 1, then `second` in sprint 2. `second` EQUAL to 55
 * gives a delta of exactly 0 — the floor. Below 55 gives negative velocity,
 * which Forecaster rejects.
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

/**
 * Two dated sprints, the SECOND carrying `endDate`. Only the last sprint's date
 * can reach the payload unparsed — every earlier one is read by `addDays` while
 * deriving the next sprint's start, which throws on a malformed value.
 */
function lastSprintEndDate(endDate: string): Product {
  return makeProduct({
    themes: [makeTheme('t1', [makeBackbone('b1', [
      makeRib('r1', { size: 'S', allocations: [{ releaseId: 'rel-1', percentage: 100 }] }),
    ])])],
    releases: [{ id: 'rel-1', name: 'Release One', order: 1, targetDate: null }],
    sprints: [
      { id: 'sp-1', name: 'Sprint 1', order: 1, endDate: '2026-01-14' },
      { id: 'sp-2', name: 'Sprint 2', order: 2, endDate },
    ],
  });
}

// ── Vendoring ───────────────────────────────────────────────────────────────

export const FIXTURE_DIR = 'src/__tests__/fixtures';
export const VENDORED_MANIFEST = `${FIXTURE_DIR}/vendored-manifest.json`;

/**
 * SHA-256 of `vendored-manifest.json`.
 *
 * ⚠️ When this fails: a vendored payload changed. Re-generate the fixtures, copy
 * all of them into `spert-forecaster/src/__tests__/fixtures/` (or wherever that
 * repo keeps them), and update this constant in the same commit. Bumping it
 * without re-vendoring silences the only signal either repo has.
 */
export const VENDORED_MANIFEST_SHA256 =
  '5d27d8dd1ed8e0aeead7f36bc72a9f0cbfa8f393e94a742e8659eed2a5ac7cd5';

export interface VendoredEntry {
  /** Register row this payload exercises, or 'canonical' for the baseline. */
  readonly row: string;
  readonly label: string;
  readonly file: string;
  /** What the far side's real `validateImportData` must do with it. */
  readonly forecasterShould: 'accept' | 'reject';
  readonly sha256: string;
}

/** Every payload vendored across, in a stable order. Drives generation AND checking. */
export function vendoredPayloads(): Array<Omit<VendoredEntry, 'sha256'> & { payload: unknown }> {
  const out: Array<Omit<VendoredEntry, 'sha256'> & { payload: unknown }> = [{
    row: 'canonical', label: 'canonical export', file: 'canonical-export.json',
    forecasterShould: 'accept',
    payload: normaliseExport(buildForecasterExport(CANONICAL_PRODUCT)),
  }];
  for (const pair of BOUNDARY_PAIRS) {
    out.push({
      row: pair.row, label: `${pair.label} — at the limit`,
      file: `boundary-${pairKey(pair)}-at.json`, forecasterShould: 'accept',
      payload: normaliseExport(buildForecasterExport(pair.at())),
    });
    out.push({
      row: pair.row, label: `${pair.label} — one past the limit`,
      file: `boundary-${pairKey(pair)}-over.json`, forecasterShould: 'reject',
      payload: normaliseExport(buildForecasterExport(pair.over())),
    });
  }
  return out;
}

/** Byte-exact serialisation. Generation and checking MUST use this one function. */
export function serialise(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

/**
 * One rib sized at `points` and allocated to NOTHING. `getPointsForRelease`
 * returns 0 for every release so no milestones are emitted at all, while
 * `getTotalProjectPoints` still counts the rib — which is what drives
 * `backlogAtSprintEnd` over the cap without any milestone being involved.
 */
function unallocatedPoints(points: number): Product {
  return makeProduct({
    sizeMapping: [{ label: 'S', points }],
    themes: [makeTheme('t1', [makeBackbone('b1', [makeRib('r1', { size: 'S' })])])],
    releases: [],
    sprints: [{ id: 'sp-1', name: 'Sprint 1', order: 1, endDate: '2026-01-14' }],
  });
}
