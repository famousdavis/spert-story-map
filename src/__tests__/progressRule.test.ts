// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

import { describe, it, expect } from 'vitest';
import {
  allocationTo, bringHereTarget, completion, currentAllocations, effectiveEntry, effectiveValue, hasCountingProgress, historyByRelease,
  latestSprintId, lockingSprintId, orderedSprints, previousSprint, progressAsOf, resolveSprintId, rowRecords, share, sharesTotal, strandedSeries,
} from '../lib/progressRule';
import type { ProgressEntry, ReleaseAllocation, Sprint } from '../types';

const sprint = (id: string, order: number): Sprint => ({ id, name: id, order, endDate: null });
const SPRINTS = [sprint('s1', 1), sprint('s2', 2), sprint('s3', 3)];
const entry = (sprintId: string, releaseId: string, percentComplete: number | null, comment = ''): ProgressEntry =>
  ({ sprintId, releaseId, percentComplete, comment });
const on = (releaseId: string, percentage = 100): ReleaseAllocation => ({ releaseId, percentage });

describe('sprint order', () => {
  it('ignores array position', () => {
    const shuffled = [sprint('s2', 2), sprint('s3', 3), sprint('s1', 1)];
    expect(orderedSprints(shuffled).map(s => s.id)).toEqual(['s1', 's2', 's3']);
    expect(latestSprintId(shuffled)).toBe('s3');
  });

  it('breaks a tie by the later array position', () => {
    expect(orderedSprints([sprint('a', 1), sprint('b', 1)]).map(s => s.id)).toEqual(['a', 'b']);
    expect(latestSprintId([sprint('a', 1), sprint('b', 1)])).toBe('b');
  });

  it('reads no sprints, and absent sprints, as none', () => {
    expect(latestSprintId([])).toBeNull();
    expect(latestSprintId(undefined)).toBeNull();
    expect(orderedSprints(undefined)).toEqual([]);
  });

  it('finds the previous sprint across a gap in `order`', () => {
    const gapped = [sprint('s1', 1), sprint('s5', 5)];
    expect(previousSprint(gapped, 's5')?.id).toBe('s1');
  });

  it('has no previous sprint for the first, an unknown sprint, or none', () => {
    expect(previousSprint(SPRINTS, 's1')).toBeNull();
    expect(previousSprint(SPRINTS, 'gone')).toBeNull();
    expect(previousSprint(SPRINTS, null)).toBeNull();
  });

  it('resolves "no sprint" to the latest and keeps an id it does not know', () => {
    expect(resolveSprintId(SPRINTS, null)).toBe('s3');
    expect(resolveSprintId(SPRINTS, undefined)).toBe('s3');
    expect(resolveSprintId(SPRINTS, 's1')).toBe('s1');
    expect(resolveSprintId(SPRINTS, 'gone')).toBe('gone');
  });
});

describe('current allocations', () => {
  it('keeps the first row per release', () => {
    const rib = { releaseAllocations: [on('r1', 30), on('r2', 20), on('r1', 70)] };
    expect(currentAllocations(rib)).toEqual([on('r1', 30), on('r2', 20)]);
    expect(allocationTo(rib, 'r1')?.percentage).toBe(30);
  });

  it('is empty for a rib with no list, and finds nothing there', () => {
    expect(currentAllocations({})).toEqual([]);
    expect(allocationTo({}, 'r1')).toBeNull();
  });

  it('counts an absent or unreadable percentage as 0', () => {
    const absent = { releaseId: 'r1' } as ReleaseAllocation;
    const text = { releaseId: 'r2', percentage: 'abc' } as unknown as ReleaseAllocation;
    expect(currentAllocations({ releaseAllocations: [absent, text] }).map(a => a.percentage)).toEqual([0, 0]);
  });

  it('reads a percentage stored as text as a number', () => {
    const text = { releaseId: 'r1', percentage: '60' } as unknown as ReleaseAllocation;
    expect(currentAllocations({ releaseAllocations: [text] })[0]?.percentage).toBe(60);
  });

  it('returns the stored row itself when it needs no repair', () => {
    const row = on('r1');
    expect(currentAllocations({ releaseAllocations: [row] })[0]).toBe(row);
  });
});

