import { describe, it, expect } from 'vitest';
import { updateProgress, removeProgress, updateComment, calculateNextSprintEndDate } from '../lib/progressMutations';

function makeProduct({ themes = [] } = {}) {
  return { themes, sizeMapping: [] };
}

function makeRib(id, progressHistory = []) {
  return {
    id,
    name: `Rib ${id}`,
    releaseAllocations: [],
    size: null,
    category: 'core',
    order: 1,
    progressHistory,
  };
}

function makeBackbone(id, ribs = []) {
  return { id, name: `Backbone ${id}`, ribItems: ribs, order: 1 };
}

function makeTheme(id, backbones = []) {
  return { id, name: `Theme ${id}`, backboneItems: backbones, order: 1 };
}

function captureProgressUpdate(mutationFn, product) {
  let result;
  const fakeUpdate = (updater) => {
    result = typeof updater === 'function' ? updater(product) : updater;
  };
  mutationFn(fakeUpdate);
  return result;
}

// --- updateProgress ---
describe('updateProgress', () => {
  it('creates a new progress entry', () => {
    const rib = makeRib('r1');
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => updateProgress(update, 'r1', 'rel-A', 'sp-1', 50),
      product,
    );

    const history = result.themes[0].backboneItems[0].ribItems[0].progressHistory;
    expect(history).toHaveLength(1);
    expect(history[0].sprintId).toBe('sp-1');
    expect(history[0].releaseId).toBe('rel-A');
    expect(history[0].percentComplete).toBe(50);
    expect(history[0].comment).toBe('');
    expect(history[0].updatedAt).toBeDefined();
  });

  it('updates an existing progress entry', () => {
    const rib = makeRib('r1', [
      { sprintId: 'sp-1', releaseId: 'rel-A', percentComplete: 30, comment: 'note', updatedAt: '2026-01-01T00:00:00.000Z' },
    ]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => updateProgress(update, 'r1', 'rel-A', 'sp-1', 75),
      product,
    );

    const history = result.themes[0].backboneItems[0].ribItems[0].progressHistory;
    expect(history).toHaveLength(1);
    expect(history[0].percentComplete).toBe(75);
    expect(history[0].comment).toBe('note'); // preserved
  });

  it('does nothing when sprintId is falsy', () => {
    let called = false;
    const fakeUpdate = () => { called = true; };
    updateProgress(fakeUpdate, 'r1', 'rel-A', null, 50);
    expect(called).toBe(false);
  });

  it('does not modify other ribs', () => {
    const r1 = makeRib('r1', [{ sprintId: 'sp-1', releaseId: 'rel-A', percentComplete: 10, comment: '' }]);
    const r2 = makeRib('r2');
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [r1, r2])])],
    });

    const result = captureProgressUpdate(
      (update) => updateProgress(update, 'r1', 'rel-A', 'sp-1', 80),
      product,
    );

    expect(result.themes[0].backboneItems[0].ribItems[1].progressHistory).toHaveLength(0);
  });
});

// --- removeProgress ---
describe('removeProgress', () => {
  it('removes an entry with no comment', () => {
    const rib = makeRib('r1', [
      { sprintId: 'sp-1', releaseId: 'rel-A', percentComplete: 50, comment: '' },
    ]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => removeProgress(update, 'r1', 'rel-A', 'sp-1'),
      product,
    );

    expect(result.themes[0].backboneItems[0].ribItems[0].progressHistory).toHaveLength(0);
  });

  it('zeros percent but preserves entry with comment', () => {
    const rib = makeRib('r1', [
      { sprintId: 'sp-1', releaseId: 'rel-A', percentComplete: 50, comment: 'keep me' },
    ]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => removeProgress(update, 'r1', 'rel-A', 'sp-1'),
      product,
    );

    const history = result.themes[0].backboneItems[0].ribItems[0].progressHistory;
    expect(history).toHaveLength(1);
    expect(history[0].percentComplete).toBeNull();
    expect(history[0].comment).toBe('keep me');
  });

  it('is a no-op when entry does not exist', () => {
    const rib = makeRib('r1');
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => removeProgress(update, 'r1', 'rel-A', 'sp-1'),
      product,
    );

    // When updater returns null, rib is unchanged
    expect(result.themes[0].backboneItems[0].ribItems[0].progressHistory).toHaveLength(0);
  });

  it('does nothing when sprintId is falsy', () => {
    let called = false;
    const fakeUpdate = () => { called = true; };
    removeProgress(fakeUpdate, 'r1', 'rel-A', '');
    expect(called).toBe(false);
  });
});

// --- updateComment ---
describe('updateComment', () => {
  it('adds a comment to existing entry', () => {
    const rib = makeRib('r1', [
      { sprintId: 'sp-1', releaseId: 'rel-A', percentComplete: 50, comment: '' },
    ]);
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => updateComment(update, 'r1', 'rel-A', 'sp-1', 'looking good'),
      product,
    );

    const history = result.themes[0].backboneItems[0].ribItems[0].progressHistory;
    expect(history).toHaveLength(1);
    expect(history[0].comment).toBe('looking good');
    expect(history[0].percentComplete).toBe(50); // preserved
  });

  it('creates an entry with null percentComplete when none exists', () => {
    const rib = makeRib('r1');
    const product = makeProduct({
      themes: [makeTheme('t1', [makeBackbone('b1', [rib])])],
    });

    const result = captureProgressUpdate(
      (update) => updateComment(update, 'r1', 'rel-A', 'sp-1', 'comment only'),
      product,
    );

    const history = result.themes[0].backboneItems[0].ribItems[0].progressHistory;
    expect(history).toHaveLength(1);
    expect(history[0].percentComplete).toBeNull();
    expect(history[0].comment).toBe('comment only');
    expect(history[0].sprintId).toBe('sp-1');
    expect(history[0].releaseId).toBe('rel-A');
  });

  it('does nothing when sprintId is falsy', () => {
    let called = false;
    const fakeUpdate = () => { called = true; };
    updateComment(fakeUpdate, 'r1', 'rel-A', null, 'test');
    expect(called).toBe(false);
  });
});

// --- calculateNextSprintEndDate ---
describe('calculateNextSprintEndDate', () => {
  it('adds cadence weeks to the last end date', () => {
    expect(calculateNextSprintEndDate('2026-01-01', 2)).toBe('2026-01-15');
  });

  it('handles single week cadence', () => {
    expect(calculateNextSprintEndDate('2026-02-01', 1)).toBe('2026-02-08');
  });

  it('handles month boundary', () => {
    expect(calculateNextSprintEndDate('2026-01-28', 1)).toBe('2026-02-04');
  });

  it('returns null when lastEndDate is falsy', () => {
    expect(calculateNextSprintEndDate(null, 2)).toBeNull();
    expect(calculateNextSprintEndDate('', 2)).toBeNull();
  });
});
