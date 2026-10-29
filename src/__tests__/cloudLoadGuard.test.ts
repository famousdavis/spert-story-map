// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

/**
 * `guardCloudProduct` — the shape guard on the cloud read path.
 *
 * ⚠️ THE MUST-PASS FIXTURE IS THE HALF THAT MATTERS. A guard that sets aside a
 * value an app writer can produce turns into data loss at the next save, for a
 * real user. So the first test builds the largest, oddest LEGITIMATE project the
 * writers allow — every writer-reachable value census-10 found, and several the
 * declared types do not admit — and asserts the guard changes NOTHING: no rule
 * fires and the product is deep-equal to a copy taken before. If you widen the
 * guard, add the new writer value here first.
 *
 * The hostile cases then pin one rule each: the value is reset or set aside, the
 * rule id is reported, and the rest of the project survives.
 */

import { describe, it, expect } from 'vitest';
import { guardCloudProduct } from '../lib/cloudLoadGuard';
import { getAllRibItems, getTotalProjectPoints, getProjectPercentComplete, getProgressOverTime } from '../lib/calculations';
import { computeLayout } from '../components/storymap/useMapLayout';
import type { Product } from '../types';

type Doc = Record<string, unknown>;

/** The largest legitimate project: counts at the import validator's caps. */
function legitimateProject(): Doc {
  const releases = Array.from({ length: 100 }, (_, i) => ({
    id: crypto.randomUUID(), name: i === 0 ? '' : `Release ${i}`, order: i + 1,
    description: i % 2 ? 'x'.repeat(3000) : '', targetDate: i % 3 ? null : '2026-06-30',
  }));
  const sprints = Array.from({ length: 200 }, (_, i) => ({
    id: crypto.randomUUID(), name: `Sprint ${i}`, order: i + 1, endDate: i === 0 ? null : '2026-01-14',
  }));
  const sizeMapping = Array.from({ length: 25 }, (_, i) => ({
    // SizeMappingSection persists `e.target.value` mid-edit: string points,
    // empty labels and labels past the validator's 20 are all writer-reachable.
    label: i === 0 ? '' : i === 1 ? 'L'.repeat(40) : `S${i}`,
    points: i % 4 === 0 ? String(i) : i % 4 === 1 ? '' : i,
  }));
  const ribs = Array.from({ length: 5000 }, (_, i) => {
    const rel = releases[i % 100]!.id;
    return {
      id: crypto.randomUUID(),
      name: i === 0 ? '' : i === 1 ? 'n'.repeat(5000) : `Rib ${i}`,
      description: '', order: i + 1,
      // '' is what validateProduct writes for an orphan size; an orphan label
      // is what a renamed size row leaves behind.
      size: i % 5 === 0 ? null : i % 5 === 1 ? '' : i % 5 === 2 ? 'RENAMED' : 'S3',
      category: i % 2 ? 'core' : 'non-core',
      releaseAllocations: i % 7 === 0 ? [] : [{ releaseId: rel, percentage: 100, memo: 'm'.repeat(2500) }],
      progressHistory: i % 7 === 0 ? [] : [
        { sprintId: sprints[1]!.id, releaseId: rel, percentComplete: 40, comment: 'c'.repeat(2500), updatedAt: '2026-01-14T00:00:00.000Z' },
        // comment-only entry: removeProgress / updateComment write a null %.
        { sprintId: sprints[2]!.id, releaseId: rel, percentComplete: null, comment: 'note' },
      ],
      ...(i % 3 === 0 ? { notes: '' } : {}),
      // 'amber' is a legacy palette key, migrated in memory by migrateCardColors.
      ...(i % 11 === 0 ? { cardColor: 'amber' } : {}),
    };
  });
  // A pre-v2 progress entry with no releaseId (the legacy fallback reads it).
  (ribs[3]!.progressHistory as Doc[]).push({ sprintId: sprints[3]!.id, percentComplete: 10 });
  const themes = Array.from({ length: 25 }, (_, t) => ({
    id: crypto.randomUUID(), name: `Theme ${t}`, order: t + 1,
    ...(t % 2 ? { color: 'teal' } : {}),
    backboneItems: Array.from({ length: 10 }, (_, b) => ({
      id: crypto.randomUUID(), name: `Backbone ${b}`, order: b + 1,
      ...(b % 2 ? { description: 'd' } : {}),
      ribItems: ribs.slice((t * 10 + b) * 20, (t * 10 + b + 1) * 20),
    })),
  }));
  return {
    id: 'p1', name: 'P'.repeat(2000), description: '', createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: { seconds: 1, nanoseconds: 0 }, // normalised later by normalizeUpdatedAt, not here
    schemaVersion: 2, sizeMapping, releases, sprints, themes, sprintCadenceWeeks: 4,
    // sanitizeForFirestore stores an undefined array element as null.
    releaseCardOrder: { [releases[0]!.id]: [ribs[1]!.id, null], unassigned: [] },
    sizingCardOrder: { unsized: [ribs[0]!.id], S3: [] },
    cardColorLabels: { orange: 'Needs review' },
    _originRef: 'o', _changeLog: Array.from({ length: 1200 }, (_, i) => ({ t: i, op: 'add', entity: 'rib', id: `r${i}`, seq: `${i}` })),
  };
}

