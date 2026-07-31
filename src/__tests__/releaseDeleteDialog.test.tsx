// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import ReleaseColumn from '../components/releases/ReleaseColumn';
import type { Product, Release } from '../types';

afterEach(cleanup);

/**
 * Guards the v0.49.24 fix: ConfirmDialog renders <Modal open={open}> and Modal
 * returns null when open is falsy. ReleaseColumn omitted `open` entirely, so
 * clicking Delete on a release column set state and rendered nothing — the
 * release could never be deleted from the Release Planning board.
 */
const release: Release = {
  id: 'rel-1', name: 'Release 1', description: '', order: 1, targetDate: null,
};

const product = {
  id: 'p1',
  name: 'P',
  description: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  schemaVersion: 2,
  sizeMapping: [{ label: 'M', points: 3 }],
  releases: [release],
  sprints: [],
  sprintCadenceWeeks: 2,
  themes: [],
  releaseCardOrder: {},
} as unknown as Product;

function renderColumn(onDeleteRelease = vi.fn()) {
  render(
    <ReleaseColumn
      colId="rel-1"
      release={release}
      ribs={[]}
      stats={{ totalPts: 0, core: 0, nonCore: 0 }}
      product={product}
      dragRibId={null}
      dropTarget={null}
      onColumnDrop={vi.fn()}
      onCardDragStart={vi.fn()}
      onCardDragEnd={vi.fn()}
      onCardDragOver={vi.fn()}
      onCardDrop={vi.fn()}
      onCardClick={vi.fn()}
      onDeleteRelease={onDeleteRelease}
    />
  );
  return onDeleteRelease;
}

describe('ReleaseColumn delete confirmation', () => {
  it('shows the confirmation dialog when Delete is clicked', () => {
    renderColumn();
    expect(screen.queryByText('Delete "Release 1"?')).toBeNull();

    fireEvent.click(screen.getByText('Delete'));

    // Before the fix this found nothing — Modal short-circuited on open=undefined.
    expect(screen.getByText('Delete "Release 1"?')).toBeTruthy();
    expect(screen.getByText('This release will be permanently removed.')).toBeTruthy();
  });

  it('deletes the release when the dialog is confirmed', () => {
    const onDeleteRelease = renderColumn();
    fireEvent.click(screen.getByText('Delete'));

    // The dialog's own Delete button is the confirm action (the column's
    // trigger also reads "Delete", so take the last match).
    const buttons = screen.getAllByRole('button', { name: 'Delete' });
    fireEvent.click(buttons[buttons.length - 1]!);

    expect(onDeleteRelease).toHaveBeenCalledWith('rel-1');
  });

  it('dismisses without deleting when cancelled', () => {
    const onDeleteRelease = renderColumn();
    fireEvent.click(screen.getByText('Delete'));
    fireEvent.click(screen.getByText('Cancel'));

    expect(onDeleteRelease).not.toHaveBeenCalled();
    expect(screen.queryByText('Delete "Release 1"?')).toBeNull();
  });
});
