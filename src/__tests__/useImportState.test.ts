// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { Mock } from 'vitest';
import { renderHook, act, waitFor, cleanup } from '@testing-library/react';
import { useImportState } from '../hooks/useImportState';
import type { StorageDriver, Product } from '../types';

let uuidCounter = 0;
vi.stubGlobal('crypto', {
  ...globalThis.crypto,
  randomUUID: () => `uuid-${++uuidCounter}`,
});

function makeProduct(id: string, name: string): Product {
  return {
    id, name, description: '',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    schemaVersion: 2, sizeMapping: [], releases: [], sprints: [], themes: [],
  };
}

function makeDriver(overrides: Partial<StorageDriver> = {}): StorageDriver {
  return {
    mode: 'local',
    loadProductIndex: vi.fn().mockResolvedValue([]),
    loadProduct: vi.fn().mockResolvedValue(null),
    createProduct: vi.fn().mockResolvedValue(undefined),
    saveProduct: vi.fn().mockResolvedValue(undefined),
    saveProductImmediate: vi.fn().mockResolvedValue(undefined),
    replaceProduct: vi.fn().mockResolvedValue(undefined),
    deleteProduct: vi.fn().mockResolvedValue(undefined),
    loadPreferences: vi.fn().mockResolvedValue({}),
    savePreferences: vi.fn().mockResolvedValue(undefined),
    getWorkspaceId: vi.fn().mockReturnValue('ws-1'),
    onProductChange: vi.fn().mockReturnValue(() => {}),
    onSaveError: vi.fn(),
    flushPendingSaves: vi.fn(),
    cancelPendingSaves: vi.fn(),
    tearDownListeners: vi.fn(),
    listPendingInvites: vi.fn().mockResolvedValue([]),
    removeCollaborator: vi.fn().mockResolvedValue(undefined),
    revokeInvite: vi.fn().mockResolvedValue(undefined),
    resendInvite: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function makeChangeEvent(file: File) {
  return { target: { files: [file], value: '' } } as unknown as import('react').ChangeEvent<HTMLInputElement>;
}

function makeJsonFile(product: Product, name = 'test.json') {
  return new File([JSON.stringify({ ...product, schemaVersion: 2 })], name, { type: 'application/json' });
}

describe('useImportState', () => {
  let driver: StorageDriver;
  let onRefresh: Mock<() => Promise<void>>;

  beforeEach(() => {
    driver = makeDriver();
    onRefresh = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
    uuidCounter = 0;
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('starts in idle phase', () => {
    const { result } = renderHook(() => useImportState(driver, 'local', true, onRefresh));
    expect(result.current.phase.tag).toBe('idle');
  });

  it('transitions to error on invalid JSON', async () => {
    const { result } = renderHook(() => useImportState(driver, 'local', true, onRefresh));
    const event = makeChangeEvent(new File(['not json'], 'test.json'));
    await act(async () => {
      result.current.handleFileChange(event);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('error'));
  });

  it('transitions idle → preview on valid file', async () => {
    const { result } = renderHook(() => useImportState(driver, 'local', true, onRefresh));
    const event = makeChangeEvent(makeJsonFile(makeProduct('p1', 'Widget')));
    await act(async () => {
      result.current.handleFileChange(event);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('preview'));
  });

  it('cancel from preview returns to idle', async () => {
    const { result } = renderHook(() => useImportState(driver, 'local', true, onRefresh));
    const event = makeChangeEvent(makeJsonFile(makeProduct('p1', 'Widget')));
    await act(async () => {
      result.current.handleFileChange(event);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('preview'));
    act(() => result.current.handleCancel());
    expect(result.current.phase.tag).toBe('idle');
  });

  it('full success path: idle → preview → applying → done', async () => {
    const { result } = renderHook(() => useImportState(driver, 'local', true, onRefresh));
    const event = makeChangeEvent(makeJsonFile(makeProduct('p1', 'Widget')));
    await act(async () => {
      result.current.handleFileChange(event);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('preview'));
    await act(async () => {
      await result.current.handleConfirmImport();
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('done'));
    expect(driver.createProduct).toHaveBeenCalledTimes(1);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('all-skip shows done banner with skip count (not silent)', async () => {
    const existingDriver = makeDriver({
      loadProductIndex: vi.fn().mockResolvedValue([makeProduct('p1', 'Widget')]),
    });
    const { result } = renderHook(() => useImportState(existingDriver, 'local', true, onRefresh));
    const event = makeChangeEvent(makeJsonFile(makeProduct('p1', 'Widget')));
    await act(async () => {
      result.current.handleFileChange(event);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('preview'));
    await act(async () => {
      await result.current.handleConfirmImport();
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('done'));
    // Narrowing pattern: explicit assertion before destructuring, so the
    // inner expects can't silently no-op if phase isn't 'done'.
    expect(result.current.phase.tag).toBe('done');
    if (result.current.phase.tag === 'done') {
      expect(result.current.phase.outcome.skipped).toBe(1);
      expect(result.current.phase.outcome.added).toBe(0);
    }
    expect(existingDriver.createProduct).not.toHaveBeenCalled();
  });

  it('applyActiveRef is false after applyImport-level throw (no deadlock)', async () => {
    const failDriver = makeDriver({
      loadProductIndex: vi.fn()
        .mockResolvedValueOnce([])
        .mockRejectedValueOnce(new Error('Firestore timeout'))
        .mockResolvedValueOnce([]),
    });
    const { result } = renderHook(() => useImportState(failDriver, 'local', true, onRefresh));

    const event1 = makeChangeEvent(makeJsonFile(makeProduct('p1', 'Widget')));
    await act(async () => {
      result.current.handleFileChange(event1);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('preview'));

    await act(async () => {
      await result.current.handleConfirmImport();
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('error'));

    act(() => result.current.handleCancel());
    expect(result.current.phase.tag).toBe('idle');

    const event2 = makeChangeEvent(makeJsonFile(makeProduct('p2', 'Other')));
    await act(async () => {
      result.current.handleFileChange(event2);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('preview'));
  });

  it('reentrancy: double-click on Confirm produces at most one import', async () => {
    const { result } = renderHook(() => useImportState(driver, 'local', true, onRefresh));
    const event = makeChangeEvent(makeJsonFile(makeProduct('p1', 'Widget')));
    await act(async () => {
      result.current.handleFileChange(event);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('preview'));
    await act(async () => {
      void result.current.handleConfirmImport();
      void result.current.handleConfirmImport();
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('done'));
    expect(driver.createProduct).toHaveBeenCalledTimes(1);
  });

  it('cloud gate: transitions to error when cloudDataLoaded is false in cloud mode', async () => {
    const { result } = renderHook(() =>
      useImportState(driver, 'cloud', false, onRefresh),
    );
    const event = makeChangeEvent(makeJsonFile(makeProduct('p1', 'Widget')));
    await act(async () => {
      result.current.handleFileChange(event);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    expect(result.current.phase.tag).toBe('error');
    expect(driver.loadProductIndex).not.toHaveBeenCalled();
  });

  it('error phase is cleared when user picks a new valid file', async () => {
    const { result } = renderHook(() => useImportState(driver, 'local', true, onRefresh));
    const bad = makeChangeEvent(new File(['bad json'], 'bad.json'));
    await act(async () => {
      result.current.handleFileChange(bad);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('error'));
    const good = makeChangeEvent(makeJsonFile(makeProduct('p1', 'Widget')));
    await act(async () => {
      result.current.handleFileChange(good);
      // Yield to microtasks + animation frame so async chain in the hook resolves.
      await new Promise<void>(r => setTimeout(r, 0));
    });
    await waitFor(() => expect(result.current.phase.tag).toBe('preview'));
  });
});