describe('guardCloudProduct — must-pass: everything an app writer can produce', () => {
  it('fires no rule and changes nothing on the largest legitimate project', () => {
    const doc = legitimateProject();
    const before = structuredClone(doc);
    expect(guardCloudProduct(doc)).toEqual([]);
    expect(doc).toEqual(before);
  });

  it('turns a null text field into "" silently — null carries no text, so nothing is lost', () => {
    const doc = small();
    rib1(doc).description = null;
    rib1(doc).name = null;
    expect(guardCloudProduct(doc)).toEqual([]);
    expect(rib1(doc).description).toBe('');
    expect(rib1(doc).name).toBe('');
  });

  it('fills a missing list silently — every writer sets these, and [] loses nothing', () => {
    const doc: Doc = { id: 'p', name: 'Old', themes: [{ id: 't', name: 'T', order: 1, backboneItems: [{ id: 'b', name: 'B', order: 1, ribItems: [{ id: 'r', name: 'R' }] }] }] };
    expect(guardCloudProduct(doc)).toEqual([]);
    expect(doc.releases).toEqual([]);
    expect(doc.sprints).toEqual([]);
    expect(doc.sizeMapping).toEqual([]);
    const rib = (((doc.themes as Doc[])[0]!.backboneItems as Doc[])[0]!.ribItems as Doc[])[0]!;
    expect(rib.releaseAllocations).toEqual([]);
    expect(rib.progressHistory).toEqual([]);
  });
});

/** A small valid project the hostile cases damage one field at a time. */
function small(): Doc {
  return {
    id: 'p', name: 'Project', description: '', schemaVersion: 2,
    sizeMapping: [{ label: 'M', points: 5 }],
    releases: [{ id: 'r1', name: 'R1', order: 1, targetDate: null }],
    sprints: [{ id: 's1', name: 'S1', order: 1, endDate: null }],
    themes: [{ id: 't1', name: 'T', order: 1, backboneItems: [{ id: 'b1', name: 'B', order: 1, ribItems: [
      { id: 'k1', name: 'Rib', description: '', order: 1, size: 'M', category: 'core',
        releaseAllocations: [{ releaseId: 'r1', percentage: 100 }],
        progressHistory: [{ sprintId: 's1', releaseId: 'r1', percentComplete: 50 }] },
      { id: 'k2', name: 'Sibling', description: '', order: 2, size: 'M', category: 'core', releaseAllocations: [], progressHistory: [] },
    ] }] }],
    releaseCardOrder: { r1: ['k1'] },
    _changeLog: [{ t: 1, op: 'create' }],
  };
}
const ribs = (d: Doc) => ((((d.themes as Doc[])[0]!.backboneItems as Doc[])[0]!.ribItems) as Doc[]);
const rib1 = (d: Doc) => ribs(d)[0]!;
const HOSTILE = { evil: 'HOSTILE-VALUE' };

