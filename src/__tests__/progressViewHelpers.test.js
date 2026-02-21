import { describe, it, expect } from 'vitest';
import {
  getCommentCount, getCommentHistory,
  getSprintPct, getCurrentPct, getDelta,
} from '../lib/progressViewHelpers';

const makeRib = (progressHistory = []) => ({
  id: 'rib1',
  progressHistory,
  releaseAllocations: [{ releaseId: 'r1', percentage: 50 }],
});

describe('getCommentCount', () => {
  it('returns 0 when no progressHistory', () => {
    expect(getCommentCount({ id: 'r' }, 'r1')).toBe(0);
  });

  it('counts comments for a specific release', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', comment: 'hello' },
      { releaseId: 'r1', sprintId: 's2', comment: '' },
      { releaseId: 'r1', sprintId: 's3', comment: 'world' },
      { releaseId: 'r2', sprintId: 's1', comment: 'other' },
    ]);
    expect(getCommentCount(rib, 'r1')).toBe(2);
  });

  it('counts all comments when releaseId is null', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', comment: 'a' },
      { releaseId: 'r2', sprintId: 's2', comment: 'b' },
      { releaseId: 'r1', sprintId: 's3' },
    ]);
    expect(getCommentCount(rib, null)).toBe(2);
  });
});

describe('getCommentHistory', () => {
  const sprintNameMap = { s1: 'Sprint 1', s2: 'Sprint 2', s3: 'Sprint 3' };
  const sprintOrder = { s1: 1, s2: 2, s3: 3 };

  it('returns empty array when no progressHistory', () => {
    expect(getCommentHistory({ id: 'r' }, 'r1', sprintNameMap, sprintOrder)).toEqual([]);
  });

  it('returns comments sorted newest-first by sprint order', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', comment: 'first', percentComplete: 10 },
      { releaseId: 'r1', sprintId: 's3', comment: 'third', percentComplete: 30 },
      { releaseId: 'r1', sprintId: 's2', comment: 'second', percentComplete: 20 },
    ]);
    const result = getCommentHistory(rib, 'r1', sprintNameMap, sprintOrder);
    expect(result).toHaveLength(3);
    expect(result[0].sprintName).toBe('Sprint 3');
    expect(result[1].sprintName).toBe('Sprint 2');
    expect(result[2].sprintName).toBe('Sprint 1');
  });

  it('filters by releaseId', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', comment: 'yes' },
      { releaseId: 'r2', sprintId: 's2', comment: 'no' },
    ]);
    const result = getCommentHistory(rib, 'r1', sprintNameMap, sprintOrder);
    expect(result).toHaveLength(1);
    expect(result[0].comment).toBe('yes');
  });

  it('returns all comments when releaseId is null', () => {
    const rib = makeRib([
      { releaseId: 'r1', sprintId: 's1', comment: 'a' },
      { releaseId: 'r2', sprintId: 's2', comment: 'b' },
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
  const sprint = { id: 's2', order: 2, name: 'Sprint 2' };
  const prevSprint = { id: 's1', order: 1, name: 'Sprint 1' };

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
