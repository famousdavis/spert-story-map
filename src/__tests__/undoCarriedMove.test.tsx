// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { moveRib2D, moveRibs2D } from '../components/storymap/mapMutations';
import { useProduct } from '../hooks/useProduct';
import { saveRibAllocations } from '../lib/progressMutations';
import { entry, makeProduct, makeRib, ribOf } from './fixtures/progressIntegrity';
import { req } from './testHelpers';

/**
 * The real undo stack, the real writers. A move has to be one `updateProduct`, and
 * has to leave the previous product intact: the stack holds that object, so a
 * writer that edited history in place would undo to the moved records.
 */

const stored = () => makeProduct([
  makeRib('r', [{ releaseId: 'X', percentage: 100, memo: 'note' }], [entry('S1', 'X', 10, 'kept'), entry('S1', 'Y', 5)]),
]);

const driver = { loadProduct: vi.fn(async () => stored()), saveProduct: vi.fn(), flushPendingSaves: vi.fn(), onProductChange: vi.fn(() => () => {}) };

vi.mock('../lib/StorageProvider', () => ({
  useStorage: () => ({ driver, mode: 'local', storageReady: true }),
}));

afterEach(cleanup);

const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter>{children}</MemoryRouter>;

async function loaded() {
  const hook = renderHook(() => useProduct('p'), { wrapper });
  await waitFor(() => expect(hook.result.current.product).not.toBeNull());
  return hook;
}

const allocationsAndHistory = (hook: Awaited<ReturnType<typeof loaded>>) => {
  const rib = ribOf(req(hook.result.current.product, 'product'), 'r');
  return { allocations: rib.releaseAllocations, history: rib.progressHistory };
};

/**
 * ⚠️ A string, not the objects. Held by reference, the "before" value is rewritten
 * by the very in-place edit this file exists to catch, and the comparison passes.
 */
const snapshot = (hook: Awaited<ReturnType<typeof loaded>>) => JSON.stringify(allocationsAndHistory(hook));

describe('undo after a carried move', () => {
  const to = { themeId: 't', backboneId: 'b', releaseId: 'Y', insertIndex: null };
  const carried = [entry('S1', 'Y', 10, 'kept'), entry('S1', 'X', 5)];

  it.each([
    ['map, single', (update: Parameters<typeof moveRib2D>[0]) => moveRib2D(update, 'r', { themeId: 't', backboneId: 'b', releaseId: 'X' }, to)],
    ['map, multi-select', (update: Parameters<typeof moveRib2D>[0]) => moveRibs2D(update, [{ ribId: 'r', fromThemeId: 't', fromBackboneId: 'b', fromReleaseId: 'X' }], to)],
    ['dialog Save', (update: Parameters<typeof moveRib2D>[0]) => update(prev => saveRibAllocations(prev, 'r', [{ releaseId: 'Y', percentage: 100 }]))],
  ])('%s: one undo restores allocations and progress together, and redo reapplies both', async (_, move) => {
    const hook = await loaded();
    const before = snapshot(hook);

    act(() => move(hook.result.current.updateProduct));
    const moved = allocationsAndHistory(hook);
    expect(moved.history).toEqual(carried);
    expect(moved.allocations.map(a => a.releaseId)).toEqual(['Y']);
    const after = snapshot(hook);

    act(() => hook.result.current.undo());
    expect(snapshot(hook)).toBe(before);

    act(() => hook.result.current.redo());
    expect(snapshot(hook)).toBe(after);
  });
});