const cases: Array<[string, (d: Doc) => void, string, (d: Doc) => void]> = [
  ['product name is an object', d => { d.name = HOSTILE; }, 'product.name', d => expect(d.name).toBe('')],
  ['description is a number', d => { d.description = 7; }, 'product.description', d => expect(d.description).toBe('')],
  ['createdAt is an object', d => { d.createdAt = HOSTILE; }, 'product.createdAt', d => expect('createdAt' in d).toBe(false)],
  ['sprintCadenceWeeks is a string', d => { d.sprintCadenceWeeks = '3'; }, 'product.sprintCadenceWeeks', d => expect('sprintCadenceWeeks' in d).toBe(false)],
  ['themes is a number', d => { d.themes = 5; }, 'themes', d => expect(d.themes).toEqual([])],
  ['a theme is null', d => { (d.themes as unknown[]).push(null); }, 'themes', d => expect((d.themes as Doc[]).map(t => t.id)).toEqual(['t1'])],
  ['a theme id is a number', d => { (d.themes as unknown[]).push({ id: 9, name: 'x', backboneItems: [] }); }, 'themes', d => expect(d.themes).toHaveLength(1)],
  ['theme color is an object', d => { (d.themes as Doc[])[0]!.color = HOSTILE; }, 'theme.color', d => expect('color' in (d.themes as Doc[])[0]!).toBe(false)],
  ['backboneItems is a string', d => { (d.themes as Doc[])[0]!.backboneItems = 'x'; }, 'theme.backboneItems', d => expect((d.themes as Doc[])[0]!.backboneItems).toEqual([])],
  ['ribItems holds a non-object', d => { ribs(d).push(42 as unknown as Doc); }, 'backbone.ribItems', d => expect(ribs(d)).toHaveLength(2)],
  ['rib name is an object', d => { rib1(d).name = HOSTILE; }, 'rib.name', d => expect(rib1(d).name).toBe('')],
  ['rib notes is an array', d => { rib1(d).notes = ['x']; }, 'rib.notes', d => expect(rib1(d).notes).toBe('')],
  ['rib size is a number', d => { rib1(d).size = 5; }, 'rib.size', d => expect(rib1(d).size).toBeNull()],
  ['rib category is an object', d => { rib1(d).category = HOSTILE; }, 'rib.category', d => expect(rib1(d).category).toBe('core')],
  ['rib cardColor is a number', d => { rib1(d).cardColor = 3; }, 'rib.cardColor', d => expect('cardColor' in rib1(d)).toBe(false)],
  ['releaseAllocations is a number', d => { rib1(d).releaseAllocations = 5; }, 'rib.releaseAllocations', d => expect(rib1(d).releaseAllocations).toEqual([])],
  ['an allocation percentage is an object', d => { (rib1(d).releaseAllocations as Doc[]).push({ releaseId: 'r1', percentage: HOSTILE }); }, 'rib.releaseAllocations', d => expect(rib1(d).releaseAllocations).toHaveLength(1)],
  ['an allocation memo is an object', d => { (rib1(d).releaseAllocations as Doc[])[0]!.memo = HOSTILE; }, 'allocation.memo', d => expect((rib1(d).releaseAllocations as Doc[])[0]!.memo).toBe('')],
  ['progressHistory is an object', d => { rib1(d).progressHistory = HOSTILE; }, 'rib.progressHistory', d => expect(rib1(d).progressHistory).toEqual([])],
  ['a progress entry has no sprintId', d => { (rib1(d).progressHistory as Doc[]).push({ releaseId: 'r1', percentComplete: 5 }); }, 'rib.progressHistory', d => expect(rib1(d).progressHistory).toHaveLength(1)],
  ['a progress percentComplete is an object', d => { (rib1(d).progressHistory as Doc[])[0]!.percentComplete = HOSTILE; }, 'progress.percentComplete', d => expect((rib1(d).progressHistory as Doc[])[0]!.percentComplete).toBeNull()],
  ['a progress comment is a number', d => { (rib1(d).progressHistory as Doc[])[0]!.comment = 1; }, 'progress.comment', d => expect((rib1(d).progressHistory as Doc[])[0]!.comment).toBe('')],
  ['a size row label is a number', d => { (d.sizeMapping as unknown[]).push({ label: 5, points: 1 }); }, 'sizeMapping', d => expect(d.sizeMapping).toHaveLength(1)],
  ['a size row points is an object', d => { (d.sizeMapping as Doc[])[0]!.points = HOSTILE; }, 'sizeMapping.points', d => expect((d.sizeMapping as Doc[])[0]!.points).toBe(0)],
  ['a release name is an object', d => { (d.releases as Doc[])[0]!.name = HOSTILE; }, 'release.name', d => expect((d.releases as Doc[])[0]!.name).toBe('')],
  ['a release targetDate is an object', d => { (d.releases as Doc[])[0]!.targetDate = HOSTILE; }, 'release.targetDate', d => expect((d.releases as Doc[])[0]!.targetDate).toBeNull()],
  ['a sprint endDate is a number', d => { (d.sprints as Doc[])[0]!.endDate = 5; }, 'sprint.endDate', d => expect((d.sprints as Doc[])[0]!.endDate).toBeNull()],
  ['releaseCardOrder is a string', d => { d.releaseCardOrder = 'x'; }, 'releaseCardOrder', d => expect('releaseCardOrder' in d).toBe(false)],
  ['a card-order entry is a number', d => { (d.releaseCardOrder as Doc).r2 = 5; }, 'releaseCardOrder', d => expect(d.releaseCardOrder).toEqual({ r1: ['k1'] })],
  ['a cardColorLabels value is an object', d => { d.cardColorLabels = { rose: HOSTILE, sky: 'ok' }; }, 'cardColorLabels', d => expect(d.cardColorLabels).toEqual({ sky: 'ok' })],
  ['_changeLog is a number', d => { d._changeLog = 7; }, '_changeLog', d => expect(d._changeLog).toEqual([])],
];