describe('effective entries', () => {
  it('is the first entry for a (release, sprint)', () => {
    const first = entry('s1', 'r1', 10);
    const rib = { progressHistory: [first, entry('s1', 'r1', 99)] };
    expect(effectiveEntry(rib, 'r1', 's1', SPRINTS)).toBe(first);
    expect(effectiveValue(rib, 'r1', 's1', SPRINTS)).toBe(10);
  });

  it('needs a sprint the product holds', () => {
    const rib = { progressHistory: [entry('gone', 'r1', 10)] };
    expect(effectiveEntry(rib, 'r1', 'gone', SPRINTS)).toBeNull();
  });

  it('has no value for a comment-only entry or an absent history', () => {
    expect(effectiveValue({ progressHistory: [entry('s1', 'r1', null, 'note')] }, 'r1', 's1', SPRINTS)).toBeNull();
    expect(effectiveValue({}, 'r1', 's1', SPRINTS)).toBeNull();
  });

  it('reads the same history differently against a different sprint list', () => {
    const rib = { progressHistory: [entry('s9', 'r1', 10)] };
    expect(effectiveValue(rib, 'r1', 's9', SPRINTS)).toBeNull();
    expect(effectiveValue(rib, 'r1', 's9', [sprint('s9', 1)])).toBe(10);
  });

  it('holds rows, so a field edited in place reads live', () => {
    const row = entry('s1', 'r1', 10);
    const rib = { progressHistory: [row] };
    expect(progressAsOf(rib, 'r1', 's1', SPRINTS)).toBe(10);
    row.percentComplete = 20;
    expect(progressAsOf(rib, 'r1', 's1', SPRINTS)).toBe(20);
  });
});

describe('progressAsOf', () => {
  const rib = {
    progressHistory: [entry('s3', 'r1', 80), entry('s1', 'r1', 20), entry('s2', 'r1', null, 'note'), entry('s1', 'r2', 5)],
  };

  it('is the effective value at the latest sprint at or before the sprint, whatever the array order', () => {
    expect(progressAsOf(rib, 'r1', 's1', SPRINTS)).toBe(20);
    expect(progressAsOf(rib, 'r1', 's3', SPRINTS)).toBe(80);
  });

  it('walks back over a null', () => {
    expect(progressAsOf(rib, 'r1', 's2', SPRINTS)).toBe(20);
  });

  it('is 0 before the first record, with no record, for no sprint and for an unknown sprint', () => {
    const later = { progressHistory: [entry('s2', 'r1', 50)] };
    expect(progressAsOf(later, 'r1', 's1', SPRINTS)).toBe(0);
    expect(progressAsOf(rib, 'r9', 's3', SPRINTS)).toBe(0);
    expect(progressAsOf(rib, 'r1', null, SPRINTS)).toBe(0);
    expect(progressAsOf(rib, 'r1', 'gone', SPRINTS)).toBe(0);
  });

  it('keeps a real 0: it is a value, so it does not walk back', () => {
    const fell = { progressHistory: [entry('s1', 'r1', 40), entry('s2', 'r1', 0)] };
    expect(progressAsOf(fell, 'r1', 's3', SPRINTS)).toBe(0);
  });

  it('skips an absent percentage', () => {
    const absent = entry('s2', 'r1', 0);
    delete (absent as Partial<ProgressEntry>).percentComplete;
    expect(progressAsOf({ progressHistory: [entry('s1', 'r1', 30), absent] }, 'r1', 's3', SPRINTS)).toBe(30);
  });

  it('finds the right value in a long series, at both ends', () => {
    const sprints = Array.from({ length: 50 }, (_, i) => sprint(`s${i}`, i));
    const history = sprints.filter((_, i) => i % 2 === 1).map((s, i) => entry(s.id, 'r1', i));
    const long = { progressHistory: history };
    expect(progressAsOf(long, 'r1', 's0', sprints)).toBe(0);
    expect(progressAsOf(long, 'r1', 's1', sprints)).toBe(0);
    expect(progressAsOf(long, 'r1', 's2', sprints)).toBe(0);
    expect(progressAsOf(long, 'r1', 's3', sprints)).toBe(1);
    expect(progressAsOf(long, 'r1', 's49', sprints)).toBe(24);
  });
});

describe('share and completion', () => {
  it('counts up to the allocation', () => {
    const rib = { progressHistory: [entry('s1', 'r1', 80)] };
    expect(share(rib, on('r1', 50), 's1', SPRINTS)).toBe(50);
    expect(share(rib, on('r1', 90), 's1', SPRINTS)).toBe(80);
  });

  it('sums current allocations only', () => {
    const rib = {
      releaseAllocations: [on('r1', 50), on('r2', 50)],
      progressHistory: [entry('s1', 'r1', 30), entry('s1', 'r2', 10), entry('s1', 'r3', 40)],
    };
    expect(completion(rib, 's1', SPRINTS)).toBe(40);
  });

  it('caps at 100 and reports the excess before the cap', () => {
    const rib = {
      releaseAllocations: [on('r1'), on('r2', 30)],
      progressHistory: [entry('s1', 'r1', 90), entry('s1', 'r2', 30)],
    };
    expect(sharesTotal(rib, 's1', SPRINTS)).toBe(120);
    expect(completion(rib, 's1', SPRINTS)).toBe(100);
  });

  it('is 0 with no allocations', () => {
    expect(completion({ progressHistory: [entry('s1', 'r1', 30)] }, 's1', SPRINTS)).toBe(0);
  });

  it('counts a rib with an absent percentage as 0, not NaN', () => {
    const rib = { releaseAllocations: [{ releaseId: 'r1' } as ReleaseAllocation], progressHistory: [entry('s1', 'r1', 30)] };
    expect(completion(rib, 's1', SPRINTS)).toBe(0);
  });
});

