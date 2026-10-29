// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import {
  getCommentCount, getCommentHistory,
  getSprintPct, getCurrentPct, getDelta,
} from '../lib/progressViewHelpers';
import type { ProgressEntry } from '../types';

// `progressHistory = []` with no annotation inferred never[], so every call
// below that passed real entries reported against it.
const makeRib = (progressHistory: ProgressEntry[] = []) => ({
  id: 'rib1',
  progressHistory,
  releaseAllocations: [{ releaseId: 'r1', percentage: 50 }],
});

describe('getCommentCount', () => {
  it('returns 0 when no progressHistory', () => {
    expect(getCommentCount({}, 'r1')).toBe(0);
  });

  it('counts comments for a specific release', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', comment: 'hello', percentComplete: null },
      { releaseId: 'r1', sprintId: 's2', comment: '', percentComplete: null },
      { releaseId: 'r1', sprintId: 's3', comment: 'world', percentComplete: null },
      { releaseId: 'r2', sprintId: 's1', comment: 'other', percentComplete: null },
    ]);
    expect(getCommentCount(rib, 'r1')).toBe(2);
  });

  it('counts all comments when releaseId is null', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', comment: 'a', percentComplete: null },
      { releaseId: 'r2', sprintId: 's2', comment: 'b', percentComplete: null },
      { releaseId: 'r1', sprintId: 's3', percentComplete: null },
    ]);
    expect(getCommentCount(rib, null)).toBe(2);
  });
});

describe('getCommentHistory', () => {
  const sprintNameMap = { s1: 'Sprint 1', s2: 'Sprint 2', s3: 'Sprint 3' };
  const sprintOrder = { s1: 1, s2: 2, s3: 3 };

  it('returns empty array when no progressHistory', () => {
    expect(getCommentHistory({}, 'r1', sprintNameMap, sprintOrder)).toEqual([]);
  });

  it('returns comments sorted newest-first by sprint order', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', comment: 'first', percentComplete: 10 },
      { releaseId: 'r1', sprintId: 's3', comment: 'third', percentComplete: 30 },
      { releaseId: 'r1', sprintId: 's2', comment: 'second', percentComplete: 20 },
    ]);
    const result = getCommentHistory(rib, 'r1', sprintNameMap, sprintOrder);
    expect(result).toHaveLength(3);
    expect(result[0]?.sprintName).toBe('Sprint 3');
    expect(result[1]?.sprintName).toBe('Sprint 2');
    expect(result[2]?.sprintName).toBe('Sprint 1');
  });

  it('filters by releaseId', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', comment: 'yes', percentComplete: null },
      { releaseId: 'r2', sprintId: 's2', comment: 'no', percentComplete: null },
    ]);
    const result = getCommentHistory(rib, 'r1', sprintNameMap, sprintOrder);
    expect(result).toHaveLength(1);
    expect(result[0]?.comment).toBe('yes');
  });

  it('returns all comments when releaseId is null', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', comment: 'a', percentComplete: null },
      { releaseId: 'r2', sprintId: 's2', comment: 'b', percentComplete: null },
    ]);
    const result = getCommentHistory(rib, null, sprintNameMap, sprintOrder);
    expect(result).toHaveLength(2);
  });
});

describe('getSprintPct', () => {
  it('returns null when no selected sprint', () => {
    expect(getSprintPct(makeRib(), 'r1', null)).toBeNull();
  });

  it('returns progress for a specific release+sprint', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', percentComplete: 40 },
      { releaseId: 'r1', sprintId: 's2', percentComplete: 60 },
    ]);
    expect(getSprintPct(rib, 'r1', 's1')).toBe(40);
  });

  it('aggregates across releases when releaseId is null', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', percentComplete: 30 },
      { releaseId: 'r2', sprintId: 's1', percentComplete: 20 },
    ]);
    expect(getSprintPct(rib, null, 's1')).toBe(50);
  });

  it('caps aggregated value at 100', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', percentComplete: 80 },
      { releaseId: 'r2', sprintId: 's1', percentComplete: 80 },
    ]);
    expect(getSprintPct(rib, null, 's1')).toBe(100);
  });

  it('returns null when no matching entries exist', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's2', percentComplete: 50 },
    ]);
    expect(getSprintPct(rib, null, 's1')).toBeNull();
  });
});