describe('guardCloudProduct — hostile shapes are set aside, the rest loads', () => {
  it.each(cases)('%s', (_label, damage, rule, check) => {
    const doc = small();
    damage(doc);
    expect(guardCloudProduct(doc)).toContain(rule);
    check(doc);
    // The rest of the project survives: the sibling rib, if its list did.
    if (Array.isArray(doc.themes) && doc.themes.length > 0 && rule !== 'theme.backboneItems') {
      expect(ribs(doc).some(r => r.id === 'k2')).toBe(true);
    }
  });

  it('leaves every view calculation able to run after the worst damage at once', () => {
    const doc = small();
    // Every damage except those that replace a container a later one writes
    // into. Each is pinned alone above; together, nothing may throw.
    const skip = new Set([
      'themes is a number', 'backboneItems is a string', 'releaseCardOrder is a string',
      'releaseAllocations is a number', 'progressHistory is an object',
    ]);
    for (const [label, damage] of cases) if (!skip.has(label)) damage(doc);
    expect(() => guardCloudProduct(doc)).not.toThrow();
    const p = doc as unknown as Product;
    expect(() => {
      getAllRibItems(p); getTotalProjectPoints(p); getProjectPercentComplete(p); getProgressOverTime(p); computeLayout(p, []);
    }).not.toThrow();
  });

  it('cannot reach the prototype through a __proto__ key in a rebuilt record', () => {
    const doc = small();
    doc.releaseCardOrder = JSON.parse('{"__proto__": ["x"], "r1": 5}');
    guardCloudProduct(doc);
    const order = doc.releaseCardOrder as Doc;
    expect(Object.getPrototypeOf(order)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(order, '__proto__')).toBe(true);
  });

  it('never throws on junk at every level', () => {
    const junk = [null, 0, 7, '', 'x', true, [], [null], {}, { id: 3 }, HOSTILE];
    for (const j of junk) {
      for (const key of ['name', 'themes', 'releases', 'sprints', 'sizeMapping', 'releaseCardOrder', 'sizingCardOrder', 'cardColorLabels', '_changeLog']) {
        const doc = small();
        doc[key] = j;
        expect(() => guardCloudProduct(doc), `${key} = ${JSON.stringify(j)}`).not.toThrow();
      }
      const doc = small();
      Object.assign(rib1(doc), { releaseAllocations: [j], progressHistory: [j], name: j, size: j });
      expect(() => guardCloudProduct(doc)).not.toThrow();
    }
  });
});