describe('hasCountingProgress', () => {
  it('is true for an earlier sprint even if the latest reads 0', () => {
    const rib = { releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', 10), entry('s2', 'r1', 0)] };
    expect(completion(rib, 's3', SPRINTS)).toBe(0);
    expect(hasCountingProgress(rib, SPRINTS)).toBe(true);
  });

  it('is false for a null, a 0, and a record elsewhere', () => {
    expect(hasCountingProgress({ releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', null, 'n')] }, SPRINTS)).toBe(false);
    expect(hasCountingProgress({ releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', 0)] }, SPRINTS)).toBe(false);
    expect(hasCountingProgress({ releaseAllocations: [on('r2')], progressHistory: [entry('s1', 'r1', 50)] }, SPRINTS)).toBe(false);
  });
});

describe('lockingSprintId', () => {
  it('names nothing on a rib with nothing counting', () => {
    expect(lockingSprintId({ releaseAllocations: [on('r1')], progressHistory: [] }, SPRINTS)).toBeNull();
    expect(lockingSprintId({ releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', 0), entry('s2', 'r1', null, 'n')] }, SPRINTS)).toBeNull();
    expect(lockingSprintId({}, SPRINTS)).toBeNull();
    expect(lockingSprintId({ releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', 50)] }, undefined)).toBeNull();
  });

  it('names the latest sprint above 0, in sprint order, past a 0 and whatever the array order', () => {
    const rib = { releaseAllocations: [on('r1')], progressHistory: [entry('s3', 'r1', 0), entry('s2', 'r1', 20), entry('s1', 'r1', 10)] };
    expect(lockingSprintId(rib, SPRINTS)).toBe('s2');
  });

  it('takes the latest across a split rib, in whichever allocation holds it', () => {
    const rib = { releaseAllocations: [on('r1', 50), on('r2', 50)], progressHistory: [entry('s3', 'r2', 20), entry('s1', 'r1', 10)] };
    expect(lockingSprintId(rib, SPRINTS)).toBe('s3');
    const reversed = { releaseAllocations: [on('r2', 50), on('r1', 50)], progressHistory: [entry('s3', 'r2', 20), entry('s1', 'r1', 10)] };
    expect(lockingSprintId(reversed, SPRINTS)).toBe('s3');
  });

  it('ignores a later record on a release the rib left, a shadowed duplicate and an unknown sprint', () => {
    const left = { releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', 10), entry('s3', 'r2', 90)] };
    expect(lockingSprintId(left, SPRINTS)).toBe('s1');
    const shadowed = { releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', 10), entry('s2', 'r1', 0), entry('s2', 'r1', 40)] };
    expect(lockingSprintId(shadowed, SPRINTS)).toBe('s1');
    const unknown = { releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', 10), entry('gone', 'r1', 40)] };
    expect(lockingSprintId(unknown, SPRINTS)).toBe('s1');
  });

  it('agrees with the lock', () => {
    const locked = { releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', 10), entry('s2', 'r1', 0)] };
    expect(hasCountingProgress(locked, SPRINTS)).toBe(true);
    expect(lockingSprintId(locked, SPRINTS)).toBe('s1');
  });
});

describe('rowRecords', () => {
  const ids = (entries: ProgressEntry[]) => entries.map(e => `${e.sprintId}=${e.percentComplete}`);

  it('is every record with a known sprint, on a release the rib has left, a 0 and a null included', () => {
    const rib = {
      releaseAllocations: [on('r2')],
      progressHistory: [entry('s1', 'r1', 30), entry('s2', 'r1', 0), entry('s3', 'r1', null, 'n'), entry('gone', 'r1', 50), entry('s1', 'r2', 5)],
    };
    expect(ids(rowRecords(rib, 'r1', SPRINTS))).toEqual(['s1=30', 's2=0', 's3=null']);
  });

  it('on a current allocation is only what sits behind an effective entry', () => {
    const rib = { releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', 10), entry('s1', 'r1', 30), entry('s2', 'r1', 40)] };
    expect(ids(rowRecords(rib, 'r1', SPRINTS))).toEqual(['s1=30']);
  });

  it('goes by identity: two equal entries for one pair are still one effective and one shadow', () => {
    const counting = entry('s1', 'r1', 10);
    const twin = entry('s1', 'r1', 10);
    const records = rowRecords({ releaseAllocations: [on('r1')], progressHistory: [counting, twin] }, 'r1', SPRINTS);
    expect(records).toHaveLength(1);
    expect(records[0]).toBe(twin);
  });

  it('holds both duplicates on a release the rib has left, because neither counts', () => {
    const rib = { releaseAllocations: [on('r2')], progressHistory: [entry('s1', 'r1', 10), entry('s1', 'r1', 30)] };
    expect(ids(rowRecords(rib, 'r1', SPRINTS))).toEqual(['s1=10', 's1=30']);
  });

  it('is empty on a rib with no history, and for a release it holds nothing on', () => {
    expect(rowRecords({ releaseAllocations: [on('r1')] }, 'r1', SPRINTS)).toEqual([]);
    expect(rowRecords({ progressHistory: [entry('s1', 'r1', 10)] }, 'r2', SPRINTS)).toEqual([]);
  });
});

describe('bringHereTarget', () => {
  const releases = new Set(['r1', 'r2', 'r3']);

  it('is the one current allocation', () => {
    expect(bringHereTarget({ releaseAllocations: [on('r1', 60)] }, 'r2', releases)).toEqual(on('r1', 60));
  });

  it('counts distinct releases: a repeated row is one allocation', () => {
    expect(bringHereTarget({ releaseAllocations: [on('r1', 60), on('r1', 40)] }, 'r2', releases)).toEqual(on('r1', 60));
  });

  it('is not offered to a parked rib or a split rib', () => {
    expect(bringHereTarget({ releaseAllocations: [] }, 'r2', releases)).toBeNull();
    expect(bringHereTarget({}, 'r2', releases)).toBeNull();
    expect(bringHereTarget({ releaseAllocations: [on('r1', 50), on('r3', 50)] }, 'r2', releases)).toBeNull();
  });

  it('is not offered on a 0% allocation, a deleted release, or a row of the release itself', () => {
    expect(bringHereTarget({ releaseAllocations: [on('r1', 0)] }, 'r2', releases)).toBeNull();
    expect(bringHereTarget({ releaseAllocations: [on('gone')] }, 'r2', releases)).toBeNull();
    expect(bringHereTarget({ releaseAllocations: [on('r1')] }, 'r1', releases)).toBeNull();
  });
});

describe('strandedSeries', () => {
  const releases = new Set(['r1', 'r2']);

  it('finds records on a release the rib has left, naming the sprints in sprint order', () => {
    const rib = { releaseAllocations: [on('r2')], progressHistory: [entry('s2', 'r1', 20), entry('s1', 'r1', 10)] };
    expect(strandedSeries(rib, releases, SPRINTS)).toEqual([{ releaseId: 'r1', sprintIds: ['s1', 's2'], wouldCount: 20 }]);
  });

  it('shows what would count when a series ends lower', () => {
    const rib = { releaseAllocations: [on('r2')], progressHistory: [entry('s1', 'r1', 10), entry('s2', 'r1', 0)] };
    expect(strandedSeries(rib, releases, SPRINTS)).toEqual([{ releaseId: 'r1', sprintIds: ['s1'], wouldCount: 0 }]);
  });

  it('finds a duplicate shadowed by an earlier entry on a current allocation', () => {
    const rib = { releaseAllocations: [on('r1')], progressHistory: [entry('s1', 'r1', 0), entry('s1', 'r1', 30)] };
    expect(strandedSeries(rib, releases, SPRINTS)).toEqual([{ releaseId: 'r1', sprintIds: ['s1'], wouldCount: 0 }]);
  });

  it('leaves out a counting record, a 0, a null, an unknown sprint, and a release that does not exist', () => {
    const rib = {
      releaseAllocations: [on('r1')],
      progressHistory: [entry('s1', 'r1', 50), entry('s1', 'r2', 0), entry('s2', 'r2', null, 'n'), entry('gone', 'r2', 20), entry('s1', 'r9', 20)],
    };
    expect(strandedSeries(rib, releases, SPRINTS)).toEqual([]);
  });

  it('leaves out a legacy entry, which has no release to show it against', () => {
    const legacy = { sprintId: 's1', percentComplete: 40 } as ProgressEntry;
    expect(strandedSeries({ releaseAllocations: [on('r1')], progressHistory: [legacy] }, releases, SPRINTS)).toEqual([]);
  });

  it('finds nothing on a rib with no history', () => {
    expect(strandedSeries({}, releases, SPRINTS)).toEqual([]);
  });
});

describe('historyByRelease', () => {
  it('groups in history order, and is empty for no history', () => {
    const a = entry('s1', 'r1', 1);
    const b = entry('s2', 'r1', 2);
    const groups = historyByRelease([a, entry('s1', 'r2', 3), b]);
    expect(groups.get('r1')).toEqual([a, b]);
    expect(historyByRelease(undefined).size).toBe(0);
  });
});
