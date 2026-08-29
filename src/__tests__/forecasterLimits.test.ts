// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import { buildForecasterExport } from '../lib/exportForForecaster';
import { checkForecasterCompatibility, FORECASTER_LIMITS } from '../lib/forecasterLimits';
import type {
  Product, Theme, Backbone, RibItem, ReleaseAllocation, ProgressEntry, Size, Category,
} from '../types';

const SIZE_MAPPING = [{ label: 'S', points: 10 }, { label: 'M', points: 20 }];

function makeRib(id: string, { size = null, category = 'core', allocations = [], history = [] }: {
  size?: Size; category?: Category; allocations?: ReleaseAllocation[]; history?: ProgressEntry[];
} = {}): RibItem {
  return {
    id, name: `Rib ${id}`, description: '', size, category, order: 1,
    releaseAllocations: allocations, progressHistory: history,
  };
}
const makeBackbone = (id: string, ribs: RibItem[] = []): Backbone =>
  ({ id, name: `Backbone ${id}`, ribItems: ribs, order: 1 });
const makeTheme = (id: string, bbs: Backbone[] = []): Theme =>
  ({ id, name: `Theme ${id}`, backboneItems: bbs, order: 1 });

function makeProduct(overrides: Partial<Product> = {}): Product {
  return {
    id: 'prod-1', name: 'Test Product', description: '', schemaVersion: 2,
    createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z',
    sprintCadenceWeeks: 2, sizeMapping: SIZE_MAPPING,
    themes: [], releases: [], sprints: [], releaseCardOrder: {},
    ...overrides,
  };
}

/** A product with `n` releases, each carrying one sized rib, so each becomes a milestone. */
function withSizedReleases(n: number, releaseName = (i: number) => `Release ${i}`): Product {
  return makeProduct({
    themes: [makeTheme('t1', [makeBackbone('b1',
      Array.from({ length: n }, (_, i) => makeRib(`r${i}`, {
        size: 'S', allocations: [{ releaseId: `rel-${i}`, percentage: 100 }],
      })))])],
    releases: Array.from({ length: n }, (_, i) =>
      ({ id: `rel-${i}`, name: releaseName(i), order: i + 1, targetDate: null })),
    sprints: [{ id: 'sp-1', name: 'S1', order: 1, endDate: '2026-01-14' }],
  });
}

const check = (p: Product) => checkForecasterCompatibility(buildForecasterExport(p));

// ── C1 + C3: the source discriminator ────────────────────────────────────────
// C1 alone is vacuous — it proves the field is written, not that Forecaster
// reads it. C3 is the load-bearing half and it lives in Forecaster's repo
// (`isStoryMapExport`, import-utils.ts:29), which this suite cannot import
// without assuming a sibling checkout. So this asserts the exact literal that
// function tests for; brief 30's shared fixture is what closes the gap.
describe('source discriminator', () => {
  it('emits source: spert-story-map', () => {
    expect(buildForecasterExport(makeProduct()).source).toBe('spert-story-map');
  });

  it('is the exact literal isStoryMapExport() compares against', () => {
    // Guards a typo/rename: any other value re-deads Forecaster's branch.
    expect(buildForecasterExport(makeProduct()).source).toMatch(/^spert-story-map$/);
  });
});

// ── C5 + C6: milestone count, both sides of the boundary ─────────────────────
describe('milestone count', () => {
  it('accepts 10 releases carrying points', () => {
    expect(check(withSizedReleases(10))).toEqual([]);
  });

  it('blocks 11, naming both numbers', () => {
    const issues = check(withSizedReleases(11));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('11 releases');
    expect(issues[0]).toContain(`at most ${FORECASTER_LIMITS.MAX_MILESTONES} milestones`);
  });

  // The condition is MILESTONES, not releases: buildForecasterExport skips any
  // release under 0.01 points. Counting releases would block this valid file.
  it('accepts 14 releases when only 8 carry points', () => {
    const p = withSizedReleases(8);
    p.releases.push(...Array.from({ length: 6 }, (_, i) =>
      ({ id: `empty-${i}`, name: `Empty ${i}`, order: 9 + i, targetDate: null })));
    expect(p.releases).toHaveLength(14);
    expect(check(p)).toEqual([]);
  });

  it('accepts 12 releases when every rib is unsized', () => {
    const p = withSizedReleases(12);
    p.themes[0]!.backboneItems[0]!.ribItems.forEach((r) => { r.size = null; });
    expect(check(p)).toEqual([]);
  });
});

// ── C7: project name, both directions ────────────────────────────────────────
describe('project name', () => {
  it('accepts 200 characters', () => {
    expect(check(makeProduct({ name: 'N'.repeat(200) }))).toEqual([]);
  });

  it('blocks 201, naming both lengths', () => {
    const issues = check(makeProduct({ name: 'N'.repeat(201) }));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('The project name is 201 characters');
    expect(issues[0]).toContain(`limit of ${FORECASTER_LIMITS.MAX_STRING_LENGTH}`);
  });

  it('blocks an empty name', () => {
    // Reachable: SettingsView's commitName has no non-empty guard.
    expect(check(makeProduct({ name: '' }))).toEqual(['The project has no name. SPERT Forecaster requires one.']);
  });
});