describe('getCurrentPct', () => {
  it('returns overall percent complete when no releaseId', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', percentComplete: 50 },
      { releaseId: 'r2', sprintId: 's1', percentComplete: 30 },
    ]);
    rib.releaseAllocations = [
      { releaseId: 'r1', percentage: 50 },
      { releaseId: 'r2', percentage: 50 },
    ];
    // getCurrentPct with null releaseId calls getRibItemPercentComplete
    const result = getCurrentPct(rib, null);
    expect(typeof result).toBe('number');
  });

  it('returns release-specific progress when releaseId given', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', percentComplete: 75 },
    ]);
    const result = getCurrentPct(rib, 'r1');
    expect(result).toBe(75);
  });
});

describe('getDelta', () => {
  const sprint = { id: 's2', order: 2, name: 'Sprint 2', endDate: '2026-01-28' };
  const prevSprint = { id: 's1', order: 1, name: 'Sprint 1', endDate: '2026-01-14' };

  it('returns null when no sprint', () => {
    expect(getDelta(makeRib(), 'r1', null, prevSprint, 's2')).toBeNull();
  });

  it('returns null when no prevSprint', () => {
    expect(getDelta(makeRib(), 'r1', sprint, null, 's2')).toBeNull();
  });

  it('computes delta between sprints for a release', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', percentComplete: 20 },
      { releaseId: 'r1', sprintId: 's2', percentComplete: 50 },
    ]);
    expect(getDelta(rib, 'r1', sprint, prevSprint, 's2')).toBe(30);
  });

  it('returns null when current sprint has no entry', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', percentComplete: 20 },
    ]);
    expect(getDelta(rib, 'r1', sprint, prevSprint, 's2')).toBeNull();
  });

  it('treats missing previous as 0', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's2', percentComplete: 40 },
    ]);
    expect(getDelta(rib, 'r1', sprint, prevSprint, 's2')).toBe(40);
  });
});

// W4 (v0.53.16) moved the per-release lookups here onto a grouped history
// (`historyByRelease`). These pin what the grouping must not change — and the
// whole-rib branches nothing tested before: other releases, other sprints,
// uncommented and comment-only entries must each be told apart.
describe('per-release vs whole-rib branches', () => {
  const sprint = { id: 's2', order: 2, name: 'Sprint 2', endDate: '2026-01-28' };
  const prevSprint = { id: 's1', order: 1, name: 'Sprint 1', endDate: '2026-01-14' };
  const rib = makeRib([
    { releaseId: 'r1', sprintId: 's1', percentComplete: 20, comment: 'a' },
    { releaseId: 'r2', sprintId: 's1', percentComplete: 10 },
    { releaseId: 'r2', sprintId: 's1', percentComplete: null, comment: 'note only' },
    { releaseId: 'r1', sprintId: 's2', percentComplete: 50 },
    { releaseId: 'r2', sprintId: 's2', percentComplete: 30, comment: 'b' },
    { releaseId: 'r1', sprintId: 's3', percentComplete: 90, comment: 'later' },
  ]);

  it('getSprintPct reads one release, or sums every release for the sprint', () => {
    expect(getSprintPct(rib, 'r1', 's2')).toBe(50);
    expect(getSprintPct(rib, null, 's2')).toBe(80);
    expect(getSprintPct(rib, null, 's1')).toBe(30);
  });

  it('getSprintPct is null when a sprint holds only comment-only entries', () => {
    const notes = makeRib([{ releaseId: 'r1', sprintId: 's1', percentComplete: null, comment: 'n' }]);
    expect(getSprintPct(notes, null, 's1')).toBeNull();
  });

  it('getDelta across every release: this sprint\'s sum minus the previous sprint\'s', () => {
    expect(getDelta(rib, null, sprint, prevSprint, 's2')).toBe(50);
    expect(getDelta(rib, 'r2', sprint, prevSprint, 's2')).toBe(20);
  });

  it('getDelta across every release treats a missing previous sprint as 0', () => {
    const only = makeRib([
      { releaseId: 'r1', sprintId: 's2', percentComplete: 40 },
      { releaseId: 'r2', sprintId: 's2', percentComplete: 15 },
    ]);
    expect(getDelta(only, null, sprint, prevSprint, 's2')).toBe(55);
  });

  it('getCommentHistory keeps only commented entries, per release or for the whole rib', () => {
    const order = { s1: 1, s2: 2, s3: 3 };
    expect(getCommentHistory(rib, 'r2', {}, order).map(e => e.comment)).toEqual(['b', 'note only']);
    expect(getCommentHistory(rib, null, {}, order).map(e => e.comment)).toEqual(['later', 'b', 'a', 'note only']);
    expect(getCommentHistory(rib, 'r2', {}, order)[0]?.sprintName).toBe('Unknown');
    expect(getCommentCount(rib, 'r1')).toBe(2);
  });
});
