// Copyright (C) 2026 William W. Davis, MSPM, PMP. All rights reserved.
// Licensed under the GNU General Public License v3.0.
// See LICENSE file in the project root for full license text.

// @vitest-environment jsdom
import { type ComponentProps } from 'react';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import RibCell from '../components/storymap/RibCell';

afterEach(cleanup);

type Cell = ComponentProps<typeof RibCell>['cell'];

const baseCell: Cell = {
  id: 'r1',
  name: 'My Rib',
  themeId: 't1',
  backboneId: 'b1',
  releaseId: 'rel-1',
  x: 0,
  y: 0,
  width: 200,
  height: 68,
  size: 'M',
  points: 3,
  category: 'core',
  isPartial: false,
  allocation: { releaseId: 'rel-1', percentage: 100, memo: '' },
  allocTotal: 100,
  // MapCell extends the rib itself, so these come with it.
  themeName: 'Theme 1',
  backboneName: 'Backbone 1',
  description: '',
  order: 1,
  releaseAllocations: [{ releaseId: 'rel-1', percentage: 100, memo: '' }],
  progressHistory: [],
};

function renderCell() {
  const onClick = vi.fn();
  const onDragStart = vi.fn();
  const onDelete = vi.fn();
  const onRename = vi.fn();
  const onSetCardColor = vi.fn();
  render(
    <RibCell
      cell={baseCell}
      onClick={onClick}
      onRename={onRename}
      onDelete={onDelete}
      onSetCardColor={onSetCardColor}
      onDragStart={onDragStart}
      isDragging={false}
      isSelected={false}
    />,
  );
  return { onClick, onDragStart, onDelete };
}

describe('RibCell gesture guards', () => {
  it('arms a drag on pointerdown over the card body (name)', () => {
    const { onDragStart } = renderCell();
    fireEvent.pointerDown(screen.getByText('My Rib'));
    expect(onDragStart).toHaveBeenCalledTimes(1);
  });

  it('does NOT arm a drag when pointerdown lands on the kebab trigger', () => {
    const { onDragStart } = renderCell();
    fireEvent.pointerDown(screen.getByLabelText('Actions for My Rib'));
    expect(onDragStart).not.toHaveBeenCalled();
  });

  it('opens the detail panel on a body click', () => {
    const { onClick } = renderCell();
    fireEvent.click(screen.getByText('My Rib'));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does NOT open the detail panel when the kebab trigger is clicked, and the menu actually opens', () => {
    const { onClick } = renderCell();
    fireEvent.click(screen.getByLabelText('Actions for My Rib'));
    expect(onClick).not.toHaveBeenCalled();
    expect(screen.getByRole('menu')).toBeTruthy();
  });

  it('deletes via the kebab menu without opening the detail panel', () => {
    const { onClick, onDelete } = renderCell();
    fireEvent.click(screen.getByLabelText('Actions for My Rib'));
    fireEvent.click(screen.getByText('Delete…'));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onClick).not.toHaveBeenCalled();
  });
});