// ── C8: release name, both directions, and it must say WHICH ─────────────────
describe('release name', () => {
  it('accepts 200 characters', () => {
    expect(check(withSizedReleases(1, () => 'R'.repeat(200)))).toEqual([]);
  });

  it('blocks 201 and names the offending release', () => {
    const issues = check(withSizedReleases(2, (i) => (i === 1 ? 'X'.repeat(201) : 'Fine')));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('201 characters');
    expect(issues[0]).toContain('XXX'); // the elided name identifies which one
    expect(issues[0]).not.toContain('Fine');
  });

  it('blocks an empty release name', () => {
    expect(check(withSizedReleases(1, () => ''))).toEqual([
      'A release has no name. SPERT Forecaster requires one for every milestone.',
    ]);
  });
});

// ── Negative velocity — the likeliest mismatch, and invisible at the button ──
describe('negative velocity', () => {
  const regressed = () => makeProduct({
    themes: [makeTheme('t1', [makeBackbone('b1', [
      makeRib('r1', {
        size: 'M', allocations: [{ releaseId: 'rel-1', percentage: 100 }],
        history: [
          { sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 80 },
          { sprintId: 'sp-2', releaseId: 'rel-1', percentComplete: 50 },
        ],
      }),
    ])])],
    releases: [{ id: 'rel-1', name: 'R1', order: 1, targetDate: null }],
    sprints: [
      { id: 'sp-1', name: 'S1', order: 1, endDate: '2026-01-14' },
      { id: 'sp-2', name: 'S2', order: 2, endDate: '2026-01-28' },
    ],
  });

  it('a downward revision really does produce a negative doneValue', () => {
    // Known-bad: without this the block below could pass vacuously.
    expect(buildForecasterExport(regressed()).sprints.map((s) => s.doneValue)).toEqual([16, -6]);
  });

  it('blocks it, naming the sprint and the cause', () => {
    const issues = check(regressed());
    expect(issues).toHaveLength(1);
    expect(issues[0]).toContain('Sprint 2');
    expect(issues[0]).toContain('-6 points');
    expect(issues[0]).toContain('revised downward');
  });

  it('leaves a forward-only history alone', () => {
    const p = regressed();
    p.themes[0]!.backboneItems[0]!.ribItems[0]!.progressHistory![1]!.percentComplete = 90;
    expect(check(p)).toEqual([]);
  });
});

// ── Numeric ceiling — sizeMapping.points has no upper bound in this app ──────
describe('numeric ceiling', () => {
  const big = (points: number) => makeProduct({
    sizeMapping: [{ label: 'S', points }],
    themes: [makeTheme('t1', [makeBackbone('b1', [
      makeRib('r1', { size: 'S', allocations: [{ releaseId: 'rel-1', percentage: 100 }] }),
    ])])],
    releases: [{ id: 'rel-1', name: 'R1', order: 1, targetDate: null }],
    sprints: [{ id: 'sp-1', name: 'S1', order: 1, endDate: '2026-01-14' }],
  });

  it('accepts a total at the limit', () => {
    expect(check(big(FORECASTER_LIMITS.MAX_NUMERIC_VALUE))).toEqual([]);
  });

  it('blocks a total above it, naming both numbers', () => {
    const issues = check(big(FORECASTER_LIMITS.MAX_NUMERIC_VALUE + 1));
    expect(issues.length).toBeGreaterThan(0);
    expect(issues.join(' ')).toContain('1,000,000');
    expect(issues.join(' ')).toContain('999,999');
  });
});

// ── The happy path must stay clean, or every check above is untrustworthy ────
describe('a realistic product', () => {
  it('reports nothing', () => {
    const p = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [
        makeRib('r1', {
          size: 'S', allocations: [{ releaseId: 'rel-1', percentage: 100 }],
          history: [{ sprintId: 'sp-1', releaseId: 'rel-1', percentComplete: 40 }],
        }),
        makeRib('r2', { size: 'M', allocations: [{ releaseId: 'rel-2', percentage: 100 }] }),
      ])])],
      releases: [
        { id: 'rel-1', name: 'Release One', order: 1, targetDate: null },
        { id: 'rel-2', name: 'Release Two', order: 2, targetDate: null },
      ],
      sprints: [
        { id: 'sp-1', name: 'S1', order: 1, endDate: '2026-01-14' },
        { id: 'sp-2', name: 'S2', order: 2, endDate: '2026-01-28' },
      ],
    });
    expect(check(p)).toEqual([]);
  });

  it('reports every violation at once, not just the first', () => {
    const p = withSizedReleases(11);
    p.name = '';
    const issues = check(p);
    expect(issues).toHaveLength(2);
  });
});
